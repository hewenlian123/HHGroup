import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  getRequestSessionIdMock,
  hashQuickUnlockPinMock,
  requireStrictAuthMock,
  setDeviceUnlockCookiesMock,
  verifyCurrentPasswordMock,
} = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  getRequestSessionIdMock: vi.fn(),
  hashQuickUnlockPinMock: vi.fn(),
  requireStrictAuthMock: vi.fn(),
  setDeviceUnlockCookiesMock: vi.fn(),
  verifyCurrentPasswordMock: vi.fn(),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: requireStrictAuthMock,
}));

vi.mock("@/lib/current-password", () => ({
  verifyCurrentPassword: verifyCurrentPasswordMock,
}));

vi.mock("@/lib/device-unlock", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/device-unlock")>();
  return {
    ...original,
    getRequestSessionId: getRequestSessionIdMock,
    hashQuickUnlockPin: hashQuickUnlockPinMock,
    setDeviceUnlockCookies: setDeviceUnlockCookiesMock,
  };
});

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabaseAdmin: () => ({
    from: adminFromMock,
  }),
}));

import { DELETE, GET, POST } from "@/app/api/settings/security/pin/route";

function request(method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>) {
  return new NextRequest("http://localhost:3104/api/settings/security/pin", {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      host: "localhost:3104",
      origin: "http://localhost:3104",
      "sec-fetch-site": "same-origin",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function queryBuilder(row: Record<string, unknown> | null = null) {
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    select: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  return builder;
}

describe("Settings Security per-user PIN route", () => {
  beforeEach(() => {
    const state = queryBuilder({
      pin_hash: null,
      pin_salt: null,
      pin_version: 1,
      trusted_device_version: 1,
    });
    const audit = queryBuilder();
    adminFromMock
      .mockReset()
      .mockImplementation((table: string) =>
        table === "app_user_security_settings" ? state : audit
      );
    requireStrictAuthMock.mockReset().mockResolvedValue({
      ok: true,
      context: {
        email: "owner@example.test",
        role: "owner",
        user: { id: "owner-id", app_metadata: { role: "owner" } },
      },
    });
    verifyCurrentPasswordMock.mockReset().mockResolvedValue(true);
    getRequestSessionIdMock.mockReset().mockResolvedValue("session-id");
    hashQuickUnlockPinMock.mockReset().mockResolvedValue({
      hash: "derived-hash",
      iterations: 310000,
      salt: "random-salt",
    });
    setDeviceUnlockCookiesMock.mockReset().mockResolvedValue(true);
  });

  it("does not reveal PIN state without a valid Supabase owner/admin session", async () => {
    requireStrictAuthMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, message: "Authentication required." }), {
        status: 401,
      }),
    });

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it("requires the current password to enable or change PIN", async () => {
    const response = await POST(
      request("POST", {
        pin: "805274",
        confirmPin: "805274",
      })
    );

    expect(response.status).toBe(401);
    expect(hashQuickUnlockPinMock).not.toHaveBeenCalled();
  });

  it("stores only the six-digit PIN hash and binds the trusted-device cookies", async () => {
    const response = await POST(
      request("POST", {
        currentPassword: "Current-Password-2026!",
        pin: "805274",
        confirmPin: "805274",
      })
    );

    expect(response.status).toBe(200);
    expect(verifyCurrentPasswordMock).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "Current-Password-2026!",
      userId: "owner-id",
    });
    expect(hashQuickUnlockPinMock).toHaveBeenCalledWith("805274");
    const stateBuilder = adminFromMock.mock.results[0]?.value;
    const stored = stateBuilder.upsert.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      pin_hash: "derived-hash",
      pin_salt: "random-salt",
      user_id: "owner-id",
    });
    expect(JSON.stringify(stored)).not.toContain("805274");
    expect(setDeviceUnlockCookiesMock).toHaveBeenCalledWith(expect.anything(), {
      pinVersion: 2,
      sessionId: "session-id",
      userId: "owner-id",
    });
  });

  it("requires current-password verification to disable PIN", async () => {
    verifyCurrentPasswordMock.mockResolvedValue(false);

    const response = await DELETE(request("DELETE", { currentPassword: "Wrong-Password-2026!" }));

    expect(response.status).toBe(401);
  });
});
