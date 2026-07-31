import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { verifyCurrentPassword } from "@/lib/current-password";
import {
  clearDeviceUnlockCookie,
  clearTrustedDeviceCookie,
  getRequestSessionId,
  hashQuickUnlockPin,
  setDeviceUnlockCookies,
  validateQuickUnlockPin,
} from "@/lib/device-unlock";
import { clearPinSession } from "@/lib/pin-auth";
import { recordSecurityAudit } from "@/lib/security-audit";
import { getServerSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type PinState = {
  pin_hash: string | null;
  pin_salt: string | null;
  pin_version: number;
  trusted_device_version: number;
};

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function loadPinState(userId: string): Promise<{ state: PinState | null; error: boolean }> {
  const admin = getServerSupabaseAdmin();
  if (!admin) return { state: null, error: true };
  const { data, error } = await admin
    .from("app_user_security_settings")
    .select("pin_hash,pin_salt,pin_version,trusted_device_version")
    .eq("user_id", userId)
    .maybeSingle();
  return { state: (data as PinState | null) ?? null, error: Boolean(error) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;
  const { state, error } = await loadPinState(guard.context.user.id);
  if (error) {
    return json(503, { ok: false, message: "Unable to load Quick Unlock settings." });
  }
  return json(200, {
    ok: true,
    enabled: Boolean(state?.pin_hash && state.pin_salt),
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
    pin?: unknown;
    confirmPin?: unknown;
  } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) {
    return json(401, {
      ok: false,
      message: "Current password is required.",
    });
  }

  const pin = validateQuickUnlockPin(body?.pin);
  if (!pin.ok) return json(400, { ok: false, message: pin.message });
  if (pin.value !== body?.confirmPin) {
    return json(400, { ok: false, message: "PIN confirmation does not match." });
  }
  if (!guard.context.email) {
    return json(401, { ok: false, message: "Current password could not be verified." });
  }
  const passwordValid = await verifyCurrentPassword({
    email: guard.context.email,
    password: currentPassword,
    userId: guard.context.user.id,
  });
  if (!passwordValid) {
    return json(401, { ok: false, message: "Current password could not be verified." });
  }

  const sessionId = await getRequestSessionId(request, guard.context.user.id);
  if (!sessionId) {
    return json(401, { ok: false, message: "Authentication required." });
  }
  const { state, error } = await loadPinState(guard.context.user.id);
  if (error) {
    return json(503, { ok: false, message: "Unable to save Quick Unlock settings." });
  }

  const stored = await hashQuickUnlockPin(pin.value);
  const nextPinVersion = (state?.pin_version ?? 1) + 1;
  const nextTrustedVersion = (state?.trusted_device_version ?? 1) + 1;
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return json(503, { ok: false, message: "Unable to save Quick Unlock settings." });
  }
  const { error: saveError } = await admin.from("app_user_security_settings").upsert(
    {
      failed_attempts: 0,
      locked_until: null,
      pin_hash: stored.hash,
      pin_iterations: stored.iterations,
      pin_salt: stored.salt,
      pin_version: nextPinVersion,
      trusted_device_version: nextTrustedVersion,
      updated_at: new Date().toISOString(),
      user_id: guard.context.user.id,
    },
    { onConflict: "user_id" }
  );
  if (saveError) {
    return json(503, { ok: false, message: "Unable to save Quick Unlock settings." });
  }

  const response = json(200, {
    ok: true,
    enabled: true,
    message: state?.pin_hash ? "Quick Unlock PIN changed." : "Quick Unlock enabled.",
  });
  const cookiesSet = await setDeviceUnlockCookies(response, {
    pinVersion: nextPinVersion,
    sessionId,
    userId: guard.context.user.id,
  });
  if (!cookiesSet) {
    return json(503, {
      ok: false,
      message: "Quick Unlock signing is not configured.",
    });
  }
  clearPinSession(response);

  await recordSecurityAudit({
    eventType: state?.pin_hash ? "pin_changed" : "pin_enabled",
    userId: guard.context.user.id,
  });
  return response;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const originCheck = validateSameOriginMutation(request);
  if (!originCheck.ok) {
    return json(originCheck.status, { ok: false, message: originCheck.message });
  }
  const guard = await requireSupabaseOwnerOrAdmin(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
  } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword || !guard.context.email) {
    return json(401, { ok: false, message: "Current password is required." });
  }
  const passwordValid = await verifyCurrentPassword({
    email: guard.context.email,
    password: currentPassword,
    userId: guard.context.user.id,
  });
  if (!passwordValid) {
    return json(401, { ok: false, message: "Current password could not be verified." });
  }

  const { state, error } = await loadPinState(guard.context.user.id);
  if (error) {
    return json(503, { ok: false, message: "Unable to disable Quick Unlock." });
  }
  const admin = getServerSupabaseAdmin();
  if (!admin) {
    return json(503, { ok: false, message: "Unable to disable Quick Unlock." });
  }
  const { error: saveError } = await admin.from("app_user_security_settings").upsert(
    {
      failed_attempts: 0,
      locked_until: null,
      pin_hash: null,
      pin_salt: null,
      pin_version: (state?.pin_version ?? 1) + 1,
      trusted_device_version: (state?.trusted_device_version ?? 1) + 1,
      updated_at: new Date().toISOString(),
      user_id: guard.context.user.id,
    },
    { onConflict: "user_id" }
  );
  if (saveError) {
    return json(503, { ok: false, message: "Unable to disable Quick Unlock." });
  }

  const response = json(200, {
    ok: true,
    enabled: false,
    message: "Quick Unlock disabled.",
  });
  clearDeviceUnlockCookie(response);
  clearTrustedDeviceCookie(response);
  clearPinSession(response);
  await recordSecurityAudit({
    eventType: "pin_disabled",
    userId: guard.context.user.id,
  });
  return response;
}
