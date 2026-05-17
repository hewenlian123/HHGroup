import { NextResponse } from "next/server";

import { createPinSession, isPinFormat, setPinSessionCookie, verifyPin } from "@/lib/pin-auth";

export const dynamic = "force-dynamic";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 8;

type AttemptRecord = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptRecord>();

function clientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  attempts.set(key, { count: current.count + 1, resetAt: current.resetAt });
}

export async function POST(request: Request): Promise<NextResponse> {
  const key = clientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Try again later." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = body?.pin;
  if (!isPinFormat(pin)) {
    return NextResponse.json(
      { ok: false, message: "PIN must be 4 digits." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await verifyPin(pin);
  if (!result.ok) {
    if (result.setupRequired) {
      return NextResponse.json(
        { ok: false, setup_required: true, message: "PIN setup required." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (result.message !== "Invalid PIN") {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    recordFailure(key);
    return NextResponse.json(
      { ok: false, message: "Invalid PIN" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  attempts.delete(key);
  const session = await createPinSession(result.sessionVersion);
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "PIN login is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
  setPinSessionCookie(response, session);
  return response;
}
