import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminUpdateUserMock,
  createRouteSupabaseClientMock,
  createTransientSupabaseClientMock,
  resetPasswordForEmailMock,
  signInWithPasswordMock,
  signOutMock,
} = vi.hoisted(() => ({
  adminUpdateUserMock: vi.fn(),
  createRouteSupabaseClientMock: vi.fn(),
  createTransientSupabaseClientMock: vi.fn(),
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
  beforeEach(() => {
    adminUpdateUserMock.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
    resetPasswordForEmailMock.mockReset();
    signInWithPasswordMock.mockReset();
    signOutMock.mockReset().mockResolvedValue({ error: null });
    createRouteSupabaseClientMock.mockReset().mockImplementation(() => ({
      auth: {
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

  it("uses an exact local callback and never forwards an arbitrary redirect", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    resetPasswordForEmailMock.mockResolvedValue({ error: null });

    await POST(
      mutationRequest("/api/auth/forgot-password", {
        email: "owner@example.test",
        redirect: "https://evil.test/steal",
      })
    );

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("owner@example.test", {
      redirectTo: "http://localhost:3104/auth/callback?redirect=%2Freset-password",
    });
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

  it("reset updates the recovery-session user and signs out globally", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const response = await POST(
      mutationRequest("/api/auth/reset-password", {
        newPassword: "Reset-Password-2026!",
        confirmPassword: "Reset-Password-2026!",
      })
    );

    expect(response.status).toBe(200);
    expect(adminUpdateUserMock).toHaveBeenCalledWith("owner-id", {
      password: "Reset-Password-2026!",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
    expect(await response.json()).toMatchObject({
      ok: true,
      redirectTo: "/login?message=password_reset",
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
