import type { SupabaseClient } from "@supabase/supabase-js";

export type ParsedSupabaseStorageObject = {
  bucket: string;
  path: string;
};

/**
 * Parse bucket + object path from a Supabase Storage URL.
 *
 * Supports both modern and legacy URL shapes:
 * - /storage/v1/object/public/<bucket>/<path>
 * - /storage/v1/object/sign/<bucket>/<path>
 * - /object/public/<bucket>/<path>
 * - /object/sign/<bucket>/<path>
 */
export function parseSupabaseStorageObjectUrl(url: string): ParsedSupabaseStorageObject | null {
  try {
    const pathname = new URL(url.trim()).pathname;
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/object/public/",
      "/object/sign/",
    ] as const;
    for (const base of markers) {
      const i = pathname.indexOf(base);
      if (i === -1) continue;
      const rest = pathname.slice(i + base.length);
      const [bucketRaw, ...pathParts] = rest.split("/").filter(Boolean);
      const bucket = bucketRaw?.trim();
      const path = decodeURIComponent(pathParts.join("/")).replace(/^\/+/, "");
      if (!bucket || !path) return null;
      return { bucket, path };
    }
    return null;
  } catch {
    return null;
  }
}

export async function createSignedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  ttlSec = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Resolve a URL (or storage path) to a signed URL for preview.
 *
 * - If it's already a http(s) URL:
 *   - If it's a Supabase Storage object URL (public or sign), we re-sign it (private buckets need this).
 *   - Otherwise return as-is.
 * - If it's a non-URL path, try bucket candidates.
 */
export async function resolvePreviewSignedUrl(options: {
  supabase: SupabaseClient | null;
  rawUrlOrPath: string;
  ttlSec?: number;
  bucketCandidates?: string[];
}): Promise<string> {
  const { supabase, rawUrlOrPath, ttlSec = 3600, bucketCandidates = [] } = options;
  const raw = (rawUrlOrPath ?? "").trim();
  if (!raw) return "";
  if (!supabase) return raw;
  if (/^https?:\/\//i.test(raw)) {
    const parsed = parseSupabaseStorageObjectUrl(raw);
    if (!parsed) return raw;
    const signed = await createSignedStorageUrl(supabase, parsed.bucket, parsed.path, ttlSec);
    return signed ?? raw;
  }
  const path = raw.replace(/^\/+/, "");
  for (const b of bucketCandidates) {
    const signed = await createSignedStorageUrl(supabase, b, path, ttlSec);
    if (signed) return signed;
  }
  return raw;
}
