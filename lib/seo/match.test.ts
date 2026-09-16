import { describe, expect, it } from "vitest";
import { extractHostname, scoreProjectMatch, suggestProjectMatches } from "@/lib/seo/match";

const puragenda = {
  id: "p1",
  name: "Puragenda",
  description: "Software agenda barberías",
  client: { id: "c1", name: "Puragenda", website: "https://puragenda.cl" },
};

describe("seo property matching", () => {
  it("extracts hostnames from sc-domain and URL properties", () => {
    expect(extractHostname("sc-domain:puragenda.cl")).toBe("puragenda.cl");
    expect(extractHostname("https://www.purocode.com/")).toBe("purocode.com");
  });

  it("suggests a project from domain without auto-linking", () => {
    const property = {
      id: "gsc1",
      kind: "GSC",
      displayName: "Puragenda",
      siteUrl: "sc-domain:puragenda.cl",
      hostname: "puragenda.cl",
      parentExternalId: null,
    };
    const suggestions = suggestProjectMatches(property, [
      puragenda,
      { id: "p2", name: "Otro", description: null, client: { id: "c2", name: "Otro", website: null } },
    ]);
    expect(suggestions[0]?.projectId).toBe("p1");
    expect(suggestions[0]?.score).toBeGreaterThanOrEqual(80);
    expect(scoreProjectMatch(property, puragenda).score).toBeGreaterThanOrEqual(80);
  });

  it("does not invent a match for unrelated names", () => {
    const property = {
      id: "gsc2",
      kind: "GSC",
      displayName: "Unrelated",
      siteUrl: "sc-domain:example.org",
      hostname: "example.org",
      parentExternalId: null,
    };
    expect(suggestProjectMatches(property, [puragenda])).toEqual([]);
  });
});
