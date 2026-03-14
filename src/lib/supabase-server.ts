/**
 * Server-side Supabase client for API routes and server components.
 * Uses env at runtime so API routes always have the correct credentials.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (typeof window !== "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!serverClient) serverClient = createClient(url, key);
  return serverClient;
}
