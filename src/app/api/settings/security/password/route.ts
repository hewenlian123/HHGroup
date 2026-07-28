import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { validatePassword } from "@/lib/password-policy";
import { recordSecurityAudit } from "@/lib/security-audit";
import {
  createRouteSupabaseClient,
  createTransientSupabaseClient,
  getServerSupabaseAdmin,
} from "@/lib/supabase-server";

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
    currentPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
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
  if (!currentPassword || currentPassword.length > 1024 || !guard.context.email) {
    return json(401, {
      ok: false,
      message: "Current password could not be verified.",
    });
  }

  const verifier = createTransientSupabaseClient();
  if (!verifier) {
    return json(503, { ok: false, message: "Password service is unavailable." });
  }
  const verification = await verifier.auth.signInWithPassword({
    email: guard.context.email,
    password: currentPassword,
  });
  if (verification.error || verification.data.user?.id !== guard.context.user.id) {
    return json(401, {
      ok: false,
      message: "Current password could not be verified.",
    });
  }
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);

  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return json(503, { ok: false, message: "Password service is unavailable." });
  }
  const updated = await admin.auth.admin.updateUserById(guard.context.user.id, {
    password: password.value,
  });
  if (updated.error) {
    return json(503, { ok: false, message: "Unable to change password." });
  }

  const response = json(200, {
    ok: true,
    message: "Password changed. Other sessions were signed out.",
  });
  const currentSession = createRouteSupabaseClient(request, response, {
    persistent: true,
  });
  await currentSession?.auth.signOut({ scope: "others" }).catch(() => undefined);

  await recordSecurityAudit({
    eventType: "password_changed",
    userId: guard.context.user.id,
  });

  return response;
}
