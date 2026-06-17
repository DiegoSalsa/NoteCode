type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const globalForCache = globalThis as unknown as {
  notecodeCache?: Map<string, CacheEntry<unknown>>;
};

const cache = globalForCache.notecodeCache ?? new Map<string, CacheEntry<unknown>>();

if (process.env.NODE_ENV !== "production") {
  globalForCache.notecodeCache = cache;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.expiresAt > now) {
    return entry.value;
  }

  const value = await load();
  cache.set(key, { value, expiresAt: now + ttlMs });

  return value;
}

export function invalidateCache(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
