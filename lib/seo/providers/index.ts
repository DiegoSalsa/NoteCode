import { DataForSeoSerpProvider } from "@/lib/seo/providers/dataforseo";
import { SerpProviderNotConfiguredError, type SerpProvider } from "@/lib/seo/providers/serp";

export { SerpProviderNotConfiguredError } from "@/lib/seo/providers/serp";
export type { SerpProvider, SerpQuery, SerpResponse } from "@/lib/seo/providers/serp";

export function getSerpProvider(): SerpProvider {
  const name = (process.env.SEO_SERP_PROVIDER || "dataforseo").trim().toLowerCase();
  if (name !== "dataforseo") throw new SerpProviderNotConfiguredError(name);
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new SerpProviderNotConfiguredError("dataforseo");
  return new DataForSeoSerpProvider({ login, password });
}
