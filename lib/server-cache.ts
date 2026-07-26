import { after } from "next/server";

type CacheEntry<T> = {
  expiresAt: number;
  staleUntil: number;
  value: T;
};

const globalForCache = globalThis as unknown as {
  notecodeCache?: Map<string, CacheEntry<unknown>>;
  notecodeCacheInflight?: Map<string, Promise<unknown>>;
  notecodeCacheVersions?: Map<string, number>;
};

const cache = globalForCache.notecodeCache ?? new Map<string, CacheEntry<unknown>>();
const inflight = globalForCache.notecodeCacheInflight ?? new Map<string, Promise<unknown>>();
const versions = globalForCache.notecodeCacheVersions ?? new Map<string, number>();

globalForCache.notecodeCache = cache;
globalForCache.notecodeCacheInflight = inflight;
globalForCache.notecodeCacheVersions = versions;

type CacheOptions = {
  fresh?: boolean;
  staleWhileRevalidateMs?: number;
};

function loadOnce<T>(key: string, ttlMs: number, staleMs: number, load: () => Promise<T>) {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const version = versions.get(key) ?? 0;
  const promise = load()
    .then((value) => {
      if ((versions.get(key) ?? 0) === version) {
        const now = Date.now();
        cache.set(key, {
          value,
          expiresAt: now + ttlMs,
          staleUntil: now + ttlMs + staleMs,
        });
      }
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

function refreshAfterResponse<T>(key: string, ttlMs: number, staleMs: number, load: () => Promise<T>) {
  const refresh = () => loadOnce(key, ttlMs, staleMs, load).catch(() => {
    // The stale value remains available after a failed refresh.
  });

  try {
    after(refresh);
  } catch {
    setTimeout(() => { void refresh(); }, 0);
  }
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const staleMs = options.staleWhileRevalidateMs ?? Math.max(60_000, ttlMs * 10);

  if (!options.fresh && entry && entry.expiresAt > now) {
    return entry.value;
  }

  if (!options.fresh && entry && entry.staleUntil > now) {
    refreshAfterResponse(key, ttlMs, staleMs, load);
    return entry.value;
  }

  return loadOnce(key, ttlMs, staleMs, load);
}

export function invalidateCache(prefix: string) {
  const keys = new Set([...cache.keys(), ...inflight.keys()]);
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      versions.set(key, (versions.get(key) ?? 0) + 1);
    }
  }
}
