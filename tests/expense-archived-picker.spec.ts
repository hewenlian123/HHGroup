import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  assertE2EExpenseVisibleInDatabase,
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  expensesVendorSearch,
  gotoArchivedExpenseListReady,
  waitForQuickExpenseProjectLabel,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function waitForExpensesListShell(
  page: import("@playwright/test").Page,
  timeoutMs = 150_000
) {
  await waitForVisibleQuickExpenseButton(page, timeoutMs);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function skipIfNoExpenseOptions(page: import("@playwright/test").Page): Promise<boolean> {
  await page.goto(`${BASE}/settings/expenses`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const noCfg = await page
    .getByText(/Supabase is not configured/i)
    .isVisible()
    .catch(() => false);
  if (noCfg) return true;
  await page.getByTestId("settings-expenses-tab-payment_method").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({ timeout: 60_000 });
  await page
    .locator("tbody")
    .getByText("Loading…")
    .waitFor({ state: "detached", timeout: 120_000 })
    .catch(() => undefined);
  const migrationRequired = await page
    .getByTestId("settings-expenses-migration-required")
    .isVisible()
    .catch(() => false);
  return migrationRequired;
}

test.describe("Archived expense option in edit modal", () => {
  test.describe.configure({ timeout: 300_000 });

  test("archived payment method still appears with Archived label when selected", async ({
    page,
  }) => {
    test.skip(await skipIfNoExpenseOptions(page), "expense_options missing.");

    const methodName = `ZZ-ARC-${Date.now()}`;
    const vendorMark = `E2E-ARC-V-${Date.now()}`;

    await page.goto(`${BASE}/settings/expenses`);
    await page.getByTestId("settings-expenses-tab-payment_method").click();
    await page.getByTestId("settings-expenses-add-name").fill(methodName);
    await page.getByTestId("settings-expenses-add-submit").click();
    await expect(
      page.locator(`tr[data-testid^="settings-expenses-row-"]`).filter({ hasText: methodName })
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/financial/expenses`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await waitForExpensesListShell(page);

    if (
      await page
        .getByText(/Configure Supabase|Supabase not configured/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    await clickVisibleQuickExpenseButton(page);
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });
    await q.locator("input[type='number']").fill("4.03");
    await q.locator("#quick-expense-vendor").fill(vendorMark);
    await q.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(q, E2E_PRESERVED_PROJECT_LABEL);
    await q.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await q
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await q.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(q).not.toBeVisible({ timeout: 90_000 });

    const snap = await assertE2EExpenseVisibleInDatabase(vendorMark);
    await gotoArchivedExpenseListReady(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);
    const row = expenseListRowById(page, snap.expenseId);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();

    const previewDlg = page.getByRole("dialog", { name: /^Expense$/ });
    await expect(previewDlg).toBeVisible({ timeout: 15_000 });
    await previewDlg.getByRole("button", { name: "Edit", exact: true }).click();
    const editDlg = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(editDlg).toBeVisible({ timeout: 15_000 });

    await editDlg.locator("#edit-expense-payment-method-select").click();
    await page
      .locator('[role="listbox"]')
      .last()
      .getByRole("option", { name: methodName, exact: true })
      .click();
    await editDlg.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await previewDlg.getByRole("button", { name: "Close", exact: true }).last().click();

    await page.goto(`${BASE}/settings/expenses`);
    await page.getByTestId("settings-expenses-tab-payment_method").click();
    const optRow = page
      .locator(`tr[data-testid^="settings-expenses-row-"]`)
      .filter({ hasText: methodName })
      .first();
    await expect(optRow).toBeVisible({ timeout: 30_000 });
    const oid = (await optRow.getAttribute("data-testid"))!.replace("settings-expenses-row-", "");
    await page.getByTestId(`settings-expenses-archive-${oid}`).click();
    await expect(optRow.locator("td").nth(1)).toContainText("Archived");

    await gotoArchivedExpenseListReady(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);
    const row2 = expenseListRowById(page, snap.expenseId);
    await expect(row2).toBeVisible({ timeout: 60_000 });
    await row2.click();
    const preview2 = page.getByRole("dialog", { name: /^Expense$/ });
    await expect(preview2).toBeVisible({ timeout: 15_000 });
    await preview2.getByRole("button", { name: "Edit", exact: true }).click();
    const edit2 = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(edit2).toBeVisible({ timeout: 15_000 });

    await edit2.locator("#edit-expense-payment-method-select").click();
    await expect(
      page
        .locator('[role="listbox"]')
        .last()
        .getByRole("option", { name: `${methodName} (Archived)` })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("archived category still appears with Archived label when selected", async ({ page }) => {
    test.skip(await skipIfNoExpenseOptions(page), "expense_options missing.");

    const categoryName = `ZZ-CAT-ARC-${Date.now()}`;
    const vendorMark = `E2E-CAT-ARC-V-${Date.now()}`;

    await page.goto(`${BASE}/settings/expenses`);
    await page.getByTestId("settings-expenses-tab-category").click();
    await page.getByTestId("settings-expenses-add-name").fill(categoryName);
    await page.getByTestId("settings-expenses-add-submit").click();
    await expect(
      page.locator(`tr[data-testid^="settings-expenses-row-"]`).filter({ hasText: categoryName })
    ).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE}/financial/expenses`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await waitForExpensesListShell(page);

    if (
      await page
        .getByText(/Configure Supabase|Supabase not configured/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    await clickVisibleQuickExpenseButton(page);
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });
    await q.locator("input[type='number']").fill("5.04");
    await q.locator("#quick-expense-vendor").fill(vendorMark);
    await q.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(q, E2E_PRESERVED_PROJECT_LABEL);
    await q.locator("#quick-expense-category-select").click();
    await page
      .locator('[role="listbox"]')
      .last()
      .getByRole("option", { name: categoryName, exact: true })
      .click();
    await q.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await q
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await q.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(q).not.toBeVisible({ timeout: 90_000 });

    const snap = await assertE2EExpenseVisibleInDatabase(vendorMark);

    await page.goto(`${BASE}/settings/expenses`);
    await page.getByTestId("settings-expenses-tab-category").click();
    const optRow = page
      .locator(`tr[data-testid^="settings-expenses-row-"]`)
      .filter({ hasText: categoryName })
      .first();
    await expect(optRow).toBeVisible({ timeout: 30_000 });
    const oid = (await optRow.getAttribute("data-testid"))!.replace("settings-expenses-row-", "");
    await page.getByTestId(`settings-expenses-archive-${oid}`).click();
    await expect(optRow.locator("td").nth(1)).toContainText("Archived");

    await gotoArchivedExpenseListReady(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);
    const row = expenseListRowById(page, snap.expenseId);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();
    const preview = page.getByRole("dialog", { name: /^Expense$/ });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(edit).toBeVisible({ timeout: 15_000 });

    await edit.locator("#edit-expense-category-select").click();
    await expect(
      page
        .locator('[role="listbox"]')
        .last()
        .getByRole("option", { name: `${categoryName} (Archived)` })
    ).toBeVisible({ timeout: 15_000 });
  });
});
