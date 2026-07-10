import { describe, expect, it } from "vitest";
import { toMicros, toMicrosFromSpans } from "../src/time.js";

describe("time", () => {
  it("converts millisecond timestamps to microseconds", () => {
    expect(toMicros(1740000000000)).toBe(1740000000000000);
  });

  it("keeps microsecond timestamps unchanged", () => {
    expect(toMicros(1740000000000000)).toBe(1740000000000000);
  });

  it("aggregates span start and end timestamps", () => {
    const range = toMicrosFromSpans(
      [
        { start_time: 1000, end_time: 5000 },
        { start_time: 2000, end_time: 7000 },
      ],
      "start",
    );
    expect(range).toBe(1000000);
  });
});
