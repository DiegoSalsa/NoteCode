import { describe, expect, it } from "vitest";
import { f29DueDate, f29DueDateChile, taxPeriodRange } from "@/lib/tax/period";

describe("periodos tributarios de Chile", () => {
  it("conserva la fecha civil chilena aunque el ISO cambie de día UTC", () => {
    expect(f29DueDateChile("2026-07", 20)).toBe("2026-08-20");
    expect(f29DueDate("2026-07", 20).toISOString()).toBe("2026-08-21T03:59:59.000Z");
  });

  it("construye límites mensuales en America/Santiago", () => {
    const range = taxPeriodRange("2026-06");
    expect(range.start.toISOString()).toBe("2026-06-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });
});
