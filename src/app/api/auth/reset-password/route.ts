import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }

  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

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

  await recordSecurityAudit({
    eventType: "password_reset",
    userId: guard.context.user.id,
  });

  return response;
}
