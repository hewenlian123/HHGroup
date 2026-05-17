import { NextResponse } from "next/server";

import { getRequestAuthContext, requireAuthenticatedUser } from "@/lib/auth-boundary";
import {
  createPinSession,
  getPinStatus,
  isPinFormat,
  setPin,
  setPinSessionCookie,
  verifyPin,
} from "@/lib/pin-auth";

export const dynamic = "force-dynamic";

type PinSaveBody = {
  currentPin?: unknown;
  newPin?: unknown;
  confirmNewPin?: unknown;
};

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const status = await getPinStatus();
  return json(200, {
    ok: true,
    initialized: status.initialized,
    sessionVersion: status.sessionVersion,
    source: status.source,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as PinSaveBody | null;
  const currentPin = body?.currentPin;
  const newPin = body?.newPin;
  const confirmNewPin = body?.confirmNewPin;

  if (!isPinFormat(newPin)) {
    return json(400, { ok: false, message: "New PIN must be 4 digits." });
  }
  if (newPin !== confirmNewPin) {
    return json(400, { ok: false, message: "PIN confirmation does not match." });
  }

  const status = await getPinStatus();
  if (status.initialized) {
    if (!isPinFormat(currentPin)) {
      return json(401, { ok: false, message: "Invalid current PIN." });
    }
    const current = await verifyPin(currentPin);
    if (!current.ok) {
      return json(401, { ok: false, message: "Invalid current PIN." });
    }
  } else {
    const context = await getRequestAuthContext(request);
    if (context.isProductionLocked && !context.isAuthenticated && !context.hasInternalAdminAccess) {
      return json(401, { ok: false, message: "Authentication required to set the initial PIN." });
    }
  }

  const context = guard.context;
  const updatedBy =
    context.email ??
    (context.hasInternalAdminAccess
      ? "internal-admin"
      : context.hasLocalTestBypass
        ? "test"
        : null);
  const saved = await setPin(newPin, updatedBy);
  if (!saved.ok) {
    return json(503, { ok: false, message: saved.message });
  }

  const session = await createPinSession(saved.sessionVersion);
  if (!session) {
    return json(503, { ok: false, message: "PIN session signing is not configured." });
  }

  const response = json(200, { ok: true, initialized: true });
  setPinSessionCookie(response, session);
  return response;
}
