import { expect, test } from "@playwright/test";

test.describe("canonical Supabase Auth boundary", () => {
  test.describe.configure({ timeout: 60_000 });

  test("protected page redirects an unauthenticated user to login with a safe return route", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/financial/inbox?filter=pending", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login\?redirect=%2Ffinancial%2Finbox%3Ffilter%3Dpending$/);
    await context.close();
  });

  test("protected API returns JSON 401 without a Supabase session", async ({ request }) => {
    const response = await request.get("/api/expenses");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: "Authentication required.",
    });
  });

  test("client-provided admin and test-bypass headers do not authenticate ordinary access", async ({
    request,
  }) => {
    const response = await request.get("/api/expenses", {
      headers: {
        "x-hh-production-safety-lock": "1",
        "x-hh-test-auth-bypass": "1",
        "x-internal-admin-secret": "untrusted-client-value",
      },
    });

    expect(response.status()).toBe(401);
  });

  test("static assets and canonical public Auth routes remain public", async ({ request }) => {
    const favicon = await request.get("/favicon.ico");
    expect([301, 302, 303, 307, 308]).not.toContain(favicon.status());

    const login = await request.get("/login");
    expect(login.status()).toBeLessThan(400);

    const forgot = await request.get("/forgot-password");
    expect(forgot.status()).toBeLessThan(400);
  });
});
