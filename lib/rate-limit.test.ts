import { describe, expect, it } from "vitest";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("rate limit", () => {
  it("blocks a burst over the window", () => {
    resetRateLimit();
    expect(rateLimit("t", 2, 1000).ok).toBe(true);
    expect(rateLimit("t", 2, 1000).ok).toBe(true);
    expect(rateLimit("t", 2, 1000).ok).toBe(false);
  });
});
