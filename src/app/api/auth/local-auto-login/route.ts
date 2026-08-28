import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { authorizedAppRole } from "@/lib/auth-role";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { isLocalAutoLoginEnabled } from "@/lib/local-auto-login";
import { createRouteSupabaseClient, getServerSupabaseAdminNoStore } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_OWNER_LABEL = "HH Local Owner";

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    Pragma: "no-cache",
  };
}

function unavailable(status = 404): NextResponse {
  return NextResponse.json(
    { ok: false, message: status === 404 ? "Not found." : "Local sign-in is unavailable." },
    { status, headers: noStoreHeaders() }
  );
}

function serverSecret(): string | null {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
  );
}

function localOwnerCredentials(secret: string): { email: string; password: string } {
  const digest = createHash("sha256").update(`hh-local-auto-login:owner:${secret}`).digest("hex");
  return {
    email: `local-owner-${digest.slice(0, 16)}@example.invalid`,
    password: `Hh!${digest.slice(16, 52)}aA1`,
  };
}

function validatedLocalServiceRoleJwt(output: string): string | null {
  const token = output.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  if (!token) return null;

  try {
    const [encodedHeader, encodedPayload] = token.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as {
      alg?: unknown;
      kid?: unknown;
    };
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      exp?: unknown;
      role?: unknown;
    };
    if (
      header.alg !== "ES256" ||
      typeof header.kid !== "string" ||
      payload.role !== "service_role" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Supabase CLI local stacks now issue ES256 Auth sessions. Some CLI/container
 * combinations still expose legacy HS256 service-role keys that GoTrue rejects.
 * Mint a five-minute ES256 service token from the local signing key instead of
 * persisting or exposing that key. execFile is intentionally shell-free.
 */
async function createLocalCliAdmin(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      process.env.HH_SUPABASE_CLI_PATH?.trim() || "supabase",
      ["gen", "bearer-jwt", "--role", "service_role", "--valid-for", "5m", "-o", "json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 16 * 1024,
        timeout: 15_000,
      },
      (error, output) => {
        if (error) reject(error);
        else resolve(output);
      }
    );
  });
  const token = validatedLocalServiceRoleJwt(stdout);
  if (!token) return null;

  return createClient(url, token, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

async function ensureLocalOwner(): Promise<{
  email: string;
  password: string;
} | null> {
  const secret = serverSecret();
  let admin = getServerSupabaseAdminNoStore();
  if (!secret || !admin) return null;

  const { email, password } = localOwnerCredentials(secret);
  let { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    admin = await createLocalCliAdmin().catch(() => null);
    if (!admin) return null;
    ({ data: listed, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    }));
    if (listError) return null;
  }

  const existing = listed.users.find((user) => user.email?.toLowerCase() === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...existing.app_metadata, role: "owner" },
      email_confirm: true,
      password,
      user_metadata: { ...existing.user_metadata, display_name: LOCAL_OWNER_LABEL },
    });
    if (error) return null;
    return { email, password };
  }

  const { data, error } = await admin.auth.admin.createUser({
    app_metadata: { role: "owner" },
    email,
    email_confirm: true,
    password,
    user_metadata: { display_name: LOCAL_OWNER_LABEL },
  });
  if (error || !data.user) return null;
  return { email, password };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isLocalAutoLoginEnabled(request.url)) return unavailable();

  const owner = await ensureLocalOwner().catch(() => null);
  if (!owner) return unavailable(503);

  const redirectTo = normalizeAuthRedirect(request.nextUrl.searchParams.get("redirect"));
  const response = NextResponse.redirect(new URL(redirectTo, request.url), {
    headers: noStoreHeaders(),
  });
  const supabase = createRouteSupabaseClient(request, response, {
    noStore: true,
    persistent: true,
  });
  if (!supabase) return unavailable(503);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: owner.email,
    password: owner.password,
  });
  if (
    error ||
    !data.user ||
    data.user.email?.toLowerCase() !== owner.email ||
    authorizedAppRole(data.user) !== "owner"
  ) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return unavailable(503);
  }

  return response;
}
