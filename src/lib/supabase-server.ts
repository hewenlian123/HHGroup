/**
 * Server-side Supabase client for API routes and server components.
 * Creates a new client on each call so env is read at request time (avoids stale singleton from different env).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServerSupabase(): SupabaseClient | null {
  if (typeof window !== "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Server-side Supabase client with service role key. Bypasses RLS.
 * Creates a new client on each call so env is read at request time.
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function getServerSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
