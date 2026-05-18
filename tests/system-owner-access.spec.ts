import { expect, test, type APIRequestContext } from "@playwright/test";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

const OWNER_PIN = "1234";

function hashTestPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, 210_000, 32, "sha256");
  return {
    hash: hash.toString("base64url"),
    salt: salt.toString("base64url"),
  };
}

async function seedTestLoginPin(pin = OWNER_PIN): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("System owner tests require local Supabase URL and service role key.");
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
      updated_by: "playwright-system-owner",
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`Failed to seed login PIN: ${error.message}`);
}

async function loginOwner(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/pin-login", {
    headers: LOCKED_HEADERS,
    data: { pin: OWNER_PIN },
  });
  expect(response.status()).toBe(200);
}

function configuredSecretValues(): string[] {
  return [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.HH_INTERNAL_ADMIN_SECRET,
    process.env.INTERNAL_ADMIN_SECRET,
    process.env.HH_PIN_SESSION_SECRET,
  ]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length >= 8);
}

async function expectNoSecrets(responseText: string): Promise<void> {
  for (const value of configuredSecretValues()) {
    expect(responseText).not.toContain(value);
  }
  expect(responseText).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+/i);
  expect(responseText).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  expect(responseText).not.toContain("HH_INTERNAL_ADMIN_SECRET=");
}

test.describe("system owner access", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test.beforeEach(async () => {
    await seedTestLoginPin();
  });

  test.afterEach(async () => {
    await seedTestLoginPin();
  });

  test("PIN owner session can open system pages and sidebar links are not duplicated", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    await loginOwner(context.request);
    const page = await context.newPage();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);

    const sidebar = page.locator("[data-app-sidebar]");
    await expect(sidebar.locator('a[href="/system-health"]')).toHaveCount(1);
    await expect(sidebar.locator('a[href="/system-metrics"]')).toHaveCount(1);
    await expect(sidebar.locator('a[href="/system-logs"]')).toHaveCount(1);
    await expect(sidebar.locator('a[href="/system/backups"]')).toHaveCount(1);

    for (const [path, heading] of [
      ["/system-health", "System Health"],
      ["/settings/system-health", "System Health"],
      ["/system-metrics", "System Metrics"],
      ["/system-logs", "System Logs"],
      ["/system/backups", "System Backups"],
      ["/backups", "System Backups"],
    ] as const) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    await context.close();
  });

  test("system read APIs require auth, allow PIN owner, and sanitize secret values", async ({
    browser,
    request,
  }) => {
    for (const path of [
      "/api/system-health",
      "/api/schema-check",
      "/api/system-metrics",
      "/api/system-logs",
      "/api/system/backup",
      "/api/system/integrity",
    ]) {
      const unauth = await request.get(path, { headers: LOCKED_HEADERS });
      expect([401, 403], `unauth ${path}`).toContain(unauth.status());
    }

    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    await loginOwner(context.request);

    for (const path of [
      "/api/system-health",
      "/api/schema-check",
      "/api/system-metrics",
      "/api/system-logs",
      "/api/system/backup",
      "/api/system/integrity",
    ]) {
      const response = await context.request.get(path);
      expect(response.status(), `owner ${path}`).toBeLessThan(500);
      expect(response.status(), `owner ${path}`).not.toBe(401);
      expect(response.status(), `owner ${path}`).not.toBe(403);
      await expectNoSecrets(await response.text());
    }

    await context.close();
  });

  test("PIN owner session does not bypass destructive maintenance safeguards", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
    await loginOwner(context.request);

    const wipe = await context.request.post("/api/production/wipe-database", { data: {} });
    expect(wipe.status()).toBe(403);

    const cleanup = await context.request.post("/api/system/integrity/cleanup", {
      data: { category: "stale" },
    });
    expect([400, 403]).toContain(cleanup.status());

    const backup = await context.request.post("/api/system/backup", { data: {} });
    expect(backup.status()).toBe(400);
    const backupBody = (await backup.json().catch(() => ({}))) as { message?: string };
    expect(String(backupBody.message ?? "")).toContain("BACKUP");

    for (const path of [
      "/api/production/wipe-database",
      "/api/production/cleanup-test-data",
      "/api/seed-workers",
      "/api/seed/operations",
      "/api/ensure-schema",
      "/api/system/integrity/cleanup",
    ]) {
      const response = await context.request.get(path);
      expect(response.status(), `GET ${path}`).toBeGreaterThanOrEqual(400);
    }

    await context.close();
  });
});
