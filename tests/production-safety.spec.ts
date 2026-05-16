import { expect, test, type APIRequestContext } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

async function expectProductionForbidden(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>
): Promise<void> {
  const response =
    method === "GET"
      ? await request.get(path, { headers: LOCKED_HEADERS })
      : await request.post(path, { headers: LOCKED_HEADERS, data: data ?? {} });

  expect(response.status(), `${method} ${path}`).toBe(403);
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  expect(body.ok, `${method} ${path} response ok`).toBe(false);
  expect(String(body.message ?? ""), `${method} ${path} message`).toContain(
    "disabled in production"
  );
}

test.describe("production safety guards", () => {
  test.describe.configure({ timeout: 60_000 });

  test("blocks dangerous maintenance APIs when production safety lock is active", async ({
    request,
  }) => {
    await expectProductionForbidden(request, "POST", "/api/production/wipe-database");
    await expectProductionForbidden(request, "POST", "/api/production/cleanup-test-data");
    await expectProductionForbidden(request, "GET", "/api/production/checklist");
    await expectProductionForbidden(request, "POST", "/api/production/checklist", {
      runCleanup: true,
    });
    await expectProductionForbidden(request, "POST", "/api/seed-workers");
    await expectProductionForbidden(request, "POST", "/api/seed/operations");
    await expectProductionForbidden(request, "POST", "/api/ensure-schema");
    await expectProductionForbidden(request, "GET", "/api/ensure-expenses-migration-202604141000");
    await expectProductionForbidden(request, "POST", "/api/ensure-expenses-migration-202604141000");
    await expectProductionForbidden(request, "POST", "/api/system/integrity/cleanup", {
      category: "stale",
    });
    await expectProductionForbidden(request, "POST", "/api/system/backup");
    await expectProductionForbidden(request, "POST", "/api/test/full-system-test");
    await expectProductionForbidden(request, "POST", "/api/test/financial-workflows");
    await expectProductionForbidden(request, "POST", "/api/test/labor-reimbursement-workflow");
    await expectProductionForbidden(request, "POST", "/api/test/run-all");
    await expectProductionForbidden(request, "POST", "/api/test/run-all-tests");
    await expectProductionForbidden(request, "POST", "/api/test/run-ui-tests");
  });

  test("does not allow browser access to system test pages under production lock", async ({
    request,
  }) => {
    const response = await request.get("/system-tests", { headers: LOCKED_HEADERS });
    expect(response.status()).toBe(403);
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    expect(body.ok).toBe(false);
    expect(String(body.message ?? "")).toContain("disabled in production");
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
