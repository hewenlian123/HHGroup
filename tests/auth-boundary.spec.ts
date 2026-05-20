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

  test("production lock allows ordinary app pages without login while admin stays protected", async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const dashboard = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    expect(dashboard?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    const admin = await request.get("/admin", { headers: LOCKED_HEADERS });
    expect(admin.status()).toBe(403);
    await context.close();
  });

  test("login route redirects to dashboard without a redirect loop", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
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
      (await request.post("/api/system/backup", { headers: LOCKED_HEADERS, data: {} })).status()
    ).toBe(403);
    await expect(
      (
        await request.post("/api/system/integrity/cleanup", { headers: LOCKED_HEADERS, data: {} })
      ).status()
    ).toBe(403);
    await expect(
      (await request.get("/api/system-logs", { headers: LOCKED_HEADERS })).status()
    ).toBeLessThan(500);
    await expect(
      (await request.get("/api/system-metrics", { headers: LOCKED_HEADERS })).status()
    ).toBeLessThan(500);
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

  test("system health is available in owner no-login mode while static assets stay public", async ({
    request,
  }) => {
    const health = await request.get("/api/system-health", { headers: LOCKED_HEADERS });
    expect(health.status()).toBeLessThan(500);
    const healthBody = await health.text();
    expect(healthBody).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(healthBody).not.toContain("x-internal-admin-secret");

    const favicon = await request.get("/favicon.ico", { headers: LOCKED_HEADERS });
    expect([301, 302, 303, 307, 308]).not.toContain(favicon.status());
  });
});
