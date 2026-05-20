import { expect, test } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_AUTH_BYPASS_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

test.describe("owner no-login readiness", () => {
  test.describe.configure({ timeout: 60_000 });

  test("login route redirects to dashboard and no unlock form is shown", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    await expect(page.getByRole("heading", { name: "Enter PIN" })).toHaveCount(0);
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await context.close();
  });

  test("core app pages are available without a PIN session", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
    await context.close();
  });

  test("legacy PIN API validation remains safe and cannot bypass destructive routes", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

    const badResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "12a4" },
    });
    expect(badResponse.status()).toBe(400);

    const wipeResponse = await context.request.post("/api/production/wipe-database", {
      data: {},
    });
    expect(wipeResponse.status()).toBe(403);
    await context.close();
  });

  test("logout clears existing sessions and returns to dashboard", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    await context.close();
  });

  test("auth callback and logout stay public under production lock", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/auth/callback?error=access_denied&error_description=Denied", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    await context.close();
  });

  test("static assets and local test auth bypass are not blocked by middleware", async ({
    browser,
    request,
  }) => {
    const favicon = await request.get("/favicon.ico", { headers: LOCKED_HEADERS });
    expect([301, 302, 303, 307, 308]).not.toContain(favicon.status());

    const nextAsset = await request.get("/_next/static/not-found.js", { headers: LOCKED_HEADERS });
    expect([301, 302, 303, 307, 308]).not.toContain(nextAsset.status());

    const context = await browser.newContext({ extraHTTPHeaders: TEST_AUTH_BYPASS_HEADERS });
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
    await context.close();
  });
});
