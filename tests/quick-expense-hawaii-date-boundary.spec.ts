import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  assertE2EExpenseVisibleInDatabase,
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  waitForExpensesQuerySuccess,
  waitForQuickExpenseProjectLabel,
} from "./e2e-expenses-helpers";

const HAWAII_LATE_EVENING_INSTANT = new Date("2026-07-30T08:30:00.000Z");
const HAWAII_MONTH_END_INSTANT = new Date("2026-08-01T09:30:00.000Z");
const HAWAII_YEAR_END_INSTANT = new Date("2027-01-01T09:30:00.000Z");

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function cleanupExpenseByVendor(admin: SupabaseClient, vendor: string) {
  const { data: rows, error } = await admin
    .from("expenses")
    .select("id")
    .or(`vendor_name.eq.${vendor},vendor.eq.${vendor}`);
  if (error) throw new Error(`Hawaiʻi boundary cleanup load failed: ${error.message}`);

  const ids = (rows ?? []).map((row) => String((row as { id: string }).id)).filter(Boolean);
  if (ids.length === 0) return;

  const lineDelete = await admin.from("expense_lines").delete().in("expense_id", ids);
  if (lineDelete.error) {
    throw new Error(`Hawaiʻi boundary cleanup lines failed: ${lineDelete.error.message}`);
  }
  const expenseDelete = await admin.from("expenses").delete().in("id", ids);
  if (expenseDelete.error) {
    throw new Error(`Hawaiʻi boundary cleanup expenses failed: ${expenseDelete.error.message}`);
  }
}

async function openQuickExpenseAtBoundary(page: Page, time = HAWAII_LATE_EVENING_INSTANT) {
  await page.clock.install({ time });
  await loginAsE2EOwner(page, E2E_FINANCIAL_EXPENSES_ARCHIVE_URL);
  await waitForExpensesQuerySuccess(page);
  await clickVisibleQuickExpenseButton(page);
  const dialog = page.getByRole("dialog", { name: /Quick expense/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe("Quick Expense Hawaiʻi date boundary", () => {
  test.describe.configure({ timeout: 150_000, retries: 0 });

  test.describe("Hawaiʻi browser time zone", () => {
    test.use({ timezoneId: "Pacific/Honolulu" });

    test("uses July 29 and keeps the saved expense visible in This month", async ({ page }) => {
      const admin = adminClient();
      if (!admin) {
        test.skip(true, "Supabase service role is not configured.");
        return;
      }

      const vendorMark = `E2E-HST-DATE-${Date.now()}`;
      try {
        const dialog = await openQuickExpenseAtBoundary(page);
        await expect(dialog.getByRole("button", { name: "Choose date" })).toContainText(
          "07/29/2026"
        );

        await dialog.locator("input[type='number']").fill("37.29");
        await dialog.locator("#quick-expense-vendor").fill(vendorMark);
        await dialog.locator("#quick-expense-project-select").click();
        await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
        await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);

        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await expect
          .poll(
            async () =>
              /expense saved/i.test(await page.locator("body").innerText()) ? "done" : null,
            { timeout: 120_000, intervals: [400] }
          )
          .toBe("done");
        await expect(dialog).not.toBeVisible({ timeout: 30_000 });

        const saved = await assertE2EExpenseVisibleInDatabase(vendorMark);
        expect(saved.expense_date).toBe("2026-07-29");

        await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
          waitUntil: "domcontentloaded",
        });
        await waitForExpensesQuerySuccess(page);

        await expect(expenseListRowById(page, saved.expenseId)).toBeVisible({
          timeout: 30_000,
        });
        const monthSummary = page.getByText("This Month", { exact: true }).locator("..");
        await expect(monthSummary).toContainText("$37.29");
      } finally {
        await cleanupExpenseByVendor(admin, vendorMark);
      }
    });
  });

  test.describe("UTC browser time zone", () => {
    test.use({ timezoneId: "UTC" });

    test("still uses the Hawaiʻi calendar date", async ({ page }) => {
      const dialog = await openQuickExpenseAtBoundary(page);
      await expect(dialog.getByRole("button", { name: "Choose date" })).toContainText("07/29/2026");
    });

    test("does not cross the Hawaiʻi month boundary early", async ({ page }) => {
      const dialog = await openQuickExpenseAtBoundary(page, HAWAII_MONTH_END_INSTANT);
      await expect(dialog.getByRole("button", { name: "Choose date" })).toContainText("07/31/2026");
    });

    test("does not cross the Hawaiʻi year boundary early", async ({ page }) => {
      const dialog = await openQuickExpenseAtBoundary(page, HAWAII_YEAR_END_INSTANT);
      await expect(dialog.getByRole("button", { name: "Choose date" })).toContainText("12/31/2026");
    });
  });
});
