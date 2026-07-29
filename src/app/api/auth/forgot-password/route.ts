import { NextRequest, NextResponse } from "next/server";

import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { resolveServerAppOrigin } from "@/lib/server-app-origin";
import { createRouteSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ACCEPTED_MESSAGE =
  "If that email belongs to an authorized account, a password reset link has been sent.";
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 4;
const attempts = new Map<string, { count: number; resetAt: number }>();

function keyFor(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function overLimit(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count += 1;
  return record.count > MAX_REQUESTS;
}

function accepted(): NextResponse {
  return NextResponse.json(
    { ok: true, message: ACCEPTED_MESSAGE },
    {
      status: 202,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { ok: false, message: originCheck.message },
      { status: originCheck.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const key = keyFor(request);
  if (overLimit(key)) return accepted();

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !email.includes("@")) return accepted();

  const response = accepted();
  const supabase = createRouteSupabaseClient(request, response);
  if (!supabase) return accepted();

  const callback = new URL("/auth/recovery/callback", resolveServerAppOrigin(request));
  await supabase.auth
    .resetPasswordForEmail(email, { redirectTo: callback.toString() })
    .catch(() => undefined);

  return response;
}
