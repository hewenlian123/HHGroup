import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const TEST_AUTH_BYPASS_HEADERS = {
  ...LOCKED_HEADERS,
  "x-hh-test-auth-bypass": "1",
};

function hashTestPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256");
  return {
    hash: hash.toString("base64url"),
    salt: salt.toString("base64url"),
  };
}

async function seedTestLoginPin(pin = "1234"): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("PIN login tests require local NEXT_PUBLIC_SUPABASE_URL and service role key.");
  }

  const { hash, salt } = hashTestPin(pin);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.from("app_security_settings").upsert(
    {
      key: "login_pin",
      pin_hash: hash,
      pin_salt: salt,
      session_version: 1,
      updated_by: "playwright",
    },
    { onConflict: "key" }
  );
  if (error) {
    throw new Error(`Failed to seed app_security_settings login PIN: ${error.message}`);
  }
}

test.describe("production login readiness", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("login page renders a PIN unlock form without a redirect loop", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const response = await page.goto("/login?redirect=/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?redirect=\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Enter PIN" })).toBeVisible();
    await expect(page.getByLabel("PIN digit 1")).toBeVisible();
    await expect(page.getByLabel("PIN digit 4")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Enter PIN" })).toBeVisible();
    await context.close();
  });

  test("wrong PIN shows Invalid PIN and the test PIN unlocks dashboard", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/login?redirect=/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByLabel("PIN digit 1").fill("0");
    await page.getByLabel("PIN digit 2").fill("0");
    await page.getByLabel("PIN digit 3").fill("0");
    await page.getByLabel("PIN digit 4").fill("0");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Invalid PIN")).toBeVisible();

    await page.getByLabel("PIN digit 1").fill("1");
    await page.getByLabel("PIN digit 2").fill("2");
    await page.getByLabel("PIN digit 3").fill("3");
    await page.getByLabel("PIN digit 4").fill("4");
    await page.getByRole("button", { name: "Unlock" }).click();

    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);
    await context.close();
  });

  test("PIN login rejects malformed values and cannot bypass destructive routes", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const badResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "12a4" },
    });
    expect(badResponse.status()).toBe(400);

    const loginResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "1234" },
    });
    expect(loginResponse.status()).toBe(200);

    const wipeResponse = await context.request.post("/api/production/wipe-database", {
      data: {},
    });
    expect(wipeResponse.status()).toBe(403);
    await context.close();
  });

  test("logout clears the PIN session and returns protected pages to login", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/login?redirect=/dashboard", { waitUntil: "domcontentloaded" });
    await page.getByLabel("PIN digit 1").fill("1");
    await page.getByLabel("PIN digit 2").fill("2");
    await page.getByLabel("PIN digit 3").fill("3");
    await page.getByLabel("PIN digit 4").fill("4");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?message=Signed\+out$/);
    await expect(page.getByText("Signed out")).toBeVisible();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
    await context.close();
  });

  test("Settings Security can change the login PIN and invalidate the old PIN", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    await page.goto("/login?redirect=/settings/security", { waitUntil: "domcontentloaded" });
    await page.getByLabel("PIN digit 1").fill("1");
    await page.getByLabel("PIN digit 2").fill("2");
    await page.getByLabel("PIN digit 3").fill("3");
    await page.getByLabel("PIN digit 4").fill("4");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page).toHaveURL(/\/settings\/security(?:[?#]|$)/);

    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await page.getByLabel("Current PIN").fill("1234");
    await page.getByLabel("New PIN", { exact: true }).fill("5678");
    await page.getByLabel("Confirm New PIN").fill("5678");
    await page.getByRole("button", { name: "Save PIN" }).click();
    await expect(page.getByText("PIN updated")).toBeVisible();

    await page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("PIN digit 1").fill("1");
    await page.getByLabel("PIN digit 2").fill("2");
    await page.getByLabel("PIN digit 3").fill("3");
    await page.getByLabel("PIN digit 4").fill("4");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Invalid PIN")).toBeVisible();

    await page.getByLabel("PIN digit 1").fill("5");
    await page.getByLabel("PIN digit 2").fill("6");
    await page.getByLabel("PIN digit 3").fill("7");
    await page.getByLabel("PIN digit 4").fill("8");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/);

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
    await expect(page).toHaveURL(/\/login\?message=Signed\+out\.?$/);
    await expect(page.getByText(/Signed out\.?/)).toBeVisible();
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
