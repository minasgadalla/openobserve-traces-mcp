import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Config, SpanRecord } from "../src/types.js";
import { OpenObserveClient } from "../src/openobserve-client.js";
import { resolveSpan } from "../src/span-resolver.js";

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

describe("span-resolver", () => {
  it("resolves span_id to trace_id and ancestor path", async () => {
    const client = new OpenObserveClient(config);
    vi.spyOn(client, "fetchSpanById").mockResolvedValue({
      span: fixture.find((s) => s.span_id === "a100000000000003")!,
      timeRange: { start_us: 0, end_us: 1 },
    });
    vi.spyOn(client, "fetchSpansByTraceId").mockResolvedValue({
      spans: fixture,
      truncated: false,
      timeRange: { start_us: 0, end_us: 1 },
    });
    vi.spyOn(client, "fetchRumByTraceId").mockResolvedValue([]);

    const bundle = await resolveSpan(client, config, "a100000000000003");
    expect(bundle.trace_id).toBe("019f4730db8d73b8a4c9b4aa3ba534a8");
    expect(bundle.span.span_id).toBe("a100000000000003");
    expect(bundle.ancestor_path.length).toBeGreaterThan(0);
    expect(bundle.trace_summary.error_path.length).toBeGreaterThan(0);
  });
});
