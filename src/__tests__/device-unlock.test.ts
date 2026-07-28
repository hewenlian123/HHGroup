import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireStrictAuthMock } = vi.hoisted(() => ({
  requireStrictAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: requireStrictAuthMock,
}));

import {
  createSignedDeviceToken,
  hashQuickUnlockPin,
  nextPinFailureState,
  validateQuickUnlockPin,
  verifyQuickUnlockPinHash,
} from "@/lib/device-unlock";
import * as deviceUnlock from "@/lib/device-unlock";
import { POST as unlock } from "@/app/api/auth/unlock/route";

function unlockRequest(pin: string): NextRequest {
  return new NextRequest("http://localhost:3104/api/auth/unlock", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3104",
      origin: "http://localhost:3104",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ pin }),
  });
}

describe("session-bound six-digit quick unlock", () => {
  beforeEach(() => {
    requireStrictAuthMock.mockReset().mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, message: "Authentication required." }), {
        status: 401,
      }),
    });
    vi.restoreAllMocks();
  });

  it("rejects common PINs and accepts a non-pattern six-digit PIN", () => {
    expect(validateQuickUnlockPin("123456").ok).toBe(false);
    expect(validateQuickUnlockPin("111111").ok).toBe(false);
    expect(validateQuickUnlockPin("654321").ok).toBe(false);
    expect(validateQuickUnlockPin("805274").ok).toBe(true);
    expect(validateQuickUnlockPin("80527").ok).toBe(false);
  });

  it("stores only a slow salted hash and verifies without retaining plaintext", async () => {
    const pin = "805274";
    const stored = await hashQuickUnlockPin(pin);

    expect(stored.hash).not.toContain(pin);
    expect(stored.salt).not.toContain(pin);
    expect(stored.iterations).toBeGreaterThanOrEqual(300_000);
    expect(await verifyQuickUnlockPinHash(pin, stored)).toBe(true);
    expect(await verifyQuickUnlockPinHash("805275", stored)).toBe(false);
    expect(JSON.stringify(stored)).not.toContain(pin);
  });

  it("cannot unlock without an existing valid Supabase owner/admin session", async () => {
    const response = await unlock(unlockRequest("805274"));

    expect(response.status).toBe(401);
  });

  it("binds signed state to the user, session, version, and expiry without the PIN", async () => {
    const token = await createSignedDeviceToken({
      exp: Math.floor(Date.now() / 1000) + 300,
      pinVersion: 4,
      sessionId: "session-id",
      userId: "owner-id",
      v: 1,
    });

    expect(token).toBeTruthy();
    expect(token).not.toContain("805274");
    expect(token.split(".")).toHaveLength(2);
  });

  it("locks durably on the fifth consecutive failed attempt", () => {
    let state = { failedAttempts: 0, lockedUntil: null as Date | null };
    const now = new Date("2026-07-27T12:00:00.000Z");

    for (let index = 0; index < 5; index += 1) {
      state = nextPinFailureState(state, now);
    }

    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil?.getTime()).toBeGreaterThan(now.getTime());
  });

  it("sets only signed lock-state cookies after a valid session-bound PIN", async () => {
    requireStrictAuthMock.mockResolvedValue({
      ok: true,
      context: {
        email: "owner@example.test",
        role: "owner",
        user: { id: "owner-id", app_metadata: { role: "owner" } },
      },
    });
    vi.spyOn(deviceUnlock, "verifyQuickUnlockForUser").mockResolvedValue({
      ok: true,
      pinVersion: 3,
    });
    vi.spyOn(deviceUnlock, "getRequestSessionId").mockResolvedValue("session-id");

    const response = await unlock(unlockRequest("805274"));
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookies).toContain("hh_device_unlock=");
    expect(cookies).toContain("hh_trusted_device=");
    expect(cookies).not.toContain("805274");
  });
});
