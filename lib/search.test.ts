import { describe, expect, it } from "vitest";
import { fuzzyIncludes, snippetAround } from "@/lib/search";

describe("search helpers", () => {
  it("returns a snippet and tolerates a small typo", () => {
    expect(snippetAround("El requisito RF-01 cubre el inicio de sesión", "RF-01")).toContain("RF-01");
    expect(fuzzyIncludes("requisitos del proyecto", "requisito")).toBe(true);
    expect(fuzzyIncludes("tablero kanban", "kanbam")).toBe(true);
  });
});
