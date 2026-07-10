import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SpanRecord } from "../src/types.js";
import {
  buildErrorPath,
  buildSpanTree,
  getSlowSpans,
  pickPrimaryErrorSpan,
  walkAncestorPath,
} from "../src/span-tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures/trace-sample.json"), "utf-8"),
) as SpanRecord[];

const attrs = {
  correlationId: "app_correlation_id",
  errorMessage: "app_activity_error_message",
  failed: "app_activity_failed",
  organizationIds: "app_organization_ids",
};

describe("span-tree", () => {
  it("builds tree with orphans", () => {
    const tree = buildSpanTree(fixture);
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(tree.orphan_count).toBeGreaterThanOrEqual(1);
    expect(tree.edges.length).toBeGreaterThan(0);
  });

  it("builds error path from primary error", () => {
    const path = buildErrorPath(fixture, attrs);
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((s) => s.span_status === "ERROR")).toBe(true);
    expect(path[0].message).toContain("Order conflict");
  });

  it("walks ancestor path from span", () => {
    const byId = new Map(fixture.map((s) => [s.span_id, s]));
    const path = walkAncestorPath("a100000000000003", byId, attrs);
    expect(path.map((p) => p.span_id)).toContain("a100000000000003");
    expect(path.map((p) => p.span_id)).toContain("a100000000000002");
  });

  it("picks controller error span as primary", () => {
    const errors = fixture.filter((s) => s.span_status === "ERROR");
    const primary = pickPrimaryErrorSpan(errors);
    expect(primary.operation_name).toBe("OrdersController.create");
  });

  it("returns slow spans sorted by duration", () => {
    const slow = getSlowSpans(fixture, 3);
    expect(slow.length).toBeLessThanOrEqual(3);
    expect(slow[0].duration_us).toBeGreaterThanOrEqual(
      slow[1]?.duration_us ?? 0,
    );
  });
});
