import { describe, expect, it } from "vitest";
import {
  isOwnDomain,
  keywordContextKey,
  normalizeDomain,
  normalizeKeyword,
  targetUrlMismatch,
} from "@/lib/seo/domain";

describe("seo domain matching", () => {
  it("normalizes www, protocol and sc-domain", () => {
    expect(normalizeDomain("https://www.Puragenda.cl/path")).toBe("puragenda.cl");
    expect(normalizeDomain("sc-domain:puragenda.cl")).toBe("puragenda.cl");
    expect(normalizeDomain("http://puragenda.cl")).toBe("puragenda.cl");
  });

  it("recognizes the project domain and its subdomains without includes()", () => {
    expect(isOwnDomain("www.puragenda.cl", "puragenda.cl")).toBe(true);
    expect(isOwnDomain("app.puragenda.cl", "puragenda.cl")).toBe(true);
    expect(isOwnDomain("miagendapp.cl", "puragenda.cl")).toBe(false);
    expect(isOwnDomain("notpuragenda.cl", "puragenda.cl")).toBe(false);
  });

  it("flags a ranking URL that does not match the target", () => {
    expect(targetUrlMismatch("https://puragenda.cl/blog/x", "/software-agenda-barberias", "puragenda.cl")).toBe(true);
    expect(targetUrlMismatch("https://www.puragenda.cl/software-agenda-barberias", "/software-agenda-barberias", "puragenda.cl")).toBe(false);
  });

  it("builds a duplicate key from keyword context", () => {
    const key = keywordContextKey({
      seoProjectId: "p1",
      normalizedKeyword: normalizeKeyword("Agenda   Barberia"),
      country: "CL",
      language: "es",
      device: "desktop",
      location: "",
    });
    expect(key).toContain("agenda barberia");
    expect(normalizeKeyword("Agenda   Barberia")).toBe("agenda barberia");
  });
});
