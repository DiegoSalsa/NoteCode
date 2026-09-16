/**
 * SERP provider abstraction.
 * P0 only defines the contract. Paid providers (DataForSEO, etc.) are wired in P1.
 * Do not scrape Google from NoteCode servers.
 */
export type SerpDevice = "desktop" | "mobile";

export type OrganicResult = {
  position: number;
  url: string;
  domain: string;
  title: string;
  description: string;
  features: string[];
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
  country?: string;
  language?: string;
  device?: SerpDevice;
  location?: string;
};

export interface SerpProvider {
  readonly name: string;
  getOrganicResults(query: SerpQuery): Promise<OrganicResult[]>;
  getKeywordData(query: SerpQuery): Promise<KeywordData | null>;
}

export class SerpProviderNotConfiguredError extends Error {
  constructor(provider = "serp") {
    super(`Integración no configurada: ${provider}`);
  }
}

export function getSerpProvider(): SerpProvider {
  throw new SerpProviderNotConfiguredError("dataforseo");
}
