import { expect, test } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_ADMIN_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

test.describe("auth and admin boundary", () => {
  test.describe.configure({ timeout: 60_000 });

  test("production lock redirects core app pages to login when unauthenticated", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
    await expect(page).toHaveURL(/redirect=%2Fdashboard|redirect=\/dashboard/);
    await context.close();
  });

  test("production lock does not create a login redirect loop", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?redirect=\/dashboard$/);
    await context.close();
  });

  test("production lock blocks unauthenticated system and maintenance surfaces", async ({
    request,
  }) => {
    await expect((await request.get("/system-tests", { headers: LOCKED_HEADERS })).status()).toBe(
      403
    );
    await expect(
      (await request.post("/api/production/wipe-database", { headers: LOCKED_HEADERS })).status()
    ).toBe(403);
    await expect(
      (await request.get("/api/system-logs", { headers: LOCKED_HEADERS })).status()
    ).toBe(401);
    await expect(
      (await request.get("/api/system-metrics", { headers: LOCKED_HEADERS })).status()
    ).toBe(401);
    await expect(
      (
        await request.post("/api/settings/company-profile", {
          headers: LOCKED_HEADERS,
          data: { org_name: "Blocked E2E production mutation" },
        })
      ).status()
    ).toBe(401);
  });

  test("non-production test admin bypass can reach guarded maintenance reads", async ({
    request,
  }) => {
    const response = await request.get("/api/system-logs", {
      headers: TEST_ADMIN_HEADERS,
    });

    expect(response.status()).toBeLessThan(500);
    expect(response.status()).not.toBe(401);
    expect(response.status()).not.toBe(403);
  });

  test("system health requires auth while static asset requests stay outside auth middleware", async ({
    request,
  }) => {
    const health = await request.get("/api/system-health", { headers: LOCKED_HEADERS });
    expect(health.status()).toBe(401);
    const healthBody = await health.text();
    expect(healthBody).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(healthBody).not.toContain("x-internal-admin-secret");

    const favicon = await request.get("/favicon.ico", { headers: LOCKED_HEADERS });
    expect([301, 302, 303, 307, 308]).not.toContain(favicon.status());
  });
});
