import { fetchWithTimeout } from "@/lib/seo/http";
import { UnsafeUrlError, assertSafeHttpUrl, hostAllowedForProject, type LookupFn } from "@/lib/seo/ssrf";

export type FetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  ms: number;
  redirectChain: string[];
};

const MAX_REDIRECTS = 5;

export async function fetchSafeHtml(input: {
  url: string;
  allowedHost: string;
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  lookup?: LookupFn;
}): Promise<FetchResult> {
  let current = input.url;
  const chain: string[] = [];
  const started = Date.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = await assertSafeHttpUrl(current, input.lookup);
    if (!hostAllowedForProject(parsed, input.allowedHost)) {
      throw new UnsafeUrlError("La URL está fuera del dominio permitido.");
    }
    const response = await fetchWithTimeout(parsed.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": input.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    }, input.timeoutMs);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      chain.push(current);
      current = new URL(location, current).toString();
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    const buf = Buffer.from(await response.arrayBuffer());
    const bytes = buf.byteLength;
    if (bytes > input.maxBytes) {
      return {
        url: input.url,
        finalUrl: parsed.toString(),
        status: response.status,
        contentType,
        body: "",
        bytes,
        ms: Date.now() - started,
        redirectChain: chain,
      };
    }
    const isText = /html|xml|text\//i.test(contentType) || contentType === "";
    return {
      url: input.url,
      finalUrl: parsed.toString(),
      status: response.status,
      contentType,
      body: isText ? buf.toString("utf8") : "",
      bytes,
      ms: Date.now() - started,
      redirectChain: chain,
    };
  }
  throw new UnsafeUrlError("Cadena de redirects demasiado larga.");
}
