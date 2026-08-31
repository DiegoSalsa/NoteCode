import { describe, expect, it } from "vitest";
import { redactValue, scanNotesForSecrets } from "@/lib/redact";

describe("secret redaction", () => {
  it("never echoes password fields or token-like strings", () => {
    const redacted = redactValue({
      password: "should-not-leak",
      nested: { token: "abc", note: "ok" },
      text: "Authorization Bearer eyJabc.def.ghi-token-value-long",
    }) as Record<string, unknown>;
    expect(JSON.stringify(redacted)).not.toContain("should-not-leak");
    expect(redacted.password).toBe("[REDACTED]");
    expect((redacted.nested as { token: string }).token).toBe("[REDACTED]");
    expect((redacted.nested as { note: string }).note).toBe("ok");
  });

  it("flags notes that look like secrets without returning their content", () => {
    const result = scanNotesForSecrets([
      { id: "1", content: "reunión a las 10" },
      { id: "2", content: "password: hunter2-not-printed" },
    ]);
    expect(result).toEqual({ scanned: 2, flagged: 1 });
  });
});
