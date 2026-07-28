import { NextRequest, NextResponse } from "next/server";

import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import {
  getRequestSessionId,
  setDeviceUnlockCookies,
  validateQuickUnlockPin,
  verifyQuickUnlockForUser,
} from "@/lib/device-unlock";
import { recordSecurityAudit } from "@/lib/security-audit";

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

  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = validateQuickUnlockPin(body?.pin);
  if (!pin.ok) {
    return json(400, { ok: false, message: "Enter your 6-digit PIN." });
  }

  const sessionId = await getRequestSessionId(request);
  if (!sessionId) {
    return json(401, { ok: false, message: "Authentication required." });
  }

  const result = await verifyQuickUnlockForUser(guard.context.user.id, pin.value);
  if (!result.ok) {
    const status =
      result.reason === "locked"
        ? 429
        : result.reason === "disabled"
          ? 409
          : result.reason === "unavailable"
            ? 503
            : 401;
    const message =
      result.reason === "locked"
        ? "Quick Unlock is temporarily locked. Use your password or try again later."
        : result.reason === "disabled"
          ? "Quick Unlock is not enabled."
          : result.reason === "unavailable"
            ? "Quick Unlock is temporarily unavailable."
            : "Unable to unlock with that PIN.";
    return json(status, {
      ok: false,
      message,
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    });
  }

  const response = json(200, { ok: true, redirectTo: "/dashboard" });
  const cookiesSet = await setDeviceUnlockCookies(response, {
    pinVersion: result.pinVersion,
    sessionId,
    userId: guard.context.user.id,
  });
  if (!cookiesSet) {
    return json(503, {
      ok: false,
      message: "Quick Unlock signing is not configured.",
    });
  }

  await recordSecurityAudit({
    eventType: "pin_unlock_succeeded",
    userId: guard.context.user.id,
  });
  return response;
}
