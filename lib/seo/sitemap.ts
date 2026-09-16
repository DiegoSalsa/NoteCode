export function parseSitemapXml(xml: string) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => match[1]?.trim() || "").filter(Boolean);
  const lastmods = [...xml.matchAll(/<lastmod>\s*([^<]+)\s*<\/lastmod>/gi)].map((match) => match[1]?.trim() || "");
  return {
    kind: isIndex ? "index" : "sitemap",
    urls: locs.map((url, index) => ({ url, lastmod: lastmods[index] || null })),
  };
}
