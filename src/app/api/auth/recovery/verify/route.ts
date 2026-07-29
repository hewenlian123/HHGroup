import { NextRequest, NextResponse } from "next/server";

import { authorizeRecoverySession } from "@/lib/auth-recovery-verification";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { createRouteSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const INVALID_MESSAGE = "Recovery code is invalid or has expired.";

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function invalidRecovery(): NextResponse {
  return json(403, { ok: false, message: INVALID_MESSAGE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    token?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!email || email.length > 320 || !email.includes("@") || !/^\d{6,8}$/.test(token)) {
    return invalidRecovery();
  }

  const response = json(200, { ok: true, redirectTo: "/reset-password" });
  const supabase = createRouteSupabaseClient(request, response);
  if (!supabase) return invalidRecovery();

  const { data, error } = await supabase.auth
    .verifyOtp({ email, token, type: "recovery" })
    .catch(() => ({ data: { session: null, user: null }, error: new Error("verification") }));
  if (error) return invalidRecovery();

  const authorized = await authorizeRecoverySession(response, {
    session: data.session,
    user: data.user,
  });
  return authorized ? response : invalidRecovery();
}
