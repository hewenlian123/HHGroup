import { expect, test } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
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
    throw new Error("Boundary tests require NEXT_PUBLIC_SUPABASE_URL and service role key.");
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
  if (error) throw new Error(`Failed to seed login PIN: ${error.message}`);
}

test.describe("bank and labor server API boundary", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin("1234");
  });

  test.afterEach(async () => {
    await seedTestLoginPin("1234");
  });

  test("production lock rejects unauthenticated sensitive read APIs", async ({ request }) => {
    for (const path of [
      "/api/financial/bank-transactions?view=summary",
      "/api/financial/bank-transactions?view=reconcile",
      "/api/labor/entries",
      "/api/labor/payments",
      "/api/labor/worker-payments",
    ]) {
      const response = await request.get(path, { headers: LOCKED_HEADERS });
      expect(response.status(), `GET ${path}`).toBe(401);
    }
  });

  test("PIN session can read bank and labor server APIs but cannot bypass destructive routes", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

    const loginResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "1234" },
    });
    expect(loginResponse.status()).toBe(200);

    for (const path of [
      "/api/financial/bank-transactions?view=summary",
      "/api/financial/bank-transactions?view=reconcile",
      "/api/labor/entries",
      "/api/labor/payments",
      "/api/labor/worker-payments",
    ]) {
      const response = await context.request.get(path);
      expect(response.status(), `GET ${path}`).toBeLessThan(500);
      expect(response.status(), `GET ${path}`).not.toBe(401);
      expect(response.status(), `GET ${path}`).not.toBe(403);
    }

    const wipeResponse = await context.request.post("/api/production/wipe-database", {
      data: {},
    });
    expect(wipeResponse.status()).toBe(403);
    await context.close();
  });

  test("PIN session can load bank and labor pages through guarded server APIs", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    const page = await context.newPage();

    const loginResponse = await context.request.post("/api/auth/pin-login", {
      data: { pin: "1234" },
    });
    expect(loginResponse.status()).toBe(200);

    await page.goto("/financial/bank");
    await expect(page.getByRole("heading", { name: "Bank Reconcile" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.route(
      /\/rest\/v1\/(?:labor_entries|labor_payments|worker_payments)(?:\?|$)/,
      async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "permission denied for table blocked_by_boundary_test",
          }),
        });
      }
    );

    await page.goto("/labor");
    await expect(page.getByRole("heading", { name: "Daily Labor" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.goto("/labor/payments");
    await expect(page.getByRole("heading", { name: "Worker Payments" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await page.goto("/labor/worker-balances");
    await expect(page.getByRole("heading", { name: "Worker Balances" })).toBeVisible();
    await expect(page.getByText(/RLS permission denied|permission denied|401|403/i)).toHaveCount(0);

    await context.close();
  });
});
