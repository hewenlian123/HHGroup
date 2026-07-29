import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminUpdateUserMock,
  createRouteSupabaseClientMock,
  createTransientSupabaseClientMock,
  getSessionMock,
  resetPasswordForEmailMock,
  signInWithPasswordMock,
  signOutMock,
} = vi.hoisted(() => ({
  adminUpdateUserMock: vi.fn(),
  createRouteSupabaseClientMock: vi.fn(),
  createTransientSupabaseClientMock: vi.fn(),
  getSessionMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
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

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
  createTransientSupabaseClient: createTransientSupabaseClientMock,
  getServerSupabaseAdmin: () => ({
    auth: {
      admin: {
        updateUserById: adminUpdateUserMock,
      },
    },
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

function mutationRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3104${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3104",
      origin: "http://localhost:3104",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("password recovery and security routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    adminUpdateUserMock.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
    resetPasswordForEmailMock.mockReset();
    getSessionMock.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    signInWithPasswordMock.mockReset();
    signOutMock.mockReset().mockResolvedValue({ error: null });
    createRouteSupabaseClientMock.mockReset().mockImplementation(() => ({
      auth: {
        getSession: getSessionMock,
        resetPasswordForEmail: resetPasswordForEmailMock,
        signOut: signOutMock,
      },
    }));
    createTransientSupabaseClientMock.mockReset().mockReturnValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    });
  });

  it("returns the same accepted response whether a recovery email exists or not", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");

    resetPasswordForEmailMock.mockResolvedValueOnce({ error: null });
    const success = await POST(
      mutationRequest("/api/auth/forgot-password", { email: "owner@example.test" })
    );

    resetPasswordForEmailMock.mockResolvedValueOnce({
      error: { message: "User not found" },
    });
    const missing = await POST(
      mutationRequest("/api/auth/forgot-password", { email: "missing@example.test" })
    );

    expect(success.status).toBe(202);
    expect(missing.status).toBe(202);
    const successBody = await success.json();
    const missingBody = await missing.json();
    expect(successBody).toEqual(missingBody);
    expect(JSON.stringify(missingBody)).not.toContain("User not found");
  });

  it("uses the exact dedicated recovery callback and never forwards an arbitrary redirect", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });

    await POST(
      mutationRequest("/api/auth/forgot-password", {
        email: "owner@example.test",
        redirect: "https://evil.test/steal",
      })
    );

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "http://localhost:3104/auth/recovery/callback",
    });
  });

  it("builds the recovery callback from the validated forwarded app host", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    const request = mutationRequest("/api/auth/forgot-password", {
      email: "owner@example.test",
    });
    request.headers.set("host", "127.0.0.1:3104");
    request.headers.set("origin", "http://127.0.0.1:3104");
    request.headers.set("x-forwarded-host", "127.0.0.1:3104");
    request.headers.set("x-forwarded-proto", "http");

    await POST(request);

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "http://127.0.0.1:3104/auth/recovery/callback",
    });
  });

  it("refuses recovery requests from a stale Preview host", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "hh-group-current-immutable-hhwilliamhe-4916s-projects.vercel.app");
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    const staleOrigin = "https://hh-group-stale-immutable-hhwilliamhe-4916s-projects.vercel.app";
    const request = new NextRequest(`${staleOrigin}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: new URL(staleOrigin).host,
        origin: staleOrigin,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "198.51.100.40",
        "x-forwarded-host": new URL(staleOrigin).host,
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "owner@example.test" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("uses the server-owned immutable Preview origin for a matching request", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "hh-group-current-immutable-hhwilliamhe-4916s-projects.vercel.app");
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    const previewOrigin =
      "https://hh-group-current-immutable-hhwilliamhe-4916s-projects.vercel.app";
    const request = new NextRequest(`${previewOrigin}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: new URL(previewOrigin).host,
        origin: previewOrigin,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "198.51.100.41",
        "x-forwarded-host": new URL(previewOrigin).host,
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "owner@example.test" }),
    });

    await POST(request);

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: `${previewOrigin}/auth/recovery/callback`,
    });
  });

  it("requires the explicit canonical APP_URL for production recovery", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://hhprojectgroup.com");
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    const request = new NextRequest("https://hhprojectgroup.com/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "hhprojectgroup.com",
        origin: "https://hhprojectgroup.com",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "198.51.100.42",
        "x-forwarded-host": "hhprojectgroup.com",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "owner@example.test" }),
    });

    await POST(request);

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "https://hhprojectgroup.com/auth/recovery/callback",
    });
  });

  it("fails closed when the production APP_URL is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_URL", "https://hhprojectgroup.com/unexpected-path");
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    const request = new NextRequest("https://hhprojectgroup.com/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "hhprojectgroup.com",
        origin: "https://hhprojectgroup.com",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "198.51.100.43",
        "x-forwarded-host": "hhprojectgroup.com",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "owner@example.test" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("rejects a weak or mismatched password before current-password verification", async () => {
    const { POST } = await import("@/app/api/settings/security/password/route");

    const weak = await POST(
      mutationRequest("/api/settings/security/password", {
        currentPassword: "Old-Password-2026!",
        newPassword: "weak",
        confirmPassword: "weak",
      })
    );
    const mismatch = await POST(
      mutationRequest("/api/settings/security/password", {
        currentPassword: "Old-Password-2026!",
        newPassword: "New-Password-2026!",
        confirmPassword: "Different-Password-2026!",
      })
    );

    expect(weak.status).toBe(400);
    expect(mismatch.status).toBe(400);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password with a generic error", async () => {
    const { POST } = await import("@/app/api/settings/security/password/route");
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const response = await POST(
      mutationRequest("/api/settings/security/password", {
        currentPassword: "Wrong-Password-2026!",
        newPassword: "New-Password-2026!",
        confirmPassword: "New-Password-2026!",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: "Current password could not be verified.",
    });
    expect(adminUpdateUserMock).not.toHaveBeenCalled();
  });

  it("changes the password after verification and revokes only other sessions", async () => {
    const { POST } = await import("@/app/api/settings/security/password/route");
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "owner-id" } },
      error: null,
    });

    const response = await POST(
      mutationRequest("/api/settings/security/password", {
        currentPassword: "Old-Password-2026!",
        newPassword: "New-Password-2026!",
        confirmPassword: "New-Password-2026!",
      })
    );

    expect(response.status).toBe(200);
    expect(adminUpdateUserMock).toHaveBeenCalledWith("owner-id", {
      password: "New-Password-2026!",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
    expect(signOutMock).not.toHaveBeenCalledWith({ scope: "global" });
  });

  it("does not treat an ordinary owner session as a password-recovery session", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const response = await POST(
      mutationRequest("/api/auth/reset-password", {
        newPassword: "Reset-Password-2026!",
        confirmPassword: "Reset-Password-2026!",
      })
    );

    expect(response.status).toBe(403);
    expect(adminUpdateUserMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalledWith({ scope: "global" });
    expect(await response.json()).toMatchObject({
      ok: false,
      message: "Password recovery session is invalid or has expired.",
    });
  });

  it("reports only reliable current-session facts and can revoke other sessions", async () => {
    const { GET, POST } = await import("@/app/api/settings/security/sessions/route");

    const current = await GET(
      new NextRequest("http://localhost:3104/api/settings/security/sessions")
    );
    const currentBody = await current.json();
    expect(current.status).toBe(200);
    expect(currentBody).toMatchObject({
      ok: true,
      current: {
        email: "owner@example.test",
        role: "owner",
      },
      limitation: expect.any(String),
    });
    expect(JSON.stringify(currentBody)).not.toMatch(/refresh_token|access_token/i);

    const revoked = await POST(
      mutationRequest("/api/settings/security/sessions", { scope: "others" })
    );
    expect(revoked.status).toBe(200);
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
  });
});
