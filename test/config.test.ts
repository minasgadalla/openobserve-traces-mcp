import { describe, expect, it } from "vitest";
import {
  loadConfig,
  traceIdToTimeRange,
  validateSpanId,
  validateTraceId,
} from "../src/config.js";

describe("config", () => {
  it("validates trace_id", () => {
    expect(validateTraceId("019f4730db8d73b8a4c9b4aa3ba534a8")).toBe(
      "019f4730db8d73b8a4c9b4aa3ba534a8",
    );
    expect(() => validateTraceId("not-a-trace")).toThrow(/Invalid trace_id/);
  });

  it("validates span_id", () => {
    expect(validateSpanId("a100000000000001")).toBe("a100000000000001");
    expect(() => validateSpanId("short")).toThrow(/Invalid span_id/);
  });

  it("loads config from env", () => {
    const config = loadConfig({
      OPENOBSERVE_URL: "http://localhost:5080",
      OPENOBSERVE_AUTH_HEADER: "Basic test",
      OPENOBSERVE_STREAM_TRACES: "app_traces",
    });
    expect(config.url).toBe("http://localhost:5080");
    expect(config.streamTraces).toBe("app_traces");
    expect(config.attrs.errorMessage).toBe("");
    expect(config.attrs.correlationId).toBe("");
  });

  it("computes time window from trace_id", () => {
    const range = traceIdToTimeRange("019f4730db8d73b8a4c9b4aa3ba534a8", 30);
    expect(range.start_us).toBeLessThan(range.end_us);
    expect(range.end_us - range.start_us).toBe(30 * 60 * 1_000_000 * 2);
  });
});
