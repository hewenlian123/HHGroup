import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

const ORIGINAL_ENV = { ...process.env };
const EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPT_ID = "attachment.22222222-2222-4222-8222-222222222222";

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(`https://preview.hh.test${path}`, init);
}

describe("middleware Auth rollout behavior", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      VERCEL_ENV: "production",
      NODE_ENV: "production",
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.HH_ALLOW_LOCAL_NO_LOGIN;
    delete process.env.HH_REQUIRE_LOGIN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("redirects an anonymous protected page in strict mode", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";

    const response = await middleware(request("/dashboard?view=active"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://preview.hh.test/login?redirect=%2Fdashboard%3Fview%3Dactive"
    );
  });

  it("returns 401 for an anonymous protected API in strict mode", async () => {
    process.env.HH_REQUIRE_LOGIN = "1";

    const response = await middleware(request("/api/expenses"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: "Authentication required.",
    });
  });

  it.each([
    ["explicit false", "false"],
    ["explicit zero", "0"],
    ["unset", undefined],
    ["invalid", "invalid-test-value"],
  ])("keeps existing pages available in production compatibility mode (%s)", async (_, value) => {
    if (value === undefined) {
      delete process.env.HH_REQUIRE_LOGIN;
    } else {
      process.env.HH_REQUIRE_LOGIN = value;
    }

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
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

  it.each([`/api/financial/expenses/${EXPENSE_ID}/ocr-writeback`, "/api/ocr-receipt"])(
    "keeps the pre-cutover OCR workflow available at %s",
    async (path) => {
      process.env.HH_REQUIRE_LOGIN = "false";

      const response = await middleware(request(path, { method: "POST" }));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("does not let client headers or query parameters impersonate an owner", async () => {
    process.env.HH_REQUIRE_LOGIN = "true";
    process.env.HH_ALLOW_LOCAL_NO_LOGIN = "1";
    process.env.HH_INTERNAL_ADMIN_SECRET = "server-secret";

    const response = await middleware(
      request("/api/expenses?HH_REQUIRE_LOGIN=false&role=owner", {
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
