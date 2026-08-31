import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/lib/markdown";

describe("markdown sanitizer", () => {
  it("escapes HTML and drops javascript links", () => {
    const result = parseMarkdown("# Título\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[[nota-a]]");
    expect(result.html).toContain("<h1 id=\"titulo\">Título</h1>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("javascript:alert");
    expect(result.toc).toEqual([{ id: "titulo", level: 1, text: "Título" }]);
    expect(result.links.some((link) => link.type === "note" && link.target === "nota-a")).toBe(true);
  });
});
