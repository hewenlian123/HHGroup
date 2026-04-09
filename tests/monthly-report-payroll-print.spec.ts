/**
 * Payroll statement (Print / PDF layout): monthly report print root matches seeded labor month.
 * Runs under default Playwright project `chromium` (not worker-payment*.spec.ts).
 */
import { test, expect } from "@playwright/test";

import { E2E_PRESERVED_WORKER_ID } from "./e2e-cleanup-db";

/** Matches tests/e2e-ensure-seed.ts preserved labor `workDate` (UTC yesterday). */
function preservedLaborMonthYm(): string {
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  return `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, "0")}`;
}

test.describe("Monthly report — payroll statement print", () => {
  test("Print / PDF block shows company, totals, summary, activity table", async ({ page }) => {
    test.setTimeout(120_000);
    const monthYm = preservedLaborMonthYm();
    const wid = E2E_PRESERVED_WORKER_ID;

    await page.goto(
      `/worker/${encodeURIComponent(wid)}/monthly-report?month=${encodeURIComponent(monthYm)}`
    );
    await page.waitForLoadState("domcontentloaded");
    if (
      await page
        .getByText(/Supabase is not configured|Failed to load/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Backend / Supabase unavailable.");
    }
    await expect(page.getByRole("heading", { name: /^Monthly report$/i })).toBeVisible({
      timeout: 60_000,
    });
    await page
      .getByText("Loading…")
      .first()
      .waitFor({ state: "hidden", timeout: 30_000 })
      .catch(() => {
        /* no loading row on fast SSR */
      });
    await expect(page.getByText(/^Earned$/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Print / PDF" }).click();

    await page.emulateMedia({ media: "print" });
    const root = page.locator(".payroll-statement-print-root");
    await expect(root).toBeVisible({ timeout: 15_000 });

    await expect(
      root.getByRole("heading", { name: "Payroll Statement", exact: true })
    ).toBeVisible();
    await expect(root.getByText(/^\[E2E\] Seed Worker$/)).toBeVisible();
    await expect(root.getByText("Period", { exact: false })).toBeVisible();

    const companyLine = root.locator("header").locator("p").first();
    await expect(companyLine).not.toHaveText("");
    const companyText = (await companyLine.textContent())?.trim() ?? "";
    expect(companyText.length).toBeGreaterThan(0);

    await expect(root.getByText("Total days", { exact: true })).toBeVisible();
    await expect(root.getByText("Daily rate", { exact: true })).toBeVisible();
    await expect(
      root.getByText("Total days", { exact: true }).locator("xpath=following-sibling::dd[1]")
    ).toHaveText("1");
    await expect(
      root.getByText("Daily rate", { exact: true }).locator("xpath=following-sibling::dd[1]")
    ).toContainText("200.00");

    await expect(root.getByText("Earned", { exact: true })).toBeVisible();
    await expect(root.getByText("Total owed", { exact: true })).toBeVisible();
    await expect(root.getByText("Paid", { exact: true })).toBeVisible();
    await expect(root.getByText("Balance", { exact: true })).toBeVisible();

    await expect(root.getByRole("heading", { name: "Activity" })).toBeVisible();
    const activityTable = root.locator("table").first();
    await expect(activityTable).toBeVisible();
    await expect(activityTable.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(activityTable.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(activityTable.getByRole("columnheader", { name: "Project" })).toBeVisible();
    await expect(activityTable.getByRole("columnheader", { name: "Amount" })).toBeVisible();

    await expect(page.locator("body")).not.toContainText(
      /Application error|Internal Server Error/i
    );
  });
});
