import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  clearDeviceUnlockCookieMock,
  clearPinSessionMock,
  clearTrustedDeviceCookieMock,
  createRouteSupabaseClientMock,
  getUserMock,
  recordSecurityAuditMock,
  signOutMock,
} = vi.hoisted(() => ({
  clearDeviceUnlockCookieMock: vi.fn(),
  clearPinSessionMock: vi.fn(),
  clearTrustedDeviceCookieMock: vi.fn(),
  createRouteSupabaseClientMock: vi.fn(),
  getUserMock: vi.fn(),
  recordSecurityAuditMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/device-unlock", () => ({
  clearDeviceUnlockCookie: clearDeviceUnlockCookieMock,
  clearTrustedDeviceCookie: clearTrustedDeviceCookieMock,
}));

vi.mock("@/lib/pin-auth", () => ({
  clearPinSession: clearPinSessionMock,
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAudit: recordSecurityAuditMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
}));

function logoutRequest(method: "GET" | "POST", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3104/logout", {
    method,
    headers: {
      host: "localhost:3104",
      origin: "http://localhost:3104",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

describe("/logout", () => {
  beforeEach(() => {
    clearDeviceUnlockCookieMock.mockReset();
    clearPinSessionMock.mockReset();
    clearTrustedDeviceCookieMock.mockReset();
    getUserMock.mockReset().mockResolvedValue({
      data: { user: { id: "owner-id" } },
    });
    recordSecurityAuditMock.mockReset().mockResolvedValue(undefined);
    signOutMock.mockReset().mockResolvedValue({ error: null });
    createRouteSupabaseClientMock.mockReset().mockReturnValue({
      auth: {
        getUser: getUserMock,
        signOut: signOutMock,
      },
    });
  });

  it("keeps GET side-effect free so speculative prefetch cannot sign the owner out", async () => {
    const logoutModule = await import("@/app/logout/route");
    const response = await logoutModule.GET(logoutRequest("GET"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3104/settings/security");
    expect(createRouteSupabaseClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(clearPinSessionMock).not.toHaveBeenCalled();
    expect(clearDeviceUnlockCookieMock).not.toHaveBeenCalled();
    expect(clearTrustedDeviceCookieMock).not.toHaveBeenCalled();
    expect(recordSecurityAuditMock).not.toHaveBeenCalled();
  });

  it("signs out only through an explicit same-origin POST", async () => {
    const logoutModule = (await import("@/app/logout/route")) as unknown as {
      POST?: (request: NextRequest) => Promise<Response>;
    };

    expect(logoutModule.POST).toBeTypeOf("function");
    if (!logoutModule.POST) return;

    const response = await logoutModule.POST(logoutRequest("POST"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3104/login?message=signed_out");
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(clearPinSessionMock).toHaveBeenCalledOnce();
    expect(clearDeviceUnlockCookieMock).toHaveBeenCalledOnce();
    expect(clearTrustedDeviceCookieMock).toHaveBeenCalledOnce();
    expect(recordSecurityAuditMock).toHaveBeenCalledWith({
      eventType: "logout",
      userId: "owner-id",
    });
  });

  it("rejects cross-site POST requests before clearing any session state", async () => {
    const logoutModule = (await import("@/app/logout/route")) as unknown as {
      POST?: (request: NextRequest) => Promise<Response>;
    };

    expect(logoutModule.POST).toBeTypeOf("function");
    if (!logoutModule.POST) return;

    const response = await logoutModule.POST(
      logoutRequest("POST", {
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      })
    );

    expect(response.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(clearPinSessionMock).not.toHaveBeenCalled();
    expect(clearDeviceUnlockCookieMock).not.toHaveBeenCalled();
    expect(clearTrustedDeviceCookieMock).not.toHaveBeenCalled();
    expect(recordSecurityAuditMock).not.toHaveBeenCalled();
  });
});
