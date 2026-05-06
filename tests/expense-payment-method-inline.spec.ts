import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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

/** AppShell is `ssr: false`; `main` is absent until the client chunk loads — anchor on list UI instead. */
async function waitForExpensesListShell(page: Page, timeoutMs = 150_000): Promise<void> {
  await waitForVisibleQuickExpenseButton(page, timeoutMs);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function createReviewedQuickExpense(page: Page, vendorMark: string, amount = "5.04") {
  await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
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
  await q.locator("input[type='number']").fill(amount);
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
  return assertE2EExpenseVisibleInDatabase(vendorMark);
}

async function paymentMethodForExpense(expenseId: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !key) return null;
  const sb = createClient(supabaseUrl, key);
  const { data, error } = await sb
    .from("expenses")
    .select("payment_method")
    .eq("id", expenseId)
    .maybeSingle();
  expect(error, error ? JSON.stringify(error) : "").toBeNull();
  return (data?.payment_method as string | null) ?? null;
}

async function skipIfNoExpenseOptions(page: Page): Promise<boolean> {
  await page.goto("/settings/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
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
  return page
    .getByTestId("settings-expenses-migration-required")
    .isVisible()
    .catch(() => false);
}

function settingsRowByOptionName(page: Page, label: string) {
  return page
    .locator(`tr[data-testid^="settings-expenses-row-"]`)
    .filter({ hasText: label })
    .first();
}

test.describe("Expense inbox payment method (preview modal)", () => {
  /** Cold `next dev` + Quick modal + reloads need headroom beyond a single 180s gate. */
  test.describe.configure({ timeout: 300_000 });

  test("updates row after save from modal and persists after reload", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
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

    const vendorMark = `E2E-PM-MODAL-${Date.now()}`;

    await clickVisibleQuickExpenseButton(page);
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });

    if (
      await q
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    await q.locator("input[type='number']").fill("9.01");
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

    const rowText = (await row.innerText()).replace(/\s+/g, " ");
    const targetMethod = /\bVisa\b/i.test(rowText) ? "Amex" : "Visa";

    const urlBefore = page.url();

    await row.click();
    const previewDlg = page.getByRole("dialog", { name: /^Expense$/ });
    await expect(previewDlg).toBeVisible({ timeout: 15_000 });

    await previewDlg.getByRole("button", { name: "Edit", exact: true }).click();
    const editDlg = page.getByRole("dialog", { name: /Edit expense/i });
    await expect(editDlg).toBeVisible({ timeout: 15_000 });

    const pmTrigger = editDlg.locator("#edit-expense-payment-method-select");
    await pmTrigger.click();
    await page
      .locator('[role="listbox"]')
      .last()
      .getByRole("option", { name: targetMethod, exact: true })
      .click();

    await editDlg.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await previewDlg.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(previewDlg).not.toBeVisible({ timeout: 15_000 });

    await expect(row).toContainText(targetMethod);

    await expect(page.getByRole("dialog", { name: /Edit expense/i })).not.toBeVisible();
    expect(page.url().split("#")[0]).toBe(urlBefore.split("#")[0]);

    await gotoArchivedExpenseListReady(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);
    const rowAfter = expenseListRowById(page, snap.expenseId);
    await expect(rowAfter).toBeVisible({ timeout: 60_000 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data: dbRows, error: dbErr } = await sb
        .from("expenses")
        .select("payment_method,vendor,vendor_name,created_at")
        .or(`vendor_name.eq.${vendorMark},vendor.eq.${vendorMark}`)
        .order("created_at", { ascending: false })
        .limit(1);
      expect(dbErr, dbErr ? JSON.stringify(dbErr) : "").toBeNull();
      expect(
        dbRows?.length ?? 0,
        `expected at least one expense for vendor ${vendorMark}`
      ).toBeGreaterThanOrEqual(1);
      const latest = dbRows![0];
      expect(
        latest.payment_method,
        `expected DB payment_method on latest row for ${vendorMark}`
      ).toBe(targetMethod);
    }

    await expect(rowAfter).toContainText(targetMethod, { timeout: 15_000 });
  });

  test("quick add payment method from edit modal becomes selected", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
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

    const vendorMark = `E2E-PM-QUICKADD-${Date.now()}`;
    const newMethod = `ZZ-PM-${Date.now()}`;

    await clickVisibleQuickExpenseButton(page);
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });

    await q.locator("input[type='number']").fill("3.02");
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
    await page.getByRole("option", { name: "+ Add new" }).click();
    const addDlg = page.getByRole("dialog", { name: "New payment method" });
    await expect(addDlg).toBeVisible({ timeout: 10_000 });
    await addDlg.getByPlaceholder("Name").fill(newMethod);
    await addDlg.getByRole("button", { name: "Add", exact: true }).click();
    await expect(addDlg).not.toBeVisible({ timeout: 15_000 });

    await expect(editDlg.locator("#edit-expense-payment-method-select")).toContainText(newMethod, {
      timeout: 15_000,
    });

    await editDlg.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("quick expense uses configured active default payment method", async ({ page }) => {
    test.skip(await skipIfNoExpenseOptions(page), "expense_options missing.");

    const defaultMethod = `ZZ-PM-DEFAULT-${Date.now()}`;
    await page.getByTestId("settings-expenses-add-name").fill(defaultMethod);
    await page.getByTestId("settings-expenses-add-submit").click();
    const row = settingsRowByOptionName(page, defaultMethod);
    await expect(row).toBeVisible({ timeout: 30_000 });
    const id = (await row.getAttribute("data-testid"))!.replace("settings-expenses-row-", "");
    await page.getByTestId(`settings-expenses-default-${id}`).click();
    await expect(row.locator("td").nth(2)).toContainText("Yes", { timeout: 30_000 });

    const vendorMark = `E2E-PM-DEFAULT-${Date.now()}`;
    const snap = await createReviewedQuickExpense(page, vendorMark, "6.05");
    expect(snap.payment_method).toBe(defaultMethod);
  });

  test("live expense detail route saves active Expense Options payment method", async ({
    page,
  }) => {
    test.skip(await skipIfNoExpenseOptions(page), "expense_options missing.");

    const vendorMark = `E2E-PM-DETAIL-${Date.now()}`;
    const newMethod = `ZZ-PM-DETAIL-${Date.now()}`;
    await page.getByTestId("settings-expenses-add-name").fill(newMethod);
    await page.getByTestId("settings-expenses-add-submit").click();
    await expect(settingsRowByOptionName(page, newMethod)).toBeVisible({ timeout: 30_000 });

    const snap = await createReviewedQuickExpense(page, vendorMark, "7.06");

    await page.goto(`/financial/expenses/${snap.expenseId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const trigger = page.locator("#expense-detail-payment-method-select");
    await expect(trigger).toBeVisible({ timeout: 60_000 });

    await trigger.click();
    await page.getByRole("option", { name: newMethod, exact: true }).click();
    await expect(trigger).toContainText(newMethod, { timeout: 15_000 });

    await page.getByRole("button", { name: "Save header" }).click();
    await expect
      .poll(() => paymentMethodForExpense(snap.expenseId), {
        timeout: 30_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(newMethod);
  });

  test("edit modal payment method fallback stays populated when expense_options is unavailable", async ({
    page,
  }) => {
    const vendorMark = `E2E-PM-FALLBACK-${Date.now()}`;
    const snap = await createReviewedQuickExpense(page, vendorMark, "8.07");

    await page.route(/\/rest\/v\d+\/expense_options(?:\?|$)/, (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Could not find the table 'public.expense_options' in the schema cache",
        }),
      })
    );

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
    const listbox = page.locator('[role="listbox"]').last();
    await expect(listbox.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await expect(listbox).not.toContainText("No options");
    await page.keyboard.press("Escape");

    await editDlg.locator("#edit-expense-category-select").click();
    const categoryListbox = page.locator('[role="listbox"]').last();
    await expect(categoryListbox.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await expect(categoryListbox).not.toContainText("No options");
  });
});
