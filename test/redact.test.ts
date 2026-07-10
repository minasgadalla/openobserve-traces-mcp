import { describe, expect, it } from "vitest";
import { redactRecord } from "../src/redact.js";

describe("redact", () => {
  it("masks sensitive fields", () => {
    const result = redactRecord({
      span_id: "abc",
      password_hash: "secret",
      db_statement: "SELECT 1",
    });
    expect(result.password_hash).toBe("[REDACTED]");
    expect(result.span_id).toBe("abc");
  });

  it("truncates db_statement in summary mode", () => {
    const long = "x".repeat(300);
    const result = redactRecord({ db_statement: long }, "summary");
    expect(String(result.db_statement).length).toBeLessThanOrEqual(201);
  });

  it("keeps full db_statement in full mode", () => {
    const long = "x".repeat(300);
    const result = redactRecord({ db_statement: long }, "full");
    expect(result.db_statement).toBe(long);
  });
});
