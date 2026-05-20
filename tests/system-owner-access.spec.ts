import { expect, test } from "@playwright/test";

const LOCKED_HEADERS = {
  "x-hh-production-safety-lock": "1",
};

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

  test("owner no-login mode can open system pages and sidebar links are not duplicated", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });
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
      if (path === "/settings/system-health") {
        await page.waitForURL(/\/system-health(?:[?#]|$)/, { timeout: 10_000 });
      }
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      if (path === "/system-health") {
        await expect(page.getByText("Required tables")).toBeVisible();
        await expect(page.getByText("Optional tables")).toBeVisible();
        await expect(page.getByText("Storage buckets")).toBeVisible();
        await expect(page.getByText("Company profile status")).toBeVisible();
        await expect(page.getByText("PIN status")).toBeVisible();
        await expect(page.getByText("AP bills schema status")).toBeVisible();
      }
    }

    await context.close();
  });

  test("system read APIs allow owner no-login mode and sanitize secret values", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

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

    const health = await context.request.get("/api/system-health");
    const healthText = await health.text();
    expect(healthText).not.toMatch(/schema cache|Could not find the table/i);
    const healthBody = JSON.parse(healthText) as {
      summary?: {
        requiredTables?: unknown[];
        optionalTables?: unknown[];
        storageBuckets?: unknown[];
        companyProfile?: unknown;
        pin?: unknown;
        apBills?: unknown[];
      };
    };
    expect(healthBody.summary?.requiredTables?.length ?? 0).toBeGreaterThan(0);
    expect(healthBody.summary?.optionalTables?.length ?? 0).toBeGreaterThan(0);
    expect(healthBody.summary?.storageBuckets?.length ?? 0).toBeGreaterThan(0);
    expect(healthBody.summary?.companyProfile).toBeTruthy();
    expect(healthBody.summary?.pin).toBeTruthy();
    expect(healthBody.summary?.apBills?.length ?? 0).toBeGreaterThan(0);

    await context.close();
  });

  test("owner no-login mode does not bypass destructive maintenance safeguards", async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: LOCKED_HEADERS });

    const wipe = await context.request.post("/api/production/wipe-database", { data: {} });
    expect(wipe.status()).toBe(403);

    const cleanup = await context.request.post("/api/system/integrity/cleanup", {
      data: { category: "stale" },
    });
    expect([400, 403]).toContain(cleanup.status());

    const backup = await context.request.post("/api/system/backup", { data: {} });
    expect(backup.status()).toBe(403);

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
