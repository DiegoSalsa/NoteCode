import { describe, expect, it } from "vitest";
import { assertVersion, ConflictError, nextVersion } from "@/lib/concurrency";

describe("optimistic concurrency", () => {
  it("rejects stale versions and increments on success", () => {
    expect(() => assertVersion(2, 1)).toThrow(ConflictError);
    expect(() => assertVersion(2, 2)).not.toThrow();
    expect(nextVersion(2)).toBe(3);
  });
});
