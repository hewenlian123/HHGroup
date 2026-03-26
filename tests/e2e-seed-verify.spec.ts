/**
 * After globalSetup: prove preserved rows appear on list pages (same UUIDs as seed).
 * Detail routes may hang if browser Supabase is misconfigured — lists use SSR and are the primary signal.
 *
 * Screenshots: test-results/seed-verify-*.png
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { test, expect } from "@playwright/test";

import { E2E_PRESERVED_CUSTOMER_ID } from "./e2e-cleanup-db";

const OUT = {
  projects: "test-results/seed-verify-projects-list.png",
  workers: "test-results/seed-verify-workers-list.png",
  customers: "test-results/seed-verify-customers-list.png",
};

function ensureDir(filePath: string) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* exists */
  }
}

test.describe("E2E seed verification (screenshots)", () => {
  test("projects, workers, customers lists show preserved seed rows", async ({ page }) => {
    test.setTimeout(180_000);

    for (const p of Object.values(OUT)) ensureDir(p);

    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/projects");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("projects-page-heading")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("link", { name: /^Open project / }).first()).toBeVisible({
      timeout: 45_000,
    });
    await page.screenshot({ path: OUT.projects, fullPage: true });

    await page.goto("/workers");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /^workers$/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByRole("link", { name: /Open worker.*\[E2E\].*Seed Worker/i })
    ).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: OUT.workers, fullPage: true });

    await page.goto("/customers");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator(`a[href="/customers/${E2E_PRESERVED_CUSTOMER_ID}"]`).first()
    ).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: OUT.customers, fullPage: true });
  });
});
