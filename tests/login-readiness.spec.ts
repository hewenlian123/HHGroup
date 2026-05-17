import { expect, test } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_AUTH_BYPASS_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

test.describe("production login readiness", () => {
  test.describe.configure({ timeout: 60_000 });

  test("login page renders a real email and password form without a redirect loop", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?redirect=\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await context.close();
  });

  test("protected pages redirect unauthenticated production traffic to login", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
    await expect(page).toHaveURL(/redirect=%2Fdashboard|redirect=\/dashboard/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await context.close();
  });

  test("auth callback and logout stay public under production lock", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/auth/callback?error=access_denied&error_description=Denied", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/login\?error=Denied$/);
    await expect(page.getByText("Denied")).toBeVisible();

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?message=Signed\+out\.$/);
    await expect(page.getByText("Signed out.")).toBeVisible();
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
