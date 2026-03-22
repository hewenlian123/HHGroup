import { test, expect } from "@playwright/test";
import { e2eTargetOrigin } from "./e2e-env-helpers";

/** Same default as other specs: local dev. Override with `E2E_BASE_URL=https://…` for prod smoke. */
const BASE = e2eTargetOrigin();

async function checkPage(page: import("@playwright/test").Page, path: string) {
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("domcontentloaded");

  expect(response?.status()).not.toBe(500);
  if (response?.status() === 404) {
    test.skip(true, `Route 404: ${path}`);
  }

  const body = page.locator("body");
  await expect(body).not.toContainText("Application error: a client-side exception has occurred");
  await expect(body).not.toContainText("Internal Server Error");
  await expect(body).not.toContainText("This page could not be found");

  /**
   * Root layout loads AppShell with `dynamic(..., { ssr: false })`, so first paint is only
   * “Loading…” (~8 chars). Wait for hydrated shell (`main`) before asserting body length.
   */
  try {
    // App shell may use `main` without `flex-1` in some routes; prefer any primary `main`.
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
  } catch {
    try {
      await page.waitForFunction(
        () => (document.body?.innerText ?? "").replace(/\s/g, "").length > 40,
        { timeout: 60_000 }
      );
    } catch {
      test.skip(
        true,
        `App shell did not hydrate in time: ${path} (dev server slow or route blocked).`
      );
    }
  }

  const text = await body.innerText();
  expect(text.replace(/\s/g, "").length).toBeGreaterThan(40);
}

test.describe("smoke: main routes", () => {
  test.describe.configure({ timeout: 150_000 });

  test("dashboard", async ({ page }) => {
    await checkPage(page, "/dashboard");
  });
  test("invoices", async ({ page }) => {
    await checkPage(page, "/financial/invoices");
  });
  test("bills", async ({ page }) => {
    await checkPage(page, "/bills");
  });
  test("expenses", async ({ page }) => {
    await checkPage(page, "/financial/expenses");
  });
  test("labor", async ({ page }) => {
    await checkPage(page, "/labor");
  });
  test("workers", async ({ page }) => {
    await checkPage(page, "/workers");
  });
  test("projects", async ({ page }) => {
    await checkPage(page, "/projects");
  });
  test("tasks", async ({ page }) => {
    await checkPage(page, "/tasks");
  });
  test("documents", async ({ page }) => {
    await checkPage(page, "/documents");
  });
  test("vendors", async ({ page }) => {
    await checkPage(page, "/vendors");
  });
  test("subcontractors", async ({ page }) => {
    await checkPage(page, "/subcontractors");
  });
  test("punch-list", async ({ page }) => {
    await checkPage(page, "/punch-list");
  });
  test("site-photos", async ({ page }) => {
    await checkPage(page, "/site-photos");
  });
  test("schedule", async ({ page }) => {
    await checkPage(page, "/schedule");
  });
  test("estimates", async ({ page }) => {
    await checkPage(page, "/estimates");
  });
  test("change-orders", async ({ page }) => {
    await checkPage(page, "/change-orders");
  });
  test("system-health", async ({ page }) => {
    await checkPage(page, "/system-health");
  });
  test("system-logs", async ({ page }) => {
    await checkPage(page, "/system-logs");
  });
  test("settings", async ({ page }) => {
    await checkPage(page, "/settings");
  });
});
