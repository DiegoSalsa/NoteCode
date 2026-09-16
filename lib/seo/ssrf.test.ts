import { describe, expect, it } from "vitest";
import { UnsafeUrlError, assertSafeHttpUrl, hostAllowedForProject, isBlockedHostname, isBlockedIp, parseHttpUrl } from "@/lib/seo/ssrf";
import { isSkippableHref, normalizeCrawlUrl, sameSiteHost } from "@/lib/seo/crawl-url";

describe("ssrf protections", () => {
  it("blocks localhost, loopback, private and metadata hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.8")).toBe(true);
    expect(isBlockedIp("192.168.1.9")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });

  it("rejects non-http protocols and embedded credentials", () => {
    expect(() => parseHttpUrl("file:///etc/passwd")).toThrow(UnsafeUrlError);
    expect(() => parseHttpUrl("ftp://example.com")).toThrow(UnsafeUrlError);
    expect(() => parseHttpUrl("https://user:pass@example.com")).toThrow(UnsafeUrlError);
  });

  it("blocks DNS that resolves to a private IP", async () => {
    await expect(assertSafeHttpUrl("https://evil.example", async () => ["127.0.0.1"])).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeHttpUrl("https://ok.example", async () => ["1.1.1.1"])).resolves.toBeTruthy();
  });

  it("does not follow a public host onto another host", () => {
    const allowed = "puragenda.cl";
    expect(hostAllowedForProject(new URL("https://www.puragenda.cl/x"), allowed)).toBe(true);
    expect(hostAllowedForProject(new URL("https://blog.puragenda.cl/x"), allowed)).toBe(false);
    expect(sameSiteHost("https://www.puragenda.cl/a", allowed)).toBe(true);
  });
});

describe("crawl url normalization", () => {
  it("resolves relative URLs and drops fragments and tracking params only", () => {
    expect(normalizeCrawlUrl("/b", "https://puragenda.cl/a")).toBe("https://puragenda.cl/b");
    expect(normalizeCrawlUrl("https://puragenda.cl/x#hash")).toBe("https://puragenda.cl/x");
    expect(normalizeCrawlUrl("https://puragenda.cl/x?utm_source=a&id=1")).toBe("https://puragenda.cl/x?id=1");
    expect(isSkippableHref("mailto:a@b.cl")).toBe(true);
    expect(isSkippableHref("/page")).toBe(false);
  });
});
