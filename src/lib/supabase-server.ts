/**
 * Server-side Supabase helpers.
 *
 * IMPORTANT:
 * - Do NOT import `next/headers` at module top-level, because this file is imported by
 *   non-Server-Component modules (e.g. DB helpers). Any `next/headers` import must be dynamic.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

function envAnon(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

function envServiceRole(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/**
 * Server client (synchronous).
 *
 * This is used widely in API routes and DB helpers. It MUST remain synchronous
 * (many call sites expect a SupabaseClient, not a Promise).
 *
 * - Prefers service role (RLS bypass) when configured.
 * - Falls back to anon key (RLS applies) when service role isn't configured.
 */
export function getServerSupabase(): SupabaseClient | null {
  const url = envUrl();
  const anon = envAnon();
  if (!url) return null;
  const service = envServiceRole();
  if (service) {
    return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  if (!anon) return null;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Service-role admin client (RLS bypass). Safe to import anywhere (no next/headers).
 * Used by internal API routes and DB helpers that need consistent read/write behavior.
 */
export function getServerSupabaseAdmin(): SupabaseClient | null {
  const url = envUrl();
  const service = envServiceRole();
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Back-compat alias used by some server actions. */
export async function createServerSupabaseClient(): Promise<SupabaseClient | null> {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;

  // Dynamic import to avoid bundling next/headers into non-server graphs.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Cookies can only be modified in Server Actions / Route Handlers; ignore in other contexts.
        }
      },
    },
  });
}
