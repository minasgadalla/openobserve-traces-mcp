import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenObserveClient } from "../src/openobserve-client.js";
import type { Config } from "../src/types.js";

const config: Config = {
  url: "http://localhost:5080",
  org: "default",
  authHeader: "Basic test",
  streamTraces: "my_traces",
  streamRum: "_rumdata",
  streamRumLogs: "_rumlog",
  traceLookupWindowMinutes: 30,
  spanLookupWindowHours: 24,
  maxSpansPerTrace: 500,
  attrs: {
    correlationId: "",
    errorMessage: "",
    failed: "",
    organizationIds: "",
  },
};

function makeSpan(id: string, extra: Record<string, unknown> = {}) {
  return {
    span_id: id,
    trace_id: "019f4730db8d73b8a4c9b4aa3ba534a8",
    operation_name: `op-${id}`,
    span_status: "OK",
    duration: 1000,
    start_time: 1740000000000000,
    end_time: 1740000000010000,
    ...extra,
  };
}

describe("OpenObserveClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries traces stream with type=traces", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("type=traces");
      return {
        ok: true,
        json: async () => ({ hits: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenObserveClient(config);
    await client.fetchSpansByTraceId("019f4730db8d73b8a4c9b4aa3ba534a8");

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=traces");
  });

  it("queries RUM with type=logs", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("type=logs");
      return {
        ok: true,
        json: async () => ({ hits: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenObserveClient(config);
    await client.fetchRumByTraceId("019f4730db8d73b8a4c9b4aa3ba534a8", {
      start_us: 0,
      end_us: 1,
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=logs");
  });

  it("fetchSpanById preserves first hit when refined search is empty", async () => {
    const span = makeSpan("a100000000000001");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: [span] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenObserveClient(config);
    const result = await client.fetchSpanById("a100000000000001");

    expect(result.span?.span_id).toBe("a100000000000001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetchSpanById rejects malformed span hits without span_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          hits: [{ operation_name: "missing-span-id" }],
        }),
      })),
    );

    const client = new OpenObserveClient(config);
    await expect(client.fetchSpanById("a100000000000001")).rejects.toThrow(
      /Malformed OpenObserve span hit/,
    );
  });

  it("fetchRumLogsBySession queries logs stream with session filter", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.query.sql).toContain("session_id = 'sess-42'");
      return {
        ok: true,
        json: async () => ({
          hits: [{ _timestamp: 1, message: "boom", session_id: "sess-42" }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenObserveClient(config);
    const logs = await client.fetchRumLogsBySession("sess-42", {
      start_us: 0,
      end_us: 1,
    });

    expect(logs).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("type=logs");
  });

  it("throws on non-OK search responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "denied",
      })),
    );

    const client = new OpenObserveClient(config);
    await expect(
      client.fetchSpansByTraceId("019f4730db8d73b8a4c9b4aa3ba534a8"),
    ).rejects.toThrow(/OpenObserve search failed \(401\)/);
  });

  it("truncates spans to maxSpansPerTrace", async () => {
    const limitedConfig = { ...config, maxSpansPerTrace: 2 };
    const hits = [
      makeSpan("a100000000000001"),
      makeSpan("a100000000000002"),
      makeSpan("a100000000000003"),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ hits }),
      })),
    );

    const client = new OpenObserveClient(limitedConfig);
    const result = await client.fetchSpansByTraceId(
      "019f4730db8d73b8a4c9b4aa3ba534a8",
    );

    expect(result.spans).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
