import type {
  AppAttrNames,
  Config,
  RumRecord,
  SpanFilter,
  SpanRecord,
  TraceBundle,
  TraceSummary,
} from "./types.js";
import { validateTraceId } from "./config.js";
import { OpenObserveClient } from "./openobserve-client.js";
import { redactRecords, redactSpans } from "./redact.js";
import { toMicrosFromSpans } from "./time.js";
import {
  buildErrorPath,
  buildSpanTree,
  computeTraceDurationUs,
  getErrorMessage,
  getSlowSpans,
  isErrorSpan,
  pickPrimaryErrorSpan,
  walkAncestorPath,
} from "./span-tree.js";

export interface ResolveTraceOptions {
  focusSpanId?: string;
  includeRumLogs?: boolean;
  redactMode?: "summary" | "full";
}

export async function resolveTrace(
  client: OpenObserveClient,
  config: Config,
  traceId: string,
  options: ResolveTraceOptions = {},
): Promise<TraceBundle> {
  const normalized = validateTraceId(traceId);
  const warnings: string[] = [];

  const {
    spans: rawSpans,
    truncated,
    timeRange,
  } = await client.fetchSpansByTraceId(normalized);

  if (rawSpans.length === 0) {
    warnings.push(`No spans found for trace_id ${normalized}`);
  }

  let rawRum: RumRecord[] = [];
  try {
    rawRum = await client.fetchRumByTraceId(normalized, timeRange);
  } catch (err) {
    warnings.push(
      `RUM fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let rawRumLogs: TraceBundle["rum_logs"];
  if (options.includeRumLogs === true && rawRum.length > 0) {
    const sessionId = rawRum.find((r) => r.session_id)?.session_id;
    if (sessionId) {
      try {
        rawRumLogs = await client.fetchRumLogsBySession(sessionId, timeRange);
      } catch (err) {
        warnings.push(
          `RUM logs fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const redactMode = options.redactMode ?? "summary";
  const spans = redactSpans(rawSpans, redactMode);
  const rum = redactRecords(rawRum, redactMode);
  const rum_logs = rawRumLogs
    ? redactRecords(rawRumLogs, redactMode)
    : undefined;
  const span_tree = buildSpanTree(spans);
  const summary = buildSummary(spans, config.attrs, truncated, rum);

  const startUs = toMicrosFromSpans(spans, "start") ?? timeRange.start_us;
  const endUs = toMicrosFromSpans(spans, "end") ?? timeRange.end_us;

  return {
    trace_id: normalized,
    focus_span_id: options.focusSpanId,
    time: {
      iso: new Date(startUs / 1_000).toISOString(),
      start_us: startUs,
      end_us: endUs,
    },
    summary,
    span_tree: {
      roots: span_tree.roots,
      edges: span_tree.edges,
      orphan_count: span_tree.orphan_count,
    },
    spans,
    rum,
    rum_logs,
    warnings,
  };
}

export function buildSummary(
  spans: SpanRecord[],
  attrs: AppAttrNames,
  truncated: boolean,
  rum: RumRecord[],
): TraceSummary {
  const errorSpans = spans.filter((s) => isErrorSpan(s, attrs));
  const primary =
    errorSpans.length > 0 ? pickPrimaryErrorSpan(errorSpans) : null;
  const error_path = buildErrorPath(spans, attrs, primary?.span_id);
  const root_error = primary ? (getErrorMessage(primary, attrs) ?? null) : null;

  const httpSpan =
    spans.find((s) => s.http_method || s.http_route || s.http_status_code) ??
    spans.find((s) => String(s.operation_name ?? "").includes("http"));

  const actorSpan = spans.find((s) => s.email || s.user_id) ?? spans[0];

  const rumRow = rum[0];
  const db_query_count = spans.filter(
    (s) =>
      s.db_statement ||
      String(s.operation_name ?? "")
        .toLowerCase()
        .includes("db"),
  ).length;

  return {
    span_count: spans.length,
    truncated,
    error_span_count: errorSpans.length,
    primary_error_span_id: primary?.span_id ?? null,
    root_error,
    error_path,
    slow_spans: getSlowSpans(spans),
    http: httpSpan
      ? {
          method: httpSpan.http_method
            ? String(httpSpan.http_method)
            : undefined,
          route: httpSpan.http_route
            ? String(httpSpan.http_route)
            : httpSpan.http_target
              ? String(httpSpan.http_target)
              : undefined,
          status: httpSpan.http_status_code
            ? String(httpSpan.http_status_code)
            : undefined,
        }
      : null,
    actor: actorSpan
      ? {
          email: actorSpan.email
            ? String(actorSpan.email)
            : rumRow?.usr_email
              ? String(rumRow.usr_email)
              : undefined,
          user_id: actorSpan.user_id
            ? String(actorSpan.user_id)
            : rumRow?.usr_id
              ? String(rumRow.usr_id)
              : undefined,
          organization_ids:
            attrs.organizationIds.trim() && actorSpan[attrs.organizationIds]
              ? String(actorSpan[attrs.organizationIds])
              : undefined,
        }
      : null,
    correlation_id: findFirstAttr(spans, attrs.correlationId),
    rum_session_id: rum.find((r) => r.session_id)?.session_id
      ? String(rum.find((r) => r.session_id)!.session_id)
      : null,
    view_url: rum.find((r) => r.view_url)?.view_url
      ? String(rum.find((r) => r.view_url)!.view_url)
      : null,
    duration_us: computeTraceDurationUs(spans),
    db_query_count,
  };
}

function findFirstAttr(spans: SpanRecord[], key: string): string | null {
  if (!key.trim()) return null;
  for (const span of spans) {
    const val = span[key];
    if (val != null && String(val).trim()) return String(val);
  }
  return null;
}

export function filterSpans(
  spans: SpanRecord[],
  filter?: SpanFilter,
  attrs?: AppAttrNames,
): SpanRecord[] {
  if (!filter) return spans;

  switch (filter) {
    case "errors":
      if (!attrs) {
        return spans.filter(
          (s) => String(s.span_status ?? "").toUpperCase() === "ERROR",
        );
      }
      return spans.filter((s) => isErrorSpan(s, attrs));
    case "http":
      return spans.filter(
        (s) =>
          s.http_method ||
          s.http_route ||
          s.http_url ||
          s.http_status_code ||
          String(s.operation_name ?? "")
            .toLowerCase()
            .includes("http"),
      );
    case "db":
      return spans.filter(
        (s) =>
          s.db_statement ||
          String(s.operation_name ?? "")
            .toLowerCase()
            .includes("db"),
      );
    case "slow": {
      const slowIds = new Set(
        getSlowSpans(spans, 10).map((entry) => entry.span_id),
      );
      return spans.filter((span) => slowIds.has(span.span_id));
    }
    default:
      return spans;
  }
}

export function getAncestorPath(
  spanId: string,
  spans: SpanRecord[],
  attrs: AppAttrNames,
): ReturnType<typeof walkAncestorPath> {
  const byId = new Map(spans.map((s) => [s.span_id, s]));
  return walkAncestorPath(spanId, byId, attrs);
}
