"use client";

type CacheRecord<T> = {
  savedAt: number;
  value: T;
};

const CACHE_PREFIX = "notecode:";
const DEFAULT_TTL_MS = 60_000;
const memoryCache = new Map<string, CacheRecord<unknown>>();

function storageKey(key: string) {
  return `${CACHE_PREFIX}${key}`;
}

export function readCachedJson<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const now = Date.now();
  const memory = memoryCache.get(key) as CacheRecord<T> | undefined;

  if (memory && now - memory.savedAt < ttlMs) {
    return memory.value;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheRecord<T>;
    if (now - parsed.savedAt >= ttlMs) return null;

    memoryCache.set(key, parsed);
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeCachedJson<T>(key: string, value: T) {
  const record: CacheRecord<T> = { savedAt: Date.now(), value };
  memoryCache.set(key, record);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(record));
  } catch {
    // Session storage can be unavailable or full; memory cache still helps.
  }
}

export function clearCachedJson(key: string) {
  memoryCache.delete(key);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
  }
}

export function clearCachedJsonByPrefix(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }

  if (typeof window === "undefined") return;

  try {
    const fullPrefix = storageKey(prefix);
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(fullPrefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
  }
}

export async function fetchAndCacheJson<T>(key: string, url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);

  const data = (await res.json()) as T;
  writeCachedJson(key, data);

  return data;
}

export function prefetchJson(key: string, url: string, ttlMs = DEFAULT_TTL_MS) {
  if (readCachedJson(key, ttlMs)) return;

  void fetchAndCacheJson(key, url).catch(() => {
  });
}
