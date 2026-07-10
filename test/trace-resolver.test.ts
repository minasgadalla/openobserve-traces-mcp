import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Config, RumRecord, SpanRecord } from "../src/types.js";
import {
  buildSummary,
  filterSpans,
  getAncestorPath,
} from "../src/trace-resolver.js";
import { redactRecords } from "../src/redact.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures/trace-sample.json"), "utf-8"),
) as SpanRecord[];

const config: Config = {
  url: "http://localhost:5080",
  org: "default",
  authHeader: "Basic test",
  streamTraces: "app_traces",
  streamRum: "_rumdata",
  streamRumLogs: "_rumlog",
  traceLookupWindowMinutes: 30,
  spanLookupWindowHours: 24,
  maxSpansPerTrace: 500,
  attrs: {
    correlationId: "app_correlation_id",
    errorMessage: "app_activity_error_message",
    failed: "app_activity_failed",
    organizationIds: "app_organization_ids",
  },
};

const rum: RumRecord[] = [
  {
    session_id: "sess-1",
    view_url: "https://app.example.com/orders",
    _oo_trace_id: "019f4730db8d73b8a4c9b4aa3ba534a8",
    usr_email: "rum-user@example.com",
  },
];

describe("trace-resolver", () => {
  it("builds summary with error path, http, and actor", () => {
    const summary = buildSummary(fixture, config.attrs, false, rum);
    expect(summary.span_count).toBe(fixture.length);
    expect(summary.primary_error_span_id).toBe("a100000000000002");
    expect(summary.root_error).toContain("Order conflict");
    expect(summary.http?.status).toBe("409");
    expect(summary.actor?.email).toBe("user@example.com");
    expect(summary.correlation_id).toBe("corr-abc-123");
    expect(summary.rum_session_id).toBe("sess-1");
    expect(summary.error_path.length).toBeGreaterThan(0);
  });

  it("uses primary error for error_path while focus uses ancestor path", () => {
    const redactedSpans = redactRecords(fixture, "summary");
    const summary = buildSummary(redactedSpans, config.attrs, false, rum);
    const focusPath = getAncestorPath(
      "a100000000000003",
      redactedSpans,
      config.attrs,
    );

    expect(
      summary.error_path.some((s) => s.span_id === "a100000000000002"),
    ).toBe(true);
    expect(summary.error_path[0]?.span_id).not.toBe("a100000000000003");
    expect(focusPath[0].span_id).toBe("a100000000000003");
    expect(summary.actor?.email).toBe("[REDACTED]");
  });

  it("filters error spans", () => {
    const errors = filterSpans(fixture, "errors", config.attrs);
    expect(errors.every((s) => s.span_status === "ERROR")).toBe(true);
  });

  it("filters db spans", () => {
    const db = filterSpans(fixture, "db", config.attrs);
    expect(db.some((s) => s.db_statement)).toBe(true);
  });

  it("filters slow spans using middleware-aware ranking", () => {
    const slow = filterSpans(fixture, "slow", config.attrs);
    expect(slow.length).toBeGreaterThan(0);
    expect(slow.length).toBeLessThanOrEqual(10);
    expect(slow.some((s) => s.span_id === "a100000000000001")).toBe(true);
  });

  it("builds ancestor path for span", () => {
    const path = getAncestorPath("a100000000000003", fixture, config.attrs);
    expect(path[0].span_id).toBe("a100000000000003");
  });
});
