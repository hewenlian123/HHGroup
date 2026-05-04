import type { SupabaseClient } from "@supabase/supabase-js";
import { expenseAttachmentStorageDedupeKey } from "@/lib/expense-attachment-dedupe";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";

type CacheEntry = { url: string; expiresAt: number };

const signedUrlMemoryCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<string>>();

const DEFAULT_TTL_MS = 50 * 60 * 1000;

/**
 * In-memory signed URL cache for receipt previews (same tab session).
 * Key: stable storage path / object identity via `expenseAttachmentStorageDedupeKey`.
 */
export function peekCachedReceiptSignedUrl(rawUrlOrPath: string): string | undefined {
  const raw = (rawUrlOrPath ?? "").trim();
  if (!raw) return undefined;
  const key = expenseAttachmentStorageDedupeKey(raw);
  if (!key) return undefined;
  const hit = signedUrlMemoryCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) signedUrlMemoryCache.delete(key);
    return undefined;
  }
  return hit.url;
}

function rememberSignedUrl(rawUrlOrPath: string, signedUrl: string): void {
  const raw = (rawUrlOrPath ?? "").trim();
  if (!raw || !signedUrl.trim()) return;
  const key = expenseAttachmentStorageDedupeKey(raw);
  if (!key) return;
  signedUrlMemoryCache.set(key, {
    url: signedUrl.trim(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
}

/**
 * Wraps `resolvePreviewSignedUrl` with memory cache + in-flight deduplication
 * (rapid clicks / prefetch + open share one network call per receipt).
 */
export function resolvePreviewSignedUrlWithMemoryCache(options: {
  supabase: SupabaseClient | null;
  rawUrlOrPath: string;
  ttlSec?: number;
  bucketCandidates?: string[];
}): Promise<string> {
  const raw = (options.rawUrlOrPath ?? "").trim();
  if (!raw) return Promise.resolve("");
  if (raw.startsWith("blob:")) return Promise.resolve(raw);

  const cached = peekCachedReceiptSignedUrl(raw);
  if (cached) return Promise.resolve(cached);

  const key = expenseAttachmentStorageDedupeKey(raw);
  if (key) {
    const existing = inflightByKey.get(key);
    if (existing) return existing;
  }

  const p = resolvePreviewSignedUrl(options).then((out) => {
    if (out) rememberSignedUrl(raw, out);
    return out;
  });

  if (key) {
    inflightByKey.set(key, p);
    void p.finally(() => {
      inflightByKey.delete(key);
    });
  }

  return p;
}
