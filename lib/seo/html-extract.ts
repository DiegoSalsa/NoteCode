function decode(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decode(match?.[2] || match?.[3] || match?.[4] || "");
}

export type ExtractedPage = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  canonicalCount: number;
  robots: string | null;
  h1s: string[];
  headings: string[];
  links: string[];
  images: Array<{ src: string; alt: string | null }>;
  jsonLdTypes: string[];
  jsonLdInvalid: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  wordCount: number;
  textHashSource: string;
};

export function extractHtml(html: string) {
  const title = decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, "")) || null;
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const linksRel = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  function meta(name: string) {
    const tag = metas.find((item) => attr(item, "name").toLowerCase() === name || attr(item, "property").toLowerCase() === name);
    return tag ? attr(tag, "content") || null : null;
  }
  const canonicals = linksRel.filter((item) => attr(item, "rel").toLowerCase().split(/\s+/).includes("canonical"));
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => decode(match[1]?.replace(/<[^>]+>/g, "") || ""));
  const headings = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => (match[1] || "").toLowerCase());
  const anchors = [...html.matchAll(/<a\b[^>]*>/gi)].map((match) => attr(match[0], "href")).filter(Boolean);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => ({
    src: attr(match[0], "src"),
    alt: /alt\s*=/i.test(match[0]) ? attr(match[0], "alt") : null,
  }));
  let jsonLdInvalid = false;
  const jsonLdTypes: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1] || "null");
      const nodes = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of nodes) {
        const type = node?.["@type"];
        if (typeof type === "string") jsonLdTypes.push(type);
        if (Array.isArray(type)) jsonLdTypes.push(...type.filter((item) => typeof item === "string"));
      }
    } catch {
      jsonLdInvalid = true;
    }
  }
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  const words = text.split(/\s+/).filter(Boolean);
  return {
    title,
    description: meta("description"),
    canonical: canonicals[0] ? attr(canonicals[0], "href") || null : null,
    canonicalCount: canonicals.length,
    robots: meta("robots"),
    h1s,
    headings,
    links: anchors,
    images,
    jsonLdTypes,
    jsonLdInvalid,
    ogTitle: meta("og:title"),
    ogDescription: meta("og:description"),
    ogImage: meta("og:image"),
    twitterCard: meta("twitter:card"),
    wordCount: words.length,
    textHashSource: words.join(" ").slice(0, 20_000).toLowerCase(),
  } satisfies ExtractedPage;
}
