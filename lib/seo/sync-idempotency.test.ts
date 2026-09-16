import { describe, expect, it } from "vitest";
import { makeSyncIdempotencyKey } from "@/lib/seo/aggregates";

describe("seo sync idempotency", () => {
  it("builds a stable key from source, project, range and mode", () => {
    expect(makeSyncIdempotencyKey("gsc", "proj", "2026-09-01", "2026-09-07", "inc")).toBe(
      "gsc:proj:2026-09-01:2026-09-07:inc",
    );
    expect(makeSyncIdempotencyKey("gsc", "proj", "2026-09-01", "2026-09-07", "full")).not.toBe(
      makeSyncIdempotencyKey("gsc", "proj", "2026-09-01", "2026-09-07", "inc"),
    );
  });
});
