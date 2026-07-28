import { NextRequest, NextResponse } from "next/server";

import { authorizedAppRole } from "@/lib/auth-role";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { recordSecurityAudit } from "@/lib/security-audit";
import { createRouteSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const GENERIC_LOGIN_ERROR = "Unable to sign in with those credentials.";
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;

type LoginAttempt = {
  failures: number;
  resetAt: number;
};

const attempts = new Map<string, LoginAttempt>();

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function isRateLimited(key: string): boolean {
  const record = attempts.get(key);
  const now = Date.now();
  if (!record || record.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return record.failures >= RATE_LIMIT_MAX_FAILURES;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  attempts.set(key, { failures: current.failures + 1, resetAt: current.resetAt });
}

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function auditLogin(
  eventType: "login_succeeded" | "login_failed",
  userId: string | null
): Promise<void> {
  await recordSecurityAudit({ eventType, userId });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }

  const key = clientKey(request);
  if (isRateLimited(key)) {
    return json(429, {
      ok: false,
      message: "Too many sign-in attempts. Try again later.",
    });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    redirect?: unknown;
    rememberDevice?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const redirectTo = normalizeAuthRedirect(
    typeof body?.redirect === "string" ? body.redirect : undefined
  );

  if (!email || email.length > 320 || !email.includes("@") || !password || password.length > 1024) {
    recordFailure(key);
    await auditLogin("login_failed", null);
    return json(401, { ok: false, message: GENERIC_LOGIN_ERROR });
  }

  const response = json(200, { ok: true, redirectTo });
  const supabase = createRouteSupabaseClient(request, response, {
    persistent: body?.rememberDevice === true,
  });
  if (!supabase) {
    return json(503, {
      ok: false,
      message: "Sign in is temporarily unavailable.",
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  const role = authorizedAppRole(data.user);

  if (error || !data.user || !role) {
    if (data.user) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    recordFailure(key);
    await auditLogin("login_failed", data.user?.id ?? null);
    return json(data.user && !role ? 403 : 401, {
      ok: false,
      message: GENERIC_LOGIN_ERROR,
    });
  }

  attempts.delete(key);
  await auditLogin("login_succeeded", data.user.id);
  return response;
}
