import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  assertE2EBaseUrlSafeForMutations,
  assertPlaywrightProductionRunSafeForWrites,
  isProductionAppUrl,
} from "./e2e-supabase-url-guard";
import { loginAsE2EOwner } from "./e2e-auth-owner";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const DANGEROUS_MAINTENANCE_CASES = [
  ["POST", "/api/production/wipe-database"],
  ["POST", "/api/production/cleanup-test-data"],
  ["GET", "/api/production/checklist"],
  ["POST", "/api/production/checklist", { runCleanup: true }],
  ["POST", "/api/seed-workers"],
  ["POST", "/api/seed/operations"],
  ["GET", "/api/ensure-expenses-migration-202604141000"],
  ["POST", "/api/ensure-expenses-migration-202604141000"],
  ["POST", "/api/system/integrity/cleanup", { category: "stale" }],
  ["POST", "/api/system/backup", { confirmation: "BACKUP" }],
] as const;

async function requestMaintenanceEndpoint(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>
) {
  return method === "GET"
    ? request.get(path, { headers: LOCKED_HEADERS })
    : request.post(path, { headers: LOCKED_HEADERS, data: data ?? {} });
}

async function expectAuthenticationRequired(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>
): Promise<void> {
  const response = await requestMaintenanceEndpoint(request, method, path, data);
  expect(response.status(), `${method} ${path}`).toBe(401);
  await expect(response.json(), `${method} ${path} response`).resolves.toMatchObject({
    ok: false,
    message: "Authentication required.",
  });
}

async function expectProductionForbidden(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>
): Promise<void> {
  const response = await requestMaintenanceEndpoint(request, method, path, data);

  expect(response.status(), `${method} ${path}`).toBe(403);
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  expect(body.ok, `${method} ${path} response ok`).toBe(false);
  expect(String(body.message ?? ""), `${method} ${path} message`).toContain(
    "disabled in production"
  );
}

async function expectNonProductionOnlyUnavailable(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  productionRuntime: boolean
): Promise<void> {
  const headers = productionRuntime
    ? {
        ...LOCKED_HEADERS,
        "x-internal-admin-secret":
          process.env.HH_INTERNAL_ADMIN_SECRET ??
          process.env.INTERNAL_ADMIN_SECRET ??
          "non-matching-safety-probe",
      }
    : LOCKED_HEADERS;
  const response =
    method === "GET"
      ? await request.get(path, { headers })
      : await request.post(path, { headers, data: {} });

  expect(response.status(), `${method} ${path}`).toBe(productionRuntime ? 404 : 403);
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  expect(body.ok, `${method} ${path} response ok`).toBe(false);
  expect(String(body.message ?? ""), `${method} ${path} message`).toContain(
    productionRuntime ? "Not found" : "disabled in production"
  );
}

test.describe("production safety guards", () => {
  test.describe.configure({ timeout: 60_000 });

  test("blocks production-targeted Playwright write tests by default", () => {
    const previous = process.env.ALLOW_PROD_TEST_WRITES;
    delete process.env.ALLOW_PROD_TEST_WRITES;
    try {
      expect(isProductionAppUrl("https://hhprojectgroup.com")).toBe(true);
      expect(isProductionAppUrl("https://hhgroup-production.vercel.app")).toBe(true);
      expect(isProductionAppUrl("http://localhost:3000")).toBe(false);

      expect(() =>
        assertE2EBaseUrlSafeForMutations(
          "https://hhprojectgroup.com",
          "production safety regression"
        )
      ).toThrow(/Production URL is read-only by default|Refusing production safety regression/);

      expect(() =>
        assertPlaywrightProductionRunSafeForWrites({
          baseURL: "https://hhprojectgroup.com",
          argv: ["node", "playwright", "test", "tests/full-system-smoke-and-data-flow.spec.ts"],
        })
      ).toThrow(/Production URL is read-only by default/);

      expect(() =>
        assertPlaywrightProductionRunSafeForWrites({
          baseURL: "https://hhprojectgroup.com",
          argv: ["node", "playwright", "test", "tests/production-safety.spec.ts"],
        })
      ).toThrow(/localhost-only and cannot be overridden/);

      process.env.ALLOW_PROD_TEST_WRITES = "1";
      expect(() =>
        assertPlaywrightProductionRunSafeForWrites({
          baseURL: "https://hhprojectgroup.com",
          argv: ["node", "playwright", "test", "tests/production-safety.spec.ts"],
        })
      ).toThrow(/localhost-only and cannot be overridden/);
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_PROD_TEST_WRITES;
      } else {
        process.env.ALLOW_PROD_TEST_WRITES = previous;
      }
    }
  });

  test("requires authentication before dangerous maintenance route guards", async ({ request }) => {
    for (const [method, path, data] of DANGEROUS_MAINTENANCE_CASES) {
      await expectAuthenticationRequired(request, method, path, data);
    }
  });

  test("blocks authenticated owners when the production safety lock is active", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, "/dashboard");
    for (const [method, path, data] of DANGEROUS_MAINTENANCE_CASES) {
      await expectProductionForbidden(page.context().request, method, path, data);
    }
  });

  test("keeps test, schema-repair, and system-test entrypoints out of Production", async ({
    page,
    request: anonymousRequest,
  }, testInfo) => {
    const productionRuntime =
      isProductionAppUrl(String(testInfo.project.use.baseURL ?? "")) ||
      process.env.E2E_SERVER_RUNTIME === "production";
    if (!productionRuntime) await loginAsE2EOwner(page, "/dashboard");
    const request = productionRuntime ? anonymousRequest : page.request;
    for (const [method, path] of [
      ["POST", "/api/ensure-schema"],
      ["POST", "/api/test/full-system-test"],
      ["POST", "/api/test/financial-workflows"],
      ["POST", "/api/test/labor-reimbursement-workflow"],
      ["POST", "/api/test/run-all"],
      ["POST", "/api/test/run-all-tests"],
      ["POST", "/api/test/run-ui-tests"],
      ["GET", "/system-tests"],
    ] as const) {
      await expectNonProductionOnlyUnavailable(request, method, path, productionRuntime);
    }
  });

  test("GET cannot trigger POST-only destructive routes", async ({ request }) => {
    for (const path of [
      "/api/production/wipe-database",
      "/api/production/cleanup-test-data",
      "/api/seed-workers",
      "/api/seed/operations",
      "/api/ensure-schema",
      "/api/system/integrity/cleanup",
    ]) {
      const response = await request.get(path, { headers: LOCKED_HEADERS });
      expect(response.status(), `GET ${path}`).toBeGreaterThanOrEqual(400);
    }
  });
});
