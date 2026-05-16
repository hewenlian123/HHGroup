import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type BrowserSupabaseGlobal = typeof globalThis & {
  __hhBrowserSupabaseClients?: Map<string, SupabaseClient>;
};

function getBrowserSupabaseClients(): Map<string, SupabaseClient> {
  const g = globalThis as BrowserSupabaseGlobal;
  g.__hhBrowserSupabaseClients ??= new Map();
  return g.__hhBrowserSupabaseClients;
}

export function createBrowserClient(url: string, anonKey: string): SupabaseClient {
  const isBrowser = typeof window !== "undefined";
  const options = {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  };

  if (!isBrowser) {
    return createClient(url, anonKey, options);
  }

  const cacheKey = `${url}\n${anonKey}`;
  const clients = getBrowserSupabaseClients();
  const cached = clients.get(cacheKey);
  if (cached) return cached;

  const client = createClient(url, anonKey, options);
  clients.set(cacheKey, client);
  return client;
}

/**
 * Creates a new Supabase client on each call using current process.env.
 * - In the browser: uses anon key (RLS applies).
 * - On the server: also uses anon key by default. Service role belongs only in
 *   explicit server-only admin helpers such as getServerSupabaseAdmin().
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
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
