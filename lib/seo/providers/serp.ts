/**
 * SERP provider abstraction.
 * Rank tracking talks only to this contract. DataForSEO is one implementation.
 */
export type SerpDevice = "desktop" | "mobile";

export type SerpFeature =
  | "featured_snippet"
  | "people_also_ask"
  | "local_pack"
  | "images"
  | "videos"
  | "shopping"
  | "ai_overview";

export type OrganicResult = {
  position: number;
  url: string;
  domain: string;
  title: string;
  description: string;
  features: string[];
};

export type SerpOrganicResult = {
  position: number;
  rankGroup: number | null;
  rankAbsolute: number | null;
  url: string;
  domain: string;
  title: string;
  description: string;
  type: "organic" | "featured_snippet";
};

export type KeywordData = {
  keyword: string;
  locationCode?: number;
  languageCode?: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  intent: string | null;
};

export type SerpQuery = {
  keyword: string;
  country: string;
  language: string;
  device: SerpDevice;
  location?: string;
  depth?: number;
};

export type SerpResponse = {
  provider: string;
  keyword: string;
  device: SerpDevice;
  costUsd: number;
  organic: SerpOrganicResult[];
  features: SerpFeature[];
  itemCount: number;
  taskId: string | null;
};

export interface SerpProvider {
  readonly name: string;
  getOrganicResults(query: SerpQuery): Promise<SerpResponse>;
  getKeywordData(query: SerpQuery): Promise<KeywordData | null>;
}

export class SerpProviderNotConfiguredError extends Error {
  constructor(provider = "serp") {
    super(provider === "dataforseo" || provider === "serp"
      ? "Proveedor SERP no configurado"
      : `Proveedor SERP no configurado: ${provider}`);
    this.name = "SerpProviderNotConfiguredError";
  }
}
