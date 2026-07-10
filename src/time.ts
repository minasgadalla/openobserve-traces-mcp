/** Convert OpenObserve / OTEL timestamps to microseconds. */
export function toMicros(value: number | string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return n < 1_000_000_000_000_000 ? n * 1_000 : n;
}

export function toMicrosFromSpans(
  spans: Array<{ start_time?: number | string; end_time?: number | string }>,
  kind: "start" | "end",
): number | null {
  const key = kind === "start" ? "start_time" : "end_time";
  const values = spans
    .map((s) => toMicros(s[key]))
    .filter((v): v is number => v != null);

  if (values.length === 0) return null;
  return kind === "start" ? Math.min(...values) : Math.max(...values);
}
