import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRouteSupabaseClientMock,
  createServerSupabaseClientMock,
  getSupabaseUserFromRequestMock,
  getSupabaseUserFromServerSessionMock,
  isValidPinSessionMock,
} = vi.hoisted(() => ({
  createRouteSupabaseClientMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  getSupabaseUserFromRequestMock: vi.fn(),
  getSupabaseUserFromServerSessionMock: vi.fn(),
  isValidPinSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createRouteSupabaseClient: createRouteSupabaseClientMock,
  createServerSupabaseClient: createServerSupabaseClientMock,
  getSupabaseUserFromRequest: getSupabaseUserFromRequestMock,
  getSupabaseUserFromServerSession: getSupabaseUserFromServerSessionMock,
}));

vi.mock("@/lib/pin-auth", () => ({
  isValidPinSession: isValidPinSessionMock,
}));

import { authorizedAppRole, isAuthorizedAppRole } from "@/lib/auth-role";
import {
  requireSupabaseOwnerOrAdmin,
  requireSupabaseOwnerOrAdminRequestClient,
  requireSupabaseOwnerOrAdminServerActionWithClient,
  requireSupabaseOwnerOrAdminServerActionClient,
  requireSupabaseOwnerOrAdminWithClient,
} from "@/lib/auth-boundary";
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
    createRouteSupabaseClientMock.mockReset().mockReturnValue(null);
    createServerSupabaseClientMock.mockReset().mockResolvedValue(null);
    getSupabaseUserFromServerSessionMock.mockReset().mockResolvedValue(null);
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

  it("verifies and queries through the same request-scoped authenticated client", async () => {
    const user = {
      app_metadata: { role: "owner" },
      email: "owner@example.test",
      id: "owner-id",
      user_metadata: {},
    };
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
      from: vi.fn(),
    };
    createRouteSupabaseClientMock.mockReturnValue(client);
    const request = new Request("http://localhost:3104/api/operations/tasks", {
      headers: { Authorization: "Bearer owner-token" },
    });

    const result = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });

    expect(result).toMatchObject({ ok: true, client });
    expect(client.auth.getUser).toHaveBeenCalledWith("owner-token");
    expect(getSupabaseUserFromRequestMock).not.toHaveBeenCalled();
  });

  it("fails closed when a presented bearer token is invalid", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "invalid bearer" },
        }),
      },
      from: vi.fn(),
    };
    createRouteSupabaseClientMock.mockReturnValue(client);
    const request = new Request("http://localhost:3104/api/operations/tasks", {
      headers: { Authorization: "Bearer invalid-token", Cookie: "sb-session=valid-cookie" },
    });

    const result = await requireSupabaseOwnerOrAdminRequestClient(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(client.auth.getUser).toHaveBeenCalledWith("invalid-token");
  });

  it("treats an alternate-case Bearer as authoritative over a conflicting cookie identity", async () => {
    const bearerOwner = {
      app_metadata: { role: "owner" },
      email: "bearer-owner@example.test",
      id: "bearer-owner-id",
      user_metadata: {},
    };
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: bearerOwner }, error: null }) },
      from: vi.fn(),
    };
    createRouteSupabaseClientMock.mockReturnValue(client);

    const result = await requireSupabaseOwnerOrAdminRequestClient(
      new Request("http://localhost:3104/api/operations/tasks", {
        headers: {
          Authorization: "bearer bearer-owner-token",
          Cookie: "sb-session=cookie-user-token",
        },
      })
    );

    expect(result).toMatchObject({
      ok: true,
      client,
      context: { user: { id: "bearer-owner-id" } },
    });
    expect(client.auth.getUser).toHaveBeenCalledWith("bearer-owner-token");
  });

  it("does not fall back to a cookie session for a malformed Authorization header", async () => {
    const client = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    };
    createRouteSupabaseClientMock.mockReturnValue(client);

    const result = await requireSupabaseOwnerOrAdminRequestClient(
      new Request("http://localhost:3104/api/operations/tasks", {
        headers: { Authorization: "Basic cookie-user-token", Cookie: "sb-session=owner-cookie" },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(createRouteSupabaseClientMock).not.toHaveBeenCalled();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("denies compatibility-mode access before a privileged route client is created", async () => {
    process.env.HH_REQUIRE_LOGIN = "false";
    const clientFactory = vi.fn(() => ({ privileged: true }));

    const result = await requireSupabaseOwnerOrAdminWithClient(
      new Request("http://localhost:3104/api/bills"),
      clientFactory
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("denies a non-owner before a privileged route client is created", async () => {
    getSupabaseUserFromRequestMock.mockResolvedValue({
      app_metadata: { role: "worker" },
      email: "worker@example.test",
      id: "worker-id",
      user_metadata: {},
    });
    const clientFactory = vi.fn(() => ({ privileged: true }));

    const result = await requireSupabaseOwnerOrAdminWithClient(
      new Request("http://localhost:3104/api/bills"),
      clientFactory
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("allows an owner and only then creates a privileged route client", async () => {
    getSupabaseUserFromRequestMock.mockResolvedValue({
      app_metadata: { role: "owner" },
      email: "owner@example.test",
      id: "owner-id",
      user_metadata: {},
    });
    const client = { privileged: true };
    const clientFactory = vi.fn(() => client);

    const result = await requireSupabaseOwnerOrAdminWithClient(
      new Request("http://localhost:3104/api/bills"),
      clientFactory
    );

    expect(result).toMatchObject({ ok: true, client });
    expect(clientFactory).toHaveBeenCalledOnce();
  });

  it("denies an unauthenticated Server Action before its privileged client is created", async () => {
    const clientFactory = vi.fn(() => ({ privileged: true }));

    const result = await requireSupabaseOwnerOrAdminServerActionWithClient(clientFactory);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("verifies and queries through the same cookie-authenticated Server Action client", async () => {
    const user = {
      app_metadata: { role: "admin" },
      email: "admin@example.test",
      id: "admin-id",
      user_metadata: {},
    };
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
      from: vi.fn(),
    };
    createServerSupabaseClientMock.mockResolvedValue(client);

    const result = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });

    expect(result).toMatchObject({ ok: true, client });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(getSupabaseUserFromServerSessionMock).not.toHaveBeenCalled();
  });

  it("allows an admin Server Action and only then creates its privileged client", async () => {
    getSupabaseUserFromServerSessionMock.mockResolvedValue({
      app_metadata: { role: "admin" },
      email: "admin@example.test",
      id: "admin-id",
      user_metadata: {},
    });
    const client = { privileged: true };
    const clientFactory = vi.fn(() => client);

    const result = await requireSupabaseOwnerOrAdminServerActionWithClient(clientFactory);

    expect(result).toMatchObject({ ok: true, client });
    expect(clientFactory).toHaveBeenCalledOnce();
  });
});
