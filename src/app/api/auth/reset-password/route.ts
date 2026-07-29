import { NextRequest, NextResponse } from "next/server";

import {
  clearRecoverySessionCookie,
  readRecoverySessionCookie,
  readRecoverySessionToken,
} from "@/lib/auth-recovery-session";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { sessionIdFromAccessToken } from "@/lib/device-unlock-token";
import { validatePassword } from "@/lib/password-policy";
import { recordSecurityAudit } from "@/lib/security-audit";
import { clearPinSession } from "@/lib/pin-auth";
import { clearDeviceUnlockCookie, clearTrustedDeviceCookie } from "@/lib/device-unlock";
import { createRouteSupabaseClient, getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function invalidRecovery(): NextResponse {
  const response = json(403, {
    ok: false,
    message: "Password recovery session is invalid or has expired.",
  });
  clearRecoverySessionCookie(response);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }

  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const sessionResponse = NextResponse.next();
  const sessionClient = createRouteSupabaseClient(request, sessionResponse);
  const {
    data: { session },
  } = sessionClient
    ? await sessionClient.auth.getSession().catch(() => ({ data: { session: null } }))
    : { data: { session: null } };
  const sessionId = session?.access_token ? sessionIdFromAccessToken(session.access_token) : null;
  const recovery = await readRecoverySessionToken(readRecoverySessionCookie(request));
  if (
    !sessionId ||
    !recovery ||
    recovery.userId !== guard.context.user.id ||
    recovery.sessionId !== sessionId
  ) {
    return invalidRecovery();
  }

  const body = (await request.json().catch(() => null)) as {
    newPassword?: unknown;
    confirmPassword?: unknown;
  } | null;
  const password = validatePassword(body?.newPassword);
  if (!password.ok) {
    return json(400, { ok: false, message: password.message });
  }
  if (password.value !== body?.confirmPassword) {
    return json(400, {
      ok: false,
      message: "Password confirmation does not match.",
    });
  }

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return json(503, { ok: false, message: "Password service is unavailable." });
  }
  const updated = await admin.auth.admin.updateUserById(guard.context.user.id, {
    password: password.value,
  });
  if (updated.error) {
    return json(503, { ok: false, message: "Unable to reset password." });
  }

  const response = json(200, {
    ok: true,
    redirectTo: "/login?message=password_reset",
  });
  const supabase = createRouteSupabaseClient(request, response);
  await supabase?.auth.signOut({ scope: "global" }).catch(() => undefined);
  clearPinSession(response);
  clearDeviceUnlockCookie(response);
  clearTrustedDeviceCookie(response);
  clearRecoverySessionCookie(response);

  await recordSecurityAudit({
    eventType: "password_reset",
    userId: guard.context.user.id,
  });

  return response;
}
