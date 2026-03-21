/**
 * Short-lived in-memory cache for client-side data fetches (projects, workers, etc.).
 * Reduces duplicate Supabase/API calls when opening modals or revisiting screens on mobile.
 */
type CacheEntry<T> = { value: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 25_000;

export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && now - hit.at < ttlMs) {
    return hit.value;
  }
  const value = await fetcher();
  store.set(key, { value, at: now });
  return value;
}

/** Optional: call after mutations if you need fresh lists immediately */
export function invalidateDataCache(keyOrPrefix?: string) {
  if (!keyOrPrefix) {
    store.clear();
    return;
  }
  for (const k of [...store.keys()]) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      store.delete(k);
    }
  }
}
