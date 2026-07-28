import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseUserFromRequestMock, isValidPinSessionMock } = vi.hoisted(() => ({
  getSupabaseUserFromRequestMock: vi.fn(),
  isValidPinSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseUserFromRequest: getSupabaseUserFromRequestMock,
}));

vi.mock("@/lib/pin-auth", () => ({
  isValidPinSession: isValidPinSessionMock,
}));

import { authorizedAppRole, isAuthorizedAppRole } from "@/lib/auth-role";
import { requireSupabaseOwnerOrAdmin } from "@/lib/auth-boundary";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { validateSameOriginMutation } from "@/lib/auth-request-security";
import { isCompatibilityAccessEnabled } from "@/lib/owner-access-mode";
import { validatePassword } from "@/lib/password-policy";

const ORIGINAL_ENV = { ...process.env };

describe("authenticated owner-access security primitives", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.HH_INTERNAL_ADMIN_SECRET;
    delete process.env.INTERNAL_ADMIN_SECRET;
    delete process.env.HH_ADMIN_EMAILS;
    getSupabaseUserFromRequestMock.mockReset().mockResolvedValue(null);
    isValidPinSessionMock.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  it("never lets the local no-login flag override production strict mode", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "production",
        requireLogin: "true",
        allowLocal: "1",
      })
    ).toBe(false);
  });

  it("requires an explicit development-only owner no-login flag", () => {
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: "1",
      })
    ).toBe(true);
    expect(
      isCompatibilityAccessEnabled({
        runtime: "development",
        requireLogin: "false",
        allowLocal: undefined,
      })
    ).toBe(false);
  });

  it("authorizes roles only from server-owned app metadata", () => {
    expect(isAuthorizedAppRole({ app_metadata: { role: "owner" } })).toBe(true);
    expect(isAuthorizedAppRole({ app_metadata: { role: "admin" } })).toBe(true);
    expect(isAuthorizedAppRole({ user_metadata: { role: "owner" } })).toBe(false);
    expect(authorizedAppRole({ app_metadata: { role: "assistant" } })).toBeNull();
  });

  it("normalizes external, protocol-relative, and auth-loop redirects", () => {
    expect(normalizeAuthRedirect("https://evil.test")).toBe("/dashboard");
    expect(normalizeAuthRedirect("//evil.test/path")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/login?redirect=/financial/inbox")).toBe("/dashboard");
    expect(normalizeAuthRedirect("/financial/inbox?filter=pending")).toBe(
      "/financial/inbox?filter=pending"
    );
  });

  it("rejects a cross-site mutation and permits a same-origin mutation", () => {
    const crossSite = new Request("https://app.hh.test/api/expenses", {
      method: "POST",
      headers: {
        host: "app.hh.test",
        origin: "https://evil.test",
        "sec-fetch-site": "cross-site",
      },
    });
    const sameOrigin = new Request("https://app.hh.test/api/expenses", {
      method: "POST",
      headers: {
        host: "app.hh.test",
        origin: "https://app.hh.test",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(validateSameOriginMutation(crossSite).ok).toBe(false);
    expect(validateSameOriginMutation(sameOrigin).ok).toBe(true);
  });

  it("enforces the HH Group password policy", () => {
    expect(validatePassword("weak").ok).toBe(false);
    expect(validatePassword("alllowercase-but-long-2026!").ok).toBe(false);
    expect(validatePassword("Hh-Owner-2026!Long").ok).toBe(true);
  });

  it("does not let PIN, internal headers, or local no-login satisfy strict Auth", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";
    process.env.HH_INTERNAL_ADMIN_SECRET = "test-only-secret";

    const request = new Request("http://localhost:3104/api/financial/expenses", {
      headers: {
        "x-internal-admin-secret": "test-only-secret",
        "x-hh-test-auth-bypass": "1",
      },
    });

    const result = await requireSupabaseOwnerOrAdmin(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("accepts a Supabase owner or admin in the strict guard", async () => {
    getSupabaseUserFromRequestMock.mockResolvedValue({
      app_metadata: { role: "owner" },
      email: "owner@example.test",
      id: "owner-id",
      user_metadata: {},
    });

    const result = await requireSupabaseOwnerOrAdmin(
      new Request("http://localhost:3104/api/financial/expenses")
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.role).toBe("owner");
      expect(result.context.user.id).toBe("owner-id");
    }
  });
});
