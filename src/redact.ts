const SENSITIVE_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "key",
  "credential",
  "card",
  "payment",
  "db_connection_string",
];

export type RedactMode = "summary" | "full";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_SUBSTRINGS.some((s) => lower.includes(s));
}

export function redactRecord<T extends Record<string, unknown>>(
  record: T,
  mode: RedactMode = "summary",
): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (
      key === "db_statement" &&
      typeof value === "string" &&
      mode === "summary"
    ) {
      out[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

export function redactSpans<T extends Record<string, unknown>>(
  spans: T[],
  mode: RedactMode = "summary",
): T[] {
  return spans.map((s) => redactRecord(s, mode));
}
