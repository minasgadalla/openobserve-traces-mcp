import type {
  Config,
  OpenObserveSearchResponse,
  RumLogRecord,
  RumRecord,
  SpanRecord,
  TraceTimeRange,
} from "./types.js";
import {
  nowTimeRange,
  spanTimeRange,
  traceIdToTimeRange,
  validateSpanId,
  validateTraceId,
} from "./config.js";
import { z } from "zod";

const SPAN_COLUMNS = [
  "span_id",
  "reference_parent_span_id",
  "trace_id",
  "service_name",
  "operation_name",
  "span_status",
  "duration",
  "start_time",
  "end_time",
  "http_method",
  "http_route",
  "http_status_code",
  "http_target",
  "http_url",
  "db_statement",
  "email",
  "user_id",
] as const;

export class OpenObserveClient {
  constructor(private readonly config: Config) {}

  private spanSelectSql(): string {
    const attrs = [
      this.config.attrs.correlationId,
      this.config.attrs.errorMessage,
      this.config.attrs.failed,
      this.config.attrs.organizationIds,
    ].filter((attr) => attr.trim().length > 0);
    const cols = [...SPAN_COLUMNS, ...attrs];
    return cols.join(",\n  ");
  }

  async fetchSpansByTraceId(traceId: string): Promise<{
    spans: SpanRecord[];
    truncated: boolean;
    timeRange: TraceTimeRange;
  }> {
    const normalized = validateTraceId(traceId);
    let timeRange = traceIdToTimeRange(
      normalized,
      this.config.traceLookupWindowMinutes,
    );
    const sql = `SELECT
        ${this.spanSelectSql()}
      FROM "${this.config.streamTraces}"
      WHERE trace_id = '${normalized}'
      ORDER BY start_time`;

    const hits = await this.search(sql, timeRange, -1, "traces");
    let spans = hits.map(normalizeSpanHit).filter((h) => h.span_id);

    if (spans.length === 0) {
      const fallbackRange = nowTimeRange(this.config.spanLookupWindowHours);
      const fallbackHits = await this.search(sql, fallbackRange, -1, "traces");
      spans = fallbackHits.map(normalizeSpanHit).filter((h) => h.span_id);
      if (spans.length > 0) {
        timeRange = fallbackRange;
      }
    }

    const truncated = spans.length >= this.config.maxSpansPerTrace;
    return {
      spans: truncated ? spans.slice(0, this.config.maxSpansPerTrace) : spans,
      truncated,
      timeRange,
    };
  }

  async fetchSpanById(spanId: string): Promise<{
    span: SpanRecord | null;
    timeRange: TraceTimeRange;
  }> {
    const normalized = validateSpanId(spanId);
    const fallbackRange = nowTimeRange(this.config.spanLookupWindowHours);

    const sql = `SELECT
        ${this.spanSelectSql()}
      FROM "${this.config.streamTraces}"
      WHERE span_id = '${normalized}'
      ORDER BY start_time
      LIMIT 1`;

    let hits = await this.search(sql, fallbackRange, 1, "traces");
    let span = hits.map(normalizeSpanHit).find((h) => h.span_id) ?? null;

    if (!span) {
      return { span: null, timeRange: fallbackRange };
    }

    let timeRange = fallbackRange;
    if (span.trace_id && /^[0-9a-f]{32}$/i.test(String(span.trace_id))) {
      timeRange = traceIdToTimeRange(
        String(span.trace_id),
        this.config.traceLookupWindowMinutes,
      );
      hits = await this.search(sql, timeRange, 1, "traces");
      const refined = hits.map(normalizeSpanHit).find((h) => h.span_id) ?? null;
      if (refined) {
        span = refined;
      }
    } else {
      const fromSpan = spanTimeRange(
        span,
        this.config.traceLookupWindowMinutes,
      );
      if (fromSpan) {
        timeRange = fromSpan;
        hits = await this.search(sql, fromSpan, 1, "traces");
        const refined =
          hits.map(normalizeSpanHit).find((h) => h.span_id) ?? null;
        if (refined) {
          span = refined;
        }
      }
    }

    return { span, timeRange };
  }

  async fetchRumByTraceId(
    traceId: string,
    timeRange: TraceTimeRange,
  ): Promise<RumRecord[]> {
    const normalized = validateTraceId(traceId);
    const sql = `SELECT
      _oo_trace_id,
      _oo_span_id,
      type,
      service,
      resource_url,
      resource_method,
      resource_status_code,
      view_url,
      view_referrer,
      usr_email,
      usr_id,
      session_id,
      _timestamp
    FROM "${this.config.streamRum}"
    WHERE _oo_trace_id = '${normalized}'
    ORDER BY _timestamp`;

    const hits = await this.search(sql, timeRange, -1, "logs");
    return hits.map(normalizeRecordHit) as RumRecord[];
  }

  async fetchRumLogsBySession(
    sessionId: string,
    timeRange: TraceTimeRange,
  ): Promise<RumLogRecord[]> {
    const safeSession = sessionId.replace(/'/g, "''");
    const sql = `SELECT _timestamp, status, message, http_method, http_url, http_status_code, email
      FROM "${this.config.streamRumLogs}"
      WHERE session_id = '${safeSession}'
      ORDER BY _timestamp`;

    const hits = await this.search(sql, timeRange, -1, "logs");
    return hits.map(normalizeRecordHit) as RumLogRecord[];
  }

  private async search(
    sql: string,
    timeRange: TraceTimeRange,
    size: number,
    streamType: "traces" | "logs" | "metrics",
  ): Promise<Array<Record<string, unknown>>> {
    const url = `${this.config.url}/api/${this.config.org}/_search?type=${streamType}`;
    const body = {
      query: {
        sql,
        start_time: timeRange.start_us,
        end_time: timeRange.end_us,
        from: 0,
        size,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.config.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `OpenObserve search failed (${response.status}): ${text || response.statusText}`,
        );
      }

      const data = (await response.json()) as OpenObserveSearchResponse;
      return data.hits ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

const spanHitSchema = z
  .object({
    span_id: z.string().min(1),
    trace_id: z.string().optional(),
    reference_parent_span_id: z.string().nullable().optional(),
    operation_name: z.string().optional(),
    span_status: z.string().optional(),
    duration: z.union([z.number(), z.string()]).optional(),
    start_time: z.union([z.number(), z.string()]).optional(),
    end_time: z.union([z.number(), z.string()]).optional(),
    service_name: z.string().optional(),
  })
  .passthrough();

function extractSource(hit: Record<string, unknown>): Record<string, unknown> {
  return hit._source && typeof hit._source === "object"
    ? (hit._source as Record<string, unknown>)
    : hit;
}

function normalizeSpanHit(hit: Record<string, unknown>): SpanRecord {
  const parsed = spanHitSchema.safeParse(extractSource(hit));
  if (!parsed.success) {
    throw new Error(
      `Malformed OpenObserve span hit: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return parsed.data as SpanRecord;
}

function normalizeRecordHit(
  hit: Record<string, unknown>,
): Record<string, unknown> {
  return extractSource(hit);
}
