/**
 * Server-side Supabase helpers.
 *
 * IMPORTANT:
 * - Do NOT import `next/headers` at module top-level, because this file is imported by
 *   non-Server-Component modules (e.g. DB helpers). Any `next/headers` import must be dynamic.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

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

/**
 * Internal API routes: prefer service-role admin; otherwise use {@link getServerSupabase}
 * (service role when configured, else anon/publishable key).
 *
 * Some deployments only expose anon keys on the server — routes must not hard-require
 * `SUPABASE_SERVICE_ROLE_KEY` for reads used by dashboard workflow tests.
 */
export function getServerSupabaseInternal(): SupabaseClient | null {
  return getServerSupabaseAdmin() ?? getServerSupabase();
}

/** Matches reads from env — documented so ops/Vercel use one name only (never embed secrets in code). */
export const SUPABASE_SERVICE_ROLE_ENV_NAME = "SUPABASE_SERVICE_ROLE_KEY" as const;

/**
 * Stable API error text when neither anon nor service-role credentials yield a client.
 * Add secrets only in deployment env (e.g. Vercel → Environment Variables).
 */
export const SUPABASE_MISSING_SERVER_ENV_MESSAGE =
  "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the server (e.g. Vercel). Optional: SUPABASE_SERVICE_ROLE_KEY (server-only) bypasses RLS for labor pay/settlement.";

/** PostgREST/Postgres errors that usually mean anon/session lacks privileges — hint service role on server. */
export function appendLaborSettlementServiceRoleHint(message: string): string {
  const m = message.toLowerCase();
  if (
    /permission denied|row-level security|violates row-level security|\brls\b|policy|jwt expired|not authorized|must be owner/i.test(
      m
    )
  ) {
    return `${message.trim()} Add SUPABASE_SERVICE_ROLE_KEY (server-only) in Vercel if writes must bypass RLS.`;
  }
  return message;
}

/** Back-compat alias used by some server actions. */
export async function createServerSupabaseClient(): Promise<SupabaseClient | null> {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;

  // Dynamic import to avoid bundling next/headers into non-server graphs.
  const { cookies } = await import("next/headers");
  // Next.js 14: cookies() is synchronous. (Next 15 made it async.)
  const cookieStore = cookies();

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

/**
 * Resolve the Supabase user for a Route Handler request.
 * 1) `Authorization: Bearer <access_token>` (browser session without SSR cookies)
 * 2) Session cookies via `@supabase/ssr` server client
 */
export async function getSupabaseUserFromRequest(req: Request): Promise<User | null> {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (bearer) {
    const sb = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await sb.auth.getUser(bearer);
    if (!error && user) return user;
  }

  const cookieClient = await createServerSupabaseClient();
  if (!cookieClient) return null;
  const {
    data: { user },
    error,
  } = await cookieClient.auth.getUser();
  if (!error && user) return user;
  return null;
}

/** Single-tenant / dev only: allow logo API with service role when no session is present. */
export function isCompanyLogoServerUploadWithoutSessionAllowed(): boolean {
  const v = process.env.ALLOW_COMPANY_LOGO_SERVER_WITHOUT_SESSION;
  return v === "1" || v === "true";
}
