import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminUpdateUserMock,
  exchangeCodeForSessionMock,
  getSessionMock,
  recordSecurityAuditMock,
  signOutMock,
} = vi.hoisted(() => ({
  adminUpdateUserMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  recordSecurityAuditMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  }),
}));

vi.mock("@/lib/auth-boundary", () => ({
  requireSupabaseOwnerOrAdmin: vi.fn().mockResolvedValue({
    ok: true,
    context: {
      email: "owner@example.test",
      role: "owner",
      user: {
        app_metadata: { role: "owner" },
        email: "owner@example.test",
        id: "owner-id",
      },
    },
  }),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAudit: recordSecurityAuditMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: () => ({
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
    },
  }),
  getServerSupabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById: adminUpdateUserMock,
      },
    },
  }),
}));

function accessToken(sessionId = "recovery-session-id"): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url");
  return `header.${payload}.signature`;
}

function callbackRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3104/auth/callback?${query}`);
}

function recoveryCallbackRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3104/auth/recovery/callback?${query}`);
}

function forwardedRecoveryCallbackRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3104/auth/recovery/callback?${query}`, {
    headers: {
      host: "127.0.0.1:3104",
      "x-forwarded-host": "127.0.0.1:3104",
      "x-forwarded-proto": "http",
    },
  });
}

function resetRequest(cookie?: string): NextRequest {
  return new NextRequest("http://localhost:3104/api/auth/reset-password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3104",
      origin: "http://localhost:3104",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      newPassword: "Reset-Password-2026!",
      confirmPassword: "Reset-Password-2026!",
    }),
  });
}

describe("password recovery callback", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
    process.env.HH_PIN_SESSION_SECRET = "local-recovery-test-secret";

    adminUpdateUserMock.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
    exchangeCodeForSessionMock.mockReset().mockResolvedValue({
      data: {
        session: { access_token: accessToken() },
        user: {
          app_metadata: { role: "owner" },
          email: "owner@example.test",
          id: "owner-id",
        },
      },
      error: null,
    });
    getSessionMock.mockReset().mockResolvedValue({
      data: {
        session: {
          access_token: accessToken(),
          user: {
            app_metadata: { role: "owner" },
            email: "owner@example.test",
            id: "owner-id",
          },
        },
      },
      error: null,
    });
    recordSecurityAuditMock.mockReset().mockResolvedValue(undefined);
    signOutMock.mockReset().mockResolvedValue({ error: null });
  });

  it("marks a recovery callback and sends it to the reset form", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");

    const response = await GET(recoveryCallbackRequest("code=recovery-code"));

    expect(response.headers.get("location")).toBe("http://localhost:3104/reset-password");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("hh_recovery_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("recovery-code");
  });

  it("keeps callback cookies and navigation on the validated forwarded app host", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");

    const response = await GET(forwardedRecoveryCallbackRequest("code=recovery-code"));

    expect(response.headers.get("location")).toBe("http://127.0.0.1:3104/reset-password");
    expect(response.headers.get("set-cookie") ?? "").toContain("hh_recovery_session=");
  });

  it("does not trust a client-controlled recovery type on the normal callback", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest("code=recovery-code&type=recovery"));

    expect(response.headers.get("location")).toBe("http://localhost:3104/dashboard");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("keeps a normal login on its safe route without recovery authorization", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest("code=login-code&redirect=%2Ffinancial%2Finbox"));

    expect(response.headers.get("location")).toBe("http://localhost:3104/financial/inbox");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("does not let a normal login claim the reset-password route", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(callbackRequest("code=login-code&redirect=%2Freset-password"));

    expect(response.headers.get("location")).toBe("http://localhost:3104/dashboard");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("shows a safe reset error for an expired recovery callback", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");
    exchangeCodeForSessionMock.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "expired provider token with sensitive detail" },
    });

    const response = await GET(recoveryCallbackRequest("code=expired-code"));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3104/reset-password?error=invalid_or_expired_link"
    );
    expect(response.headers.get("location")).not.toContain("sensitive");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("rejects an external redirect and never reflects it", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      callbackRequest("code=login-code&redirect=https%3A%2F%2Fevil.test%2Fsteal")
    );

    expect(response.headers.get("location")).toBe("http://localhost:3104/dashboard");
    expect(response.headers.get("location")).not.toContain("evil.test");
  });

  it("rejects reset-password API use by a normal authenticated session", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const response = await POST(resetRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: "Password recovery session is invalid or has expired.",
    });
    expect(adminUpdateUserMock).not.toHaveBeenCalled();
  });

  it("accepts the recovery cookie only for the matching recovery session", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const callback = await GET(recoveryCallbackRequest("code=recovery-code"));
    const cookie = callback.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const response = await POST(resetRequest(cookie));

    expect(response.status).toBe(200);
    expect(adminUpdateUserMock).toHaveBeenCalledWith("owner-id", {
      password: "Reset-Password-2026!",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
    expect(response.headers.get("set-cookie") ?? "").toContain("hh_recovery_session=;");
  });

  it("rejects a recovery cookie when the active session changes", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const callback = await GET(recoveryCallbackRequest("code=recovery-code"));
    const cookie = callback.headers.get("set-cookie")?.split(";")[0];
    getSessionMock.mockResolvedValueOnce({
      data: {
        session: {
          access_token: accessToken("different-session-id"),
          user: { id: "owner-id" },
        },
      },
      error: null,
    });

    const response = await POST(resetRequest(cookie));

    expect(response.status).toBe(403);
    expect(adminUpdateUserMock).not.toHaveBeenCalled();
  });
});
