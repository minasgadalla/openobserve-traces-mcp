import { z } from "zod";
import type { Config, TraceTimeRange } from "./types.js";
import { toMicros } from "./time.js";

export const TRACE_ID_RE = /^[0-9a-f]{32}$/i;
export const SPAN_ID_RE = /^[0-9a-f]{16}$/i;

const envSchema = z.object({
  OPENOBSERVE_URL: z.string().url(),
  OPENOBSERVE_ORG: z.string().min(1).default("default"),
  OPENOBSERVE_AUTH_HEADER: z.string().min(1),
  OPENOBSERVE_STREAM_TRACES: z.string().min(1).default("default"),
  OPENOBSERVE_STREAM_RUM: z.string().min(1).default("_rumdata"),
  OPENOBSERVE_STREAM_RUM_LOGS: z.string().min(1).default("_rumlog"),
  TRACE_LOOKUP_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  SPAN_LOOKUP_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  MAX_SPANS_PER_TRACE: z.coerce.number().int().positive().default(500),
  OPENOBSERVE_ATTR_CORRELATION_ID: z.string().default(""),
  OPENOBSERVE_ATTR_ERROR_MESSAGE: z.string().default(""),
  OPENOBSERVE_ATTR_FAILED: z.string().default(""),
  OPENOBSERVE_ATTR_ORGANIZATION_IDS: z.string().default(""),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${message}`);
  }

  const e = parsed.data;
  return {
    url: e.OPENOBSERVE_URL.replace(/\/$/, ""),
    org: e.OPENOBSERVE_ORG,
    authHeader: e.OPENOBSERVE_AUTH_HEADER,
    streamTraces: e.OPENOBSERVE_STREAM_TRACES,
    streamRum: e.OPENOBSERVE_STREAM_RUM,
    streamRumLogs: e.OPENOBSERVE_STREAM_RUM_LOGS,
    traceLookupWindowMinutes: e.TRACE_LOOKUP_WINDOW_MINUTES,
    spanLookupWindowHours: e.SPAN_LOOKUP_WINDOW_HOURS,
    maxSpansPerTrace: e.MAX_SPANS_PER_TRACE,
    attrs: {
      correlationId: e.OPENOBSERVE_ATTR_CORRELATION_ID,
      errorMessage: e.OPENOBSERVE_ATTR_ERROR_MESSAGE,
      failed: e.OPENOBSERVE_ATTR_FAILED,
      organizationIds: e.OPENOBSERVE_ATTR_ORGANIZATION_IDS,
    },
  };
}

export function validateTraceId(traceId: string): string {
  if (!TRACE_ID_RE.test(traceId)) {
    throw new Error(
      `Invalid trace_id: expected 32 hex characters, got "${traceId}"`,
    );
  }
  return traceId.toLowerCase();
}

export function validateSpanId(spanId: string): string {
  if (!SPAN_ID_RE.test(spanId)) {
    throw new Error(
      `Invalid span_id: expected 16 hex characters, got "${spanId}"`,
    );
  }
  return spanId.toLowerCase();
}

/** Decode UUIDv7-style timestamp from first 12 hex chars of trace_id (milliseconds). */
export function traceIdToTimeRange(
  traceId: string,
  windowMinutes: number,
): TraceTimeRange {
  const normalized = validateTraceId(traceId);
  const tsMs = parseInt(normalized.slice(0, 12), 16);
  const windowUs = windowMinutes * 60 * 1_000_000;
  const centerUs = tsMs * 1_000;
  return {
    start_us: Math.max(0, centerUs - windowUs),
    end_us: centerUs + windowUs,
  };
}

export function nowTimeRange(windowHours: number): TraceTimeRange {
  const nowUs = Date.now() * 1_000;
  const windowUs = windowHours * 60 * 60 * 1_000_000;
  return {
    start_us: Math.max(0, nowUs - windowUs),
    end_us: nowUs + windowUs,
  };
}

export function spanTimeRange(
  span: { start_time?: number | string; end_time?: number | string },
  windowMinutes: number,
): TraceTimeRange | null {
  const start = toMicros(span.start_time);
  if (start == null) return null;
  const end = toMicros(span.end_time) ?? start;
  const windowUs = windowMinutes * 60 * 1_000_000;
  return {
    start_us: Math.max(0, start - windowUs),
    end_us: end + windowUs,
  };
}
