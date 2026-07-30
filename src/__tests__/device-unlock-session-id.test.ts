import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createRouteSupabaseClientMock, getClaimsMock, getSessionMock } = vi.hoisted(() => ({
  createRouteSupabaseClientMock: vi.fn(),
  getClaimsMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

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
    createRouteSupabaseClientMock.mockReset().mockReturnValue({
      auth: {
        getClaims: getClaimsMock,
        getSession: getSessionMock,
      },
    });
  });

  it("uses the verified Supabase session_id claim when getSession does not expose a session", async () => {
    const request = new NextRequest("http://localhost:3104/api/settings/security/pin");

    await expect(getRequestSessionId(request)).resolves.toBe("verified-session-id");
    expect(getClaimsMock).toHaveBeenCalledOnce();
  });
});
