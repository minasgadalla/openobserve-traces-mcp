import type { Config, SpanBundle } from "./types.js";
import { validateSpanId } from "./config.js";
import { OpenObserveClient } from "./openobserve-client.js";
import { redactRecord } from "./redact.js";
import { getAncestorPath, resolveTrace } from "./trace-resolver.js";

export async function resolveSpan(
  client: OpenObserveClient,
  config: Config,
  spanId: string,
): Promise<SpanBundle> {
  const normalized = validateSpanId(spanId);
  const { span } = await client.fetchSpanById(normalized);

  if (!span?.trace_id) {
    throw new Error(
      `No span found for span_id ${normalized}. Check OPENOBSERVE_STREAM_TRACES and auth.`,
    );
  }

  const traceId = String(span.trace_id).toLowerCase();
  const bundle = await resolveTrace(client, config, traceId, {
    focusSpanId: normalized,
    redactMode: "summary",
  });

  const focusSpan =
    bundle.spans.find((s) => s.span_id === normalized) ??
    redactRecord(span, "summary");

  return {
    span_id: normalized,
    trace_id: traceId,
    span: focusSpan,
    ancestor_path: getAncestorPath(normalized, bundle.spans, config.attrs),
    trace_summary: bundle.summary,
  };
}
