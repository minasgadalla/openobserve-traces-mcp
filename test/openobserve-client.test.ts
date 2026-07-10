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
});
