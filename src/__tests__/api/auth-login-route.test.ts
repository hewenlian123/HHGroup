import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { createRouteSupabaseClientMock, insertAuditMock, signInWithPasswordMock, signOutMock } =
  vi.hoisted(() => ({
    createRouteSupabaseClientMock: vi.fn(),
    insertAuditMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
    signOutMock: vi.fn(),
  }));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
  getServerSupabaseAdmin: () => ({
    from: () => ({ insert: insertAuditMock }),
  }),
}));

import { POST } from "@/app/api/auth/login/route";

function loginRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost:3104/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3104",
      origin: "http://localhost:3104",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": crypto.randomUUID(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    insertAuditMock.mockReset().mockResolvedValue({ error: null });
    signInWithPasswordMock.mockReset();
    signOutMock.mockReset().mockResolvedValue({ error: null });
    createRouteSupabaseClientMock.mockReset().mockImplementation(() => ({
      auth: {
        signInWithPassword: signInWithPasswordMock,
        signOut: signOutMock,
      },
    }));
  });

  it("establishes a cookie-backed session for valid owner credentials", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: {
          app_metadata: { role: "owner" },
          email: "owner@example.test",
          id: "owner-id",
        },
      },
      error: null,
    });

    const response = await POST(
      loginRequest({
        email: "owner@example.test",
        password: "Hh-Owner-2026!Long",
        redirect: "/financial/inbox",
        rememberDevice: true,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      redirectTo: "/financial/inbox",
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "Hh-Owner-2026!Long",
    });
    expect(createRouteSupabaseClientMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      { persistent: true }
    );
  });

  it("returns one generic message for invalid credentials", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    const response = await POST(
      loginRequest({
        email: "missing@example.test",
        password: "Not-The-Password-2026!",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Unable to sign in with those credentials.",
    });
  });

  it("denies a signed-in user without owner/admin app metadata", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: {
          app_metadata: {},
          email: "assistant@example.test",
          id: "assistant-id",
          user_metadata: { role: "owner" },
        },
      },
      error: null,
    });

    const response = await POST(
      loginRequest({
        email: "assistant@example.test",
        password: "Assistant-Password-2026!",
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Unable to sign in with those credentials.",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects cross-site requests before reading credentials", async () => {
    const response = await POST(
      loginRequest(
        {
          email: "owner@example.test",
          password: "Hh-Owner-2026!Long",
        },
        {
          origin: "https://evil.test",
          "sec-fetch-site": "cross-site",
        }
      )
    );

    expect(response.status).toBe(403);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects open redirects", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        user: {
          app_metadata: { role: "admin" },
          email: "admin@example.test",
          id: "admin-id",
        },
      },
      error: null,
    });

    const response = await POST(
      loginRequest({
        email: "admin@example.test",
        password: "Admin-Password-2026!",
        redirect: "https://evil.test/steal",
      })
    );

    expect((await response.json()).redirectTo).toBe("/dashboard");
  });

  it("does not expose a registration method", async () => {
    const loginModule = await import("@/app/api/auth/login/route");
    expect("PUT" in loginModule).toBe(false);
    expect("PATCH" in loginModule).toBe(false);
  });
});
