import { describe, expect, it } from "vitest";
import { applyFilters, persistOrder } from "@/lib/sort";

describe("sorting and filters", () => {
  it("persists manual order and filters by status", () => {
    const ordered = persistOrder(
      [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }],
      ["c", "a", "b"],
    );
    expect(ordered.map((item) => item.sortOrder)).toEqual([1, 2, 0]);
    const filtered = applyFilters(
      [{ id: "1", status: "Hecho" }, { id: "2", status: "Por hacer" }],
      { status: "Hecho" },
    );
    expect(filtered).toHaveLength(1);
  });
});
