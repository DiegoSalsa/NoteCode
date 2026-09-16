import { logEvent } from "@/lib/log";

type RetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryOn?: number[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SeoHttpError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<{ data: T; status: number }> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const retries = options.retries ?? 2;
  const retryOn = options.retryOn ?? [429, 500, 502, 503, 504];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      const text = await response.text();
      if (!response.ok) {
        if (retryOn.includes(response.status) && attempt < retries) {
          await sleep(500 * 3 ** attempt);
          continue;
        }
        throw new SeoHttpError(`HTTP ${response.status}`, response.status, text.slice(0, 2_000));
      }
      const data = (text ? JSON.parse(text) : {}) as T;
      return { data, status: response.status };
    } catch (error) {
      lastError = error;
      if (error instanceof SeoHttpError) throw error;
      if (attempt >= retries) break;
      await sleep(500 * 3 ** attempt);
    }
  }

  logEvent("error", "seo.http.failed", { url, message: lastError instanceof Error ? lastError.message : "unknown" });
  throw lastError instanceof Error ? lastError : new Error("SEO HTTP request failed.");
}
