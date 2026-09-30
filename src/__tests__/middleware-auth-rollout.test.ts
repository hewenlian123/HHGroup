import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock, getSessionMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

const companyAccess = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/organization-membership", async (original) => ({
  ...(await original<typeof import("@/lib/organization-membership")>()),
  hasCompanyAdministratorMembership: companyAccess,
}));

// Pause/schema behavior is exercised by worker-finance-write-pause.test.ts.
vi.mock("@/lib/worker-finance-write-pause", async (original) => ({
  ...(await original<typeof import("@/lib/worker-finance-write-pause")>()),
  workerFinanceSchemaReady: vi.fn(async () => true),
}));

import { middleware } from "@/middleware";

const ORIGINAL_ENV = { ...process.env };
const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "attachment.22222222-2222-4222-8222-222222222222";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`https://preview.hh.test${path}`, init);
}

describe("middleware Auth rollout behavior", () => {
  beforeEach(() => {
    companyAccess.mockReset().mockResolvedValue(true);
    process.env = {
      ...ORIGINAL_ENV,
      HH_WORKER_FINANCE_WRITES: "canonical",
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.HH_ALLOW_LOCAL_AUTO_LOGIN;
    delete process.env.HH_ALLOW_LOCAL_NO_LOGIN;
    delete process.env.HH_REQUIRE_LOGIN;
    getUserMock.mockReset().mockResolvedValue({ data: { user: null } });
    getSessionMock.mockReset().mockResolvedValue({ data: { session: null } });
    rpcMock.mockReset().mockResolvedValue({ data: null, error: null });
    createServerClientMock.mockReset().mockReturnValue({
      auth: {
        getSession: getSessionMock,
        getUser: getUserMock,
      },
      rpc: rpcMock,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not middleware-block a foreign owner on non-strict routes while login is off", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
    getUserMock.mockResolvedValue({
      data: { user: { id: "foreign-owner", app_metadata: { role: "owner" } } },
    });
    companyAccess.mockResolvedValue(false);
    const response = await middleware(request("/api/invoices"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows an anonymous protected page while the product login gate is off", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";

    const response = await middleware(request("/dashboard?view=active"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Server-Timing")).toMatch(
      /hh_auth;dur=\d+\.\d, hh_middleware;dur=\d+\.\d/
    );
  });

  it("allows an anonymous non-strict API while the product login gate is off", async () => {
    process.env.HH_REQUIRE_LOGIN = "1";

    const response = await middleware(request("/api/expenses"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects the retired login page to the dashboard", async () => {
    const response = await middleware(request("/login?redirect=%2Fprojects"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://preview.hh.test/dashboard");
  });

  it.each([
    "/api/test/full-system-test",
    "/api/test/financial-workflows",
    "/api/test/run-all",
    "/api/test/run-all-tests",
    "/api/test/run-ui-tests",
    "/api/ensure-schema",
    "/system-tests",
    "/system-tests/ui",
  ])(
    "hides production-only test and schema-maintenance surfaces in Production: %s",
    async (path) => {
      process.env.HH_INTERNAL_ADMIN_SECRET = "server-secret";

      const response = await middleware(
        request(path, {
          method: path.startsWith("/api/") ? "POST" : "GET",
          headers: { "x-internal-admin-secret": "server-secret" },
        })
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-next")).toBeNull();
    }
  );

  it("keeps the test harness reachable in explicitly enabled local development", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";

    const response = await middleware(request("/api/test/run-all", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["/upload-receipt", "GET"],
    ["/api/upload-receipt/upload", "POST"],
    ["/api/upload-receipt/submit", "POST"],
  ])("allows non-strict receipt intake while the product login gate is off: %s", async (path, method) => {
    process.env.HH_REQUIRE_LOGIN = "true";

    const response = await middleware(request(path, { method }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows project and worker receipt options while the product login gate is off", async () => {
    const response = await middleware(request("/api/upload-receipt/options"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["/api/projects/project/tab?tab=documents", "GET", 200, false],
    ["/api/upload-receipt/upload", "POST", 200, false],
    ["/api/upload-receipt/submit", "POST", 200, false],
    ["/api/upload-receipt/sync", "POST", 403, false],
    ["/api/expenses", "GET", 200, false],
    ["/documents", "POST", 200, true],
    ["/projects/project", "POST", 200, true],
    ["/documents", "POST", 200, false],
    ["/financial/invoices", "POST", 200, true],
  ])(
    "limits assistant membership admission for %s %s",
    async (path, method, status, serverAction) => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
      getUserMock.mockResolvedValue({
        data: { user: { id: "assistant", app_metadata: {} } },
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [{ organization_id: "org", role: "assistant", status: "active" }],
            error: null,
          }).then(resolve),
      };
      createServerClientMock.mockReturnValue({
        auth: { getUser: getUserMock, getSession: getSessionMock },
        from: () => query,
      });
      const response = await middleware(
        request(path, {
          method: String(method),
          headers: {
            authorization: "Bearer assistant-session",
            ...(serverAction ? { "next-action": "read-or-write-action-id" } : {}),
          },
        })
      );
      expect(response.status).toBe(status);
    }
  );

  it.each([
    ["explicit false", "false"],
    ["explicit zero", "0"],
    ["unset", undefined],
    ["invalid", "invalid-test-value"],
  ])("keeps existing pages open in Production while login is off (%s)", async (_, value) => {
    if (value === undefined) {
      delete process.env.HH_REQUIRE_LOGIN;
    } else {
      process.env.HH_REQUIRE_LOGIN = value;
    }

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects legacy worker receipts before the Labor App Router boundary and preserves only supported filters", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";

    const response = await middleware(
      request(
        "/labor/receipts?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15&search=discard-me"
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.hh.test/financial/inbox/worker?project_id=project-a&workerId=worker-a&status=pending&date_from=2026-08-01&date_to=2026-08-15"
    );
  });

  it("still rewrites legacy worker receipts while the login gate is off", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";

    const response = await middleware(request("/labor/receipts?project_id=project-a"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.hh.test/financial/inbox/worker?project_id=project-a"
    );
  });

  it.each([
    `/api/financial/expenses/${EXPENSE_ID}/receipts`,
    `/api/financial/expenses/${EXPENSE_ID}/receipts/${RECEIPT_ID}/replace`,
    `/api/financial/receipt-queue/${EXPENSE_ID}/preview`,
    "/api/settings/security/password",
    "/api/settings/security/pin",
    "/api/settings/security/sessions",
  ])("keeps sensitive API %s strict in compatibility mode", async (path) => {
    process.env.HH_REQUIRE_LOGIN = "0";

    const response = await middleware(
      request(path, {
        method: path.endsWith("/receipts") ? "GET" : "POST",
      })
    );

    expect(response.status).toBe(401);
  });

  it("keeps the Settings Security page strict in compatibility mode", async () => {
    process.env.HH_REQUIRE_LOGIN = "false";

    const response = await middleware(request("/settings/security"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?redirect=");
  });

  it("lets a Supabase-verified owner bearer reach a sensitive API without Auth cookies", async () => {
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    getUserMock.mockImplementation(async (accessToken?: string) => ({
      data: {
        user:
          accessToken === "verified-owner-access-token"
            ? {
                app_metadata: { role: "owner" },
                id: "owner-id",
                user_metadata: {},
              }
            : null,
      },
    }));

    const response = await middleware(
      request("/api/settings/security/pin", {
        method: "POST",
        headers: { Authorization: "Bearer verified-owner-access-token" },
      })
    );

    expect(getUserMock).toHaveBeenCalledWith("verified-owner-access-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("uses a normalized alternate-case Bearer for both middleware verification and queries", async () => {
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";
    getUserMock.mockResolvedValue({
      data: { user: { app_metadata: { role: "owner" }, id: "bearer-owner-id", user_metadata: {} } },
    });

    const response = await middleware(
      request("/api/settings/security/pin", {
        method: "POST",
        headers: {
          Authorization: "bEaReR\tverified-owner-access-token",
          Cookie: "sb-session=conflicting-cookie-user",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledWith("verified-owner-access-token");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(createServerClientMock.mock.calls[0]?.[2]).toMatchObject({
      global: { headers: { Authorization: "Bearer verified-owner-access-token" } },
    });
  });

  it("does not use a cookie session after malformed Bearer credentials on a sensitive API", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";

    const response = await middleware(
      request("/api/settings/security/pin", {
        method: "POST",
        headers: {
          Authorization: "Basic conflicting-cookie-token",
          Cookie: "sb-session=owner-cookie",
        },
      })
    );

    expect(response.status).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("keeps the non-receipt OCR writeback workflow available in compatibility mode", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";

    const response = await middleware(
      request(`/api/financial/expenses/${EXPENSE_ID}/ocr-writeback`, { method: "POST" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects a local browser navigation to the server-side auto-login endpoint", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_ALLOW_LOCAL_AUTO_LOGIN = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";

    const response = await middleware(
      new NextRequest("http://localhost:3000/projects?status=active")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/api/auth/local-auto-login?redirect=%2Fprojects%3Fstatus%3Dactive"
    );
  });

  it("never auto-logs an anonymous local API request", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_ALLOW_LOCAL_AUTO_LOGIN = "1";
    process.env.HH_REQUIRE_LOGIN = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";

    const response = await middleware(new NextRequest("http://localhost:3000/api/expenses"));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps public Auth recovery pages outside local auto-login", async () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.VERCEL_ENV;
    process.env.HH_ALLOW_LOCAL_AUTO_LOGIN = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";

    for (const path of ["/auth/recovery/callback", "/forgot-password"]) {
      const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it.each(["/api/ocr-receipt", "/api/upload-receipt/sync", "/api/worker-receipts"])(
    "keeps sensitive receipt API %s strict in compatibility mode",
    async (path) => {
      process.env.HH_REQUIRE_LOGIN = "false";

      const response = await middleware(request(path, { method: "POST" }));

      expect(response.status).toBe(401);
    }
  );

  it("does not let client headers or query parameters authorize a sensitive API", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";
    process.env.HH_INTERNAL_ADMIN_SECRET = "server-secret";

    const response = await middleware(
      request("/api/settings/security/pin?HH_REQUIRE_LOGIN=false&role=owner", {
        method: "POST",
        headers: {
          "x-hh-require-login": "false",
          "x-hh-test-auth-bypass": "1",
          "x-internal-admin-secret": "server-secret",
        },
      })
    );

    expect(response.status).toBe(401);
  });

  it("does not let client-controlled state authorize a sensitive API in compatibility mode", async () => {
    process.env.HH_REQUIRE_LOGIN = "false";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";
    process.env.HH_INTERNAL_ADMIN_SECRET = "server-secret";

    const response = await middleware(
      request(`/api/financial/expenses/${EXPENSE_ID}/receipts?role=owner`, {
        headers: {
          "x-hh-require-login": "false",
          "x-hh-test-auth-bypass": "1",
          "x-internal-admin-secret": "server-secret",
        },
      })
    );

    expect(response.status).toBe(401);
  });
});
