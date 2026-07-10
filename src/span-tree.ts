import type {
  AppAttrNames,
  ErrorPathStep,
  SpanNode,
  SpanRecord,
} from "./types.js";
import { toMicros } from "./time.js";

const MIDDLEWARE_NOISE =
  /middleware|http\.receive|http\.send|express\.middleware/i;

export interface SpanTreeResult {
  roots: SpanNode[];
  edges: Array<{ from: string; to: string }>;
  orphan_count: number;
  orphans: SpanRecord[];
}

export function buildSpanTree(spans: SpanRecord[]): SpanTreeResult {
  const byId = new Map<string, SpanRecord>();
  for (const span of spans) {
    if (span.span_id) byId.set(span.span_id, span);
  }

  const childrenMap = new Map<string, SpanRecord[]>();
  const orphans: SpanRecord[] = [];
  const edges: Array<{ from: string; to: string }> = [];

  for (const span of spans) {
    const parentId = span.reference_parent_span_id;
    if (!parentId || !byId.has(parentId)) {
      orphans.push(span);
      continue;
    }
    const list = childrenMap.get(parentId) ?? [];
    list.push(span);
    childrenMap.set(parentId, list);
    edges.push({ from: parentId, to: span.span_id });
  }

  const roots: SpanNode[] = [];
  const rootSpans = spans.filter((s) => {
    const pid = s.reference_parent_span_id;
    return !pid || !byId.has(pid);
  });

  for (const span of rootSpans) {
    roots.push(toNode(span, childrenMap));
  }

  return {
    roots,
    edges,
    orphan_count: orphans.length,
    orphans,
  };
}

function toNode(
  span: SpanRecord,
  childrenMap: Map<string, SpanRecord[]>,
): SpanNode {
  const kids = childrenMap.get(span.span_id) ?? [];
  return {
    span_id: span.span_id,
    operation_name: span.operation_name,
    span_status: span.span_status,
    children: kids.map((c) => toNode(c, childrenMap)),
  };
}

export function getErrorMessage(
  span: SpanRecord,
  attrs: AppAttrNames,
): string | undefined {
  if (attrs.errorMessage.trim()) {
    const appMsg = span[attrs.errorMessage];
    if (typeof appMsg === "string" && appMsg.trim()) return appMsg;
  }
  const exception = span["exception.message"] ?? span["exception_message"];
  if (typeof exception === "string" && exception.trim()) return exception;
  const error = span["error.message"] ?? span["error_message"];
  if (typeof error === "string" && error.trim()) return error;
  return undefined;
}

export function isErrorSpan(span: SpanRecord, attrs: AppAttrNames): boolean {
  if (String(span.span_status ?? "").toUpperCase() === "ERROR") return true;
  if (attrs.failed.trim()) {
    const failed = span[attrs.failed];
    if (
      failed === true ||
      failed === "true" ||
      failed === 1 ||
      failed === "1"
    ) {
      return true;
    }
  }
  return Boolean(getErrorMessage(span, attrs));
}

export function toErrorPathStep(
  span: SpanRecord,
  attrs: AppAttrNames,
): ErrorPathStep {
  return {
    span_id: span.span_id,
    operation_name: String(span.operation_name ?? ""),
    span_status: String(span.span_status ?? ""),
    message: getErrorMessage(span, attrs),
    http_status_code: span.http_status_code
      ? String(span.http_status_code)
      : undefined,
  };
}

export function walkAncestorPath(
  spanId: string,
  spansById: Map<string, SpanRecord>,
  attrs: AppAttrNames,
): ErrorPathStep[] {
  const path: ErrorPathStep[] = [];
  const seen = new Set<string>();
  let current = spansById.get(spanId);

  while (current && !seen.has(current.span_id)) {
    seen.add(current.span_id);
    path.push(toErrorPathStep(current, attrs));
    const parentId = current.reference_parent_span_id;
    if (!parentId) break;
    current = spansById.get(parentId);
  }

  return path;
}

export function buildErrorPath(
  spans: SpanRecord[],
  attrs: AppAttrNames,
  focusSpanId?: string,
): ErrorPathStep[] {
  const byId = new Map(spans.map((s) => [s.span_id, s]));

  if (focusSpanId && byId.has(focusSpanId)) {
    return walkAncestorPath(focusSpanId, byId, attrs);
  }

  const errorSpans = spans.filter((s) => isErrorSpan(s, attrs));
  if (errorSpans.length === 0) return [];

  const primary = pickPrimaryErrorSpan(errorSpans);
  return walkAncestorPath(primary.span_id, byId, attrs);
}

export function pickPrimaryErrorSpan(spans: SpanRecord[]): SpanRecord {
  const handlerPattern =
    /Controller\.|Service\.|Handler\.|\.handle|\.create|\.update|\.delete/i;
  const handlers = spans.filter((s) =>
    handlerPattern.test(String(s.operation_name ?? "")),
  );
  if (handlers.length > 0) {
    return deepestSpan(handlers, spans);
  }
  return deepestSpan(spans, spans) ?? spans[0];
}

function deepestSpan(
  candidates: SpanRecord[],
  allSpans: SpanRecord[],
): SpanRecord {
  const byId = new Map(allSpans.map((s) => [s.span_id, s]));

  const depthOf = (span: SpanRecord): number => {
    let depth = 0;
    let current: SpanRecord | undefined = span;
    const seen = new Set<string>();
    while (current?.reference_parent_span_id && !seen.has(current.span_id)) {
      seen.add(current.span_id);
      depth++;
      current = byId.get(current.reference_parent_span_id);
    }
    return depth;
  };

  return [...candidates].sort((a, b) => depthOf(b) - depthOf(a))[0];
}

export function getSlowSpans(
  spans: SpanRecord[],
  limit = 5,
): Array<{ span_id: string; operation_name: string; duration_us: number }> {
  return spans
    .filter((s) => !MIDDLEWARE_NOISE.test(String(s.operation_name ?? "")))
    .map((s) => ({
      span_id: s.span_id,
      operation_name: String(s.operation_name ?? ""),
      duration_us: toDurationUs(s.duration),
    }))
    .sort((a, b) => b.duration_us - a.duration_us)
    .slice(0, limit);
}

function toDurationUs(duration: number | string | undefined): number {
  if (duration == null || duration === "") return 0;
  const n = typeof duration === "string" ? Number(duration) : duration;
  if (!Number.isFinite(n)) return 0;
  return n;
}

export function computeTraceDurationUs(spans: SpanRecord[]): number | null {
  const starts = spans
    .map((s) => toMicros(s.start_time))
    .filter((v): v is number => v != null);
  const ends = spans
    .map((s) => toMicros(s.end_time))
    .filter((v): v is number => v != null);
  if (starts.length === 0 || ends.length === 0) return null;
  return Math.max(...ends) - Math.min(...starts);
}
