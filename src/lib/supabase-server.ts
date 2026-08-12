/**
 * Server-side Supabase helpers.
 *
 * IMPORTANT:
 * - Do NOT import `next/headers` at module top-level, because this file is imported by
 *   non-Server-Component modules (e.g. DB helpers). Any `next/headers` import must be dynamic.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

function envUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

function envAnon(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

function envServerSecret(): string | null {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
  );
}

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
  });

function serverClientOptions(noStore = false) {
  return {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(noStore ? { global: { fetch: noStoreFetch } } : {}),
  };
}

/**
 * Server client (synchronous).
 *
 * This is used widely in API routes and DB helpers. It MUST remain synchronous
 * (many call sites expect a SupabaseClient, not a Promise).
 *
 * Uses the anon key so ordinary server reads/writes go through normal RLS.
 * Use getServerSupabaseAdmin() only in explicitly admin/internal server paths.
 */
export function getServerSupabase(): SupabaseClient | null {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;
  return createClient(url, anon, serverClientOptions());
}

export function createTransientSupabaseClient(): SupabaseClient | null {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/**
 * Service-role admin client (RLS bypass).
 * Keep usage narrow: maintenance, server-only uploads, and explicitly admin-only routes.
 * Never import this from client components or browser-bound helpers.
 */
export function getServerSupabaseAdmin(): SupabaseClient | null {
  const url = envUrl();
  const serverSecret = envServerSecret();
  if (!url || !serverSecret) return null;
  return createClient(url, serverSecret, serverClientOptions());
}

/** Service-role client for privileged reads that must observe a just-completed mutation. */
export function getServerSupabaseAdminNoStore(): SupabaseClient | null {
  const url = envUrl();
  const serverSecret = envServerSecret();
  if (!url || !serverSecret) return null;
  return createClient(url, serverSecret, serverClientOptions(true));
}

/**
 * Internal API routes: prefer service-role admin; otherwise use {@link getServerSupabase}
 * (anon/publishable key).
 *
 * Some deployments only expose anon keys on the server — routes must not hard-require
 * `SUPABASE_SERVICE_ROLE_KEY` for reads used by dashboard workflow tests.
 */
export function getServerSupabaseInternal(): SupabaseClient | null {
  return getServerSupabaseAdmin() ?? getServerSupabase();
}

/** Internal API reads that must observe writes immediately within payment/balance flows. */
export function getServerSupabaseInternalNoStore(): SupabaseClient | null {
  const url = envUrl();
  if (!url) return null;
  const serverSecret = envServerSecret();
  if (serverSecret) return createClient(url, serverSecret, serverClientOptions(true));
  const anon = envAnon();
  if (!anon) return null;
  return createClient(url, anon, serverClientOptions(true));
}

/** Matches reads from env — documented so ops/Vercel use one name only (never embed secrets in code). */
export const SUPABASE_SERVER_SECRET_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** Temporary compatibility alias. Remove after the legacy-key observation period. */
export const SUPABASE_SERVICE_ROLE_ENV_NAME = "SUPABASE_SERVICE_ROLE_KEY" as const;

/**
 * Stable API error text when anon credentials are unavailable.
 * Add secrets only in deployment env (e.g. Vercel → Environment Variables).
 */
export const SUPABASE_MISSING_SERVER_ENV_MESSAGE =
  "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the server (e.g. Vercel). Optional: SUPABASE_SECRET_KEY is server-only and should be used only by explicit admin/internal routes; SUPABASE_SERVICE_ROLE_KEY is a temporary legacy fallback.";

/** Explicit privileged server paths must never fall back to an anonymous client. */
export const SUPABASE_MISSING_SERVER_ADMIN_ENV_MESSAGE =
  "Supabase privileged server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or the temporary SUPABASE_SERVICE_ROLE_KEY fallback) on the server; never expose it to the browser.";

/** PostgREST/Postgres errors that usually mean anon/session lacks privileges — hint service role on server. */
export function appendLaborSettlementServiceRoleHint(message: string): string {
  const m = message.toLowerCase();
  if (
    /permission denied|row-level security|violates row-level security|\brls\b|policy|jwt expired|not authorized|must be owner/i.test(
      m
    )
  ) {
    return `${message.trim()} Add SUPABASE_SECRET_KEY (server-only) in Vercel if writes must bypass RLS.`;
  }
  return message;
}

/** Back-compat alias used by some server actions. */
export async function createServerSupabaseClient(
  options: { noStore?: boolean } = {}
): Promise<SupabaseClient | null> {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;

  // Dynamic import to avoid bundling next/headers into non-server graphs.
  const { cookies } = await import("next/headers");
  // Next.js 14: cookies() is synchronous. (Next 15 made it async.)
  const cookieStore = cookies();

  return createServerClient(url, anon, {
    ...(options.noStore ? { global: { fetch: noStoreFetch } } : {}),
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

type RouteCookie = {
  name: string;
  value: string;
};

function requestCookies(request: Request | NextRequest): RouteCookie[] {
  if ("cookies" in request) {
    const cookieStore = request.cookies as { getAll?: () => RouteCookie[] };
    if (typeof cookieStore.getAll === "function") {
      return cookieStore.getAll();
    }
  }

  const raw = request.headers.get("cookie");
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return { name: part, value: "" };
      return {
        name: part.slice(0, separator),
        value: decodeURIComponent(part.slice(separator + 1)),
      };
    });
}

export function createRouteSupabaseClient(
  request: Request | NextRequest,
  response: NextResponse,
  options: { persistent?: boolean; noStore?: boolean } = {}
): SupabaseClient | null {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;
  const persistent = options.persistent === true;

  return createServerClient(url, anon, {
    ...(options.noStore ? { global: { fetch: noStoreFetch } } : {}),
    cookies: {
      getAll() {
        return requestCookies(request);
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
          const normalizedOptions = persistent
            ? cookieOptions
            : {
                ...cookieOptions,
                expires: undefined,
                maxAge: undefined,
              };
          response.cookies.set(name, value, normalizedOptions);
        });
      },
    },
  });
}

function createRequestReadOnlySupabaseClient(
  request: Request | NextRequest
): SupabaseClient | null {
  const url = envUrl();
  const anon = envAnon();
  if (!url || !anon) return null;

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return requestCookies(request);
      },
      setAll() {
        // A read-only request guard cannot attach refreshed cookies. Middleware owns refresh.
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

  const cookieClient = createRequestReadOnlySupabaseClient(req);
  if (!cookieClient) return null;
  const {
    data: { user },
    error,
  } = await cookieClient.auth.getUser();
  if (!error && user) return user;
  return null;
}

/**
 * Resolve the current Server Action user from the server-owned Supabase session cookies.
 * This intentionally has no compatibility, PIN, header-secret, or local test bypass.
 */
export async function getSupabaseUserFromServerSession(): Promise<User | null> {
  const client = await createServerSupabaseClient().catch(() => null);
  if (!client) return null;
  const {
    data: { user },
    error,
  } = await client.auth.getUser().catch(() => ({ data: { user: null }, error: null }));
  return !error && user ? user : null;
}

/** Single-tenant / dev only: allow logo API with service role when no session is present. */
export function isCompanyLogoServerUploadWithoutSessionAllowed(): boolean {
  const v = process.env.ALLOW_COMPANY_LOGO_SERVER_WITHOUT_SESSION;
  return v === "1" || v === "true";
}
