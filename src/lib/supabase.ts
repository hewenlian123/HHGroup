import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createBrowserClient(url: string, anonKey: string): SupabaseClient {
  const isBrowser = typeof window !== "undefined";
  return createClient(url, anonKey, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  });
}

/**
 * Creates a new Supabase client on each call using current process.env.
 * - In the browser: uses anon key (RLS applies).
 * - On the server: uses service role key when set (SUPABASE_SERVICE_ROLE_KEY) so SELECT/GET see the same data as DELETE and no stale singleton.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  if (typeof window === "undefined") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) return createClient(url, serviceKey);
  }
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) return null;
  return createBrowserClient(url, key);
}

/** User-facing message when PostgREST / fetch fails (offline Supabase, bad URL, TLS, etc.). */
export function humanizeSupabaseRequestError(err: unknown): string {
  const raw =
    err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : String(err);
  if (/fetch failed/i.test(raw)) {
    return "Database connection failed (fetch failed). Check NEXT_PUBLIC_SUPABASE_URL, keys, VPN/firewall, and that Supabase is reachable.";
  }
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|certificate|SSL|TLS/i.test(raw)) {
    return "Database connection failed. Check NEXT_PUBLIC_SUPABASE_URL and network access.";
  }
  return raw.trim() || "Request failed.";
}
