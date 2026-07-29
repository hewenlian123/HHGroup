import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminUpdateUserMock,
  exchangeCodeForSessionMock,
  getSessionMock,
  recordSecurityAuditMock,
  signOutMock,
  verifyOtpMock,
} = vi.hoisted(() => ({
  adminUpdateUserMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  recordSecurityAuditMock: vi.fn(),
  signOutMock: vi.fn(),
  verifyOtpMock: vi.fn(),
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
      verifyOtp: verifyOtpMock,
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

function verifyRequest(
  body: Record<string, unknown>,
  origin = "http://localhost:3104"
): NextRequest {
  return new NextRequest(`${origin}/api/auth/recovery/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: new URL(origin).host,
      origin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("password recovery callback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    verifyOtpMock.mockReset().mockResolvedValue({
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
  });

  it("sends a trusted code-free recovery callback to OTP verification", async () => {
    const { GET } = await import("@/app/auth/recovery/callback/route");

    const response = await GET(recoveryCallbackRequest(""));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3104/forgot-password?mode=verify"
    );
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("verifies a recovery OTP and binds reset authorization to the returned owner session", async () => {
    const { POST } = await import("@/app/api/auth/recovery/verify/route");

    const response = await POST(verifyRequest({ email: "owner@example.test", token: "123456" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "owner@example.test",
      token: "123456",
      type: "recovery",
    });
    expect(body).toEqual({ ok: true, redirectTo: "/reset-password" });
    expect(JSON.stringify(body)).not.toMatch(/owner@example|123456|token|session/i);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("hh_recovery_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("123456");
  });

  it("returns the same safe OTP error for invalid, expired, or replayed codes", async () => {
    const { POST } = await import("@/app/api/auth/recovery/verify/route");
    verifyOtpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "otp_expired with provider detail" },
    });

    const response = await POST(verifyRequest({ email: "owner@example.test", token: "654321" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      ok: false,
      message: "Recovery code is invalid or has expired.",
    });
    expect(JSON.stringify(body)).not.toMatch(/owner@example|654321|provider|otp_expired/i);
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("rejects recovery OTP sessions that are not authorized owners or admins", async () => {
    const { POST } = await import("@/app/api/auth/recovery/verify/route");
    verifyOtpMock.mockResolvedValue({
      data: {
        session: { access_token: accessToken() },
        user: {
          app_metadata: { role: "assistant" },
          email: "assistant@example.test",
          id: "assistant-id",
        },
      },
      error: null,
    });

    const response = await POST(
      verifyRequest({ email: "assistant@example.test", token: "123456" })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
  });

  it("rejects cross-origin OTP verification before contacting Supabase", async () => {
    const { POST } = await import("@/app/api/auth/recovery/verify/route");
    const request = verifyRequest(
      { email: "owner@example.test", token: "123456" },
      "http://localhost:3104"
    );
    request.headers.set("origin", "https://evil.test");
    request.headers.set("sec-fetch-site", "cross-site");

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(verifyOtpMock).not.toHaveBeenCalled();
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

  it("rejects a recovery callback delivered to a stale Preview host before code exchange", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "hh-group-current-immutable-hhwilliamhe-4916s-projects.vercel.app");
    const { GET } = await import("@/app/auth/recovery/callback/route");
    const staleHost = "hh-group-stale-immutable-hhwilliamhe-4916s-projects.vercel.app";
    const response = await GET(
      new NextRequest(`https://${staleHost}/auth/recovery/callback?code=recovery-code`, {
        headers: {
          host: staleHost,
          "x-forwarded-host": staleHost,
          "x-forwarded-proto": "https",
        },
      })
    );

    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://hh-group-current-immutable-hhwilliamhe-4916s-projects.vercel.app/reset-password?error=invalid_or_expired_link"
    );
    expect(response.headers.get("set-cookie") ?? "").not.toContain("hh_recovery_session=");
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
