import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import {
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

function attachConsoleCollector(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return {
    assertClean() {
      expect(errors).toEqual([]);
    },
  };
}

async function expectNeoDatePicker(page: Page, triggerSelector: string) {
  const trigger = page.locator(triggerSelector);
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const popover = page.locator('[data-finance-date-picker-content="true"]').last();
  await expect(popover).toBeVisible({ timeout: 10_000 });
  await expect(popover).toContainText("Today");

  const background = await popover.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).not.toBe("rgb(255, 255, 255)");

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden({ timeout: 10_000 });
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function cleanupExpense(admin: SupabaseClient, expenseId: string): Promise<void> {
  await admin.from("attachments").delete().eq("entity_type", "expense").eq("entity_id", expenseId);
  await admin.from("expense_attachments").delete().eq("expense_id", expenseId);
  await admin.from("expense_lines").delete().eq("expense_id", expenseId);
  await admin.from("expenses").delete().eq("id", expenseId);
}

async function seedExpenseForDatePicker(
  admin: SupabaseClient,
  params: { id: string; vendor: string; status: string; projectId?: string | null }
): Promise<void> {
  await cleanupExpense(admin, params.id);
  const today = new Date().toISOString().slice(0, 10);
  const expenseInsert = await admin.from("expenses").insert({
    id: params.id,
    vendor_name: params.vendor,
    vendor: params.vendor,
    payment_method: "Amex",
    status: params.status,
    expense_date: today,
    source_type: "company",
    amount: 8.75,
    total: 8.75,
    line_count: 1,
    project_id: params.projectId ?? null,
  });
  expect(
    expenseInsert.error,
    expenseInsert.error ? JSON.stringify(expenseInsert.error) : ""
  ).toBeNull();

  const lineInsert = await admin.from("expense_lines").insert({
    expense_id: params.id,
    project_id: params.projectId ?? null,
    category: "Other",
    amount: 8.75,
    total: 8.75,
  });
  expect(lineInsert.error, lineInsert.error ? JSON.stringify(lineInsert.error) : "").toBeNull();
}

async function openExpenseEditDialog(page: Page, url: string, vendor: string, expenseId: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForExpensesQuerySuccess(page, 90_000);
  await expensesVendorSearch(page).fill(vendor);
  const row = expenseListRowById(page, expenseId);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: /^Edit$/ }).click();
  await expect(dialog.getByRole("heading", { name: /Edit expense/i })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

async function openExpenseActionsEditDialog(
  page: Page,
  url: string,
  vendor: string,
  expenseId: string
) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForExpensesQuerySuccess(page, 90_000);
  await expensesVendorSearch(page).fill(vendor);
  const row = expenseListRowById(page, expenseId);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole("button", { name: /row actions/i }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Edit expense/i }).last();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test.describe("Expense date picker", () => {
  test.describe.configure({ timeout: 180_000 });

  test("Quick Expense uses the Neo date picker instead of native browser date UI", async ({
    page,
  }) => {
    const consoleState = attachConsoleCollector(page);
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded" });
    await waitForVisibleQuickExpenseButton(page, 150_000);
    await clickVisibleQuickExpenseButton(page);

    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('input[type="date"]')).toHaveCount(0);

    await expectNeoDatePicker(page, "#quick-expense-date");
    consoleState.assertClean();
  });

  test("Expense row edit and Inbox Review use the Neo date picker", async ({ page }) => {
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed date picker smoke rows.");
    const consoleState = attachConsoleCollector(page);
    const reviewedId = randomUUID();
    const inboxId = randomUUID();
    const reviewedVendor = `E2E-DATE-EDIT-${Date.now()}`;
    const inboxVendor = `E2E-DATE-INBOX-${Date.now()}`;

    await seedExpenseForDatePicker(admin!, {
      id: reviewedId,
      vendor: reviewedVendor,
      status: "reviewed",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });
    await seedExpenseForDatePicker(admin!, {
      id: inboxId,
      vendor: inboxVendor,
      status: "needs_review",
      projectId: null,
    });

    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      const editDialog = await openExpenseActionsEditDialog(
        page,
        "/financial/expenses",
        reviewedVendor,
        reviewedId
      );
      await expect(editDialog.locator('input[type="date"]')).toHaveCount(0);
      await expectNeoDatePicker(page, "#inbox-preview-expense-date");

      const inboxDialog = await openExpenseEditDialog(
        page,
        "/financial/inbox",
        inboxVendor,
        inboxId
      );
      await expect(inboxDialog.locator('input[type="date"]')).toHaveCount(0);
      await expectNeoDatePicker(page, "#inbox-preview-expense-date");

      consoleState.assertClean();
    } finally {
      await cleanupExpense(admin!, reviewedId);
      await cleanupExpense(admin!, inboxId);
    }
  });

  test("New Expense uses the Neo date picker without mobile overflow", async ({ page }) => {
    const consoleState = attachConsoleCollector(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial/expenses/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    await expectNeoDatePicker(page, "#new-expense-date");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    consoleState.assertClean();
  });
});
