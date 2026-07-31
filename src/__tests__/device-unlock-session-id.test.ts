import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createRouteSupabaseClientMock, getClaimsMock, getSessionMock, getUserMock } = vi.hoisted(
  () => ({
    createRouteSupabaseClientMock: vi.fn(),
    getClaimsMock: vi.fn(),
    getSessionMock: vi.fn(),
    getUserMock: vi.fn(),
  })
);

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
}));

import { getRequestSessionId } from "@/lib/device-unlock";

describe("request session binding", () => {
  beforeEach(() => {
    getClaimsMock.mockReset().mockResolvedValue({
      data: { claims: { session_id: "verified-session-id" } },
      error: null,
    });
    getSessionMock.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    getUserMock.mockReset().mockResolvedValue({
      data: { user: { id: "owner-user-id" } },
      error: null,
    });
    createRouteSupabaseClientMock.mockReset().mockReturnValue({
      auth: {
        getClaims: getClaimsMock,
        getSession: getSessionMock,
        getUser: getUserMock,
      },
    });
  });

  it("uses the verified Supabase session_id claim when getSession does not expose a session", async () => {
    const request = new NextRequest("http://localhost:3104/api/settings/security/pin");

    await expect(getRequestSessionId(request)).resolves.toBe("verified-session-id");
    expect(getClaimsMock).toHaveBeenCalledOnce();
  });

  it("hydrates the SSR cookie session before reading the access-token session_id fallback", async () => {
    let hydrated = false;
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    getUserMock.mockImplementation(async () => {
      hydrated = true;
      return {
        data: { user: { id: "owner-user-id" } },
        error: null,
      };
    });
    const payload = Buffer.from(JSON.stringify({ session_id: "hydrated-session-id" })).toString(
      "base64url"
    );
    getSessionMock.mockImplementation(async () => ({
      data: {
        session: hydrated ? { access_token: `header.${payload}.signature` } : null,
      },
      error: null,
    }));

    const request = new NextRequest("http://localhost:3104/api/settings/security/pin");

    await expect(getRequestSessionId(request)).resolves.toBe("hydrated-session-id");
    expect(getUserMock).toHaveBeenCalledOnce();
  });

  it("uses only a verified same-user Supabase bearer claim for cookie-less session binding", async () => {
    const accessToken = "explicit-supabase-access-token";
    getClaimsMock.mockImplementation(async (jwt?: string) =>
      jwt === accessToken
        ? {
            data: {
              claims: {
                session_id: "bearer-session-id",
                sub: "owner-user-id",
              },
            },
            error: null,
          }
        : { data: null, error: null }
    );
    const request = new NextRequest("http://localhost:3104/api/settings/security/pin", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    await expect(getRequestSessionId(request, "owner-user-id")).resolves.toBe("bearer-session-id");
    await expect(getRequestSessionId(request, "different-user-id")).resolves.toBeNull();
    expect(getClaimsMock).toHaveBeenCalledWith(accessToken);
  });
});
