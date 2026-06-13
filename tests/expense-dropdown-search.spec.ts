import { randomUUID } from "crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  expensesVendorSearch,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

const E2E_PRESERVED_WORKER_LABEL = "[E2E] Seed Worker";

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function attachConsoleCollector(page: Page) {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return {
    assertClean() {
      expect(errors).toEqual([]);
      expect(badResponses.filter((entry) => !entry.includes("/_next/"))).toEqual([]);
    },
  };
}

async function waitForExpenseShell(page: Page): Promise<void> {
  await waitForVisibleQuickExpenseButton(page, 150_000);
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
}

async function chooseSearchResult(
  page: Page,
  trigger: Locator,
  query: string,
  optionName: string | RegExp
): Promise<void> {
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await trigger.click();
  const content = page.locator('[data-expense-combobox-content="true"]').last();
  await expect(content).toBeVisible({ timeout: 15_000 });
  const search = content.getByRole("searchbox", { name: /search options/i });
  await expect(search).toBeFocused({ timeout: 10_000 });
  await search.fill(query);
  const option = content.getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await search.press("Enter");
  await expect(content).toBeHidden({ timeout: 10_000 });
}

async function expectArrowKeyboardSelects(
  page: Page,
  trigger: Locator,
  query: string,
  optionName: string | RegExp
): Promise<void> {
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await trigger.click();
  const content = page.locator('[data-expense-combobox-content="true"]').last();
  await expect(content).toBeVisible({ timeout: 15_000 });
  const search = content.getByRole("searchbox", { name: /search options/i });
  await search.fill(query);
  await search.press("ArrowDown");
  await search.press("ArrowUp");
  await expect(content.getByRole("option", { name: optionName }).first()).toBeVisible({
    timeout: 15_000,
  });
  await search.press("Enter");
  await expect(content).toBeHidden({ timeout: 10_000 });
}

async function expectEmptyStateAndEscape(
  page: Page,
  trigger: Locator,
  emptyText: RegExp = /No results/i
): Promise<void> {
  await trigger.click();
  const content = page.locator('[data-expense-combobox-content="true"]').last();
  await expect(content).toBeVisible({ timeout: 15_000 });
  const search = content.getByRole("searchbox", { name: /search options/i });
  await search.fill("zz-no-matching-expense-option");
  await expect(content.getByText(emptyText)).toBeVisible({ timeout: 10_000 });
  await search.press("Escape");
  await expect(content).toBeHidden({ timeout: 10_000 });
}

async function seedExpense(
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
    amount: 4.25,
    total: 4.25,
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
    amount: 4.25,
    total: 4.25,
  });
  expect(lineInsert.error, lineInsert.error ? JSON.stringify(lineInsert.error) : "").toBeNull();
}

async function cleanupExpense(admin: SupabaseClient, expenseId: string): Promise<void> {
  await admin.from("attachments").delete().eq("entity_type", "expense").eq("entity_id", expenseId);
  await admin.from("expense_attachments").delete().eq("expense_id", expenseId);
  await admin.from("expense_lines").delete().eq("expense_id", expenseId);
  await admin.from("expenses").delete().eq("id", expenseId);
}

test.describe("Expense searchable dropdowns", () => {
  test.describe.configure({ timeout: 240_000 });

  test("Quick Expense dropdowns filter typed text and support keyboard selection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const consoleState = attachConsoleCollector(page);

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForExpenseShell(page);
    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await chooseSearchResult(
      page,
      dialog.locator("#quick-expense-cost-allocation-select"),
      "proj",
      "Project Cost"
    );
    await expect(dialog.locator("#quick-expense-cost-allocation-select")).toContainText(
      "Project Cost"
    );

    await chooseSearchResult(
      page,
      dialog.locator("#quick-expense-project-select"),
      "seed",
      E2E_PRESERVED_PROJECT_LABEL
    );
    await expect(dialog.locator("#quick-expense-project-select")).toContainText(
      E2E_PRESERVED_PROJECT_LABEL
    );

    await expectArrowKeyboardSelects(
      page,
      dialog.locator("#quick-expense-category-select"),
      "veh",
      "Vehicle"
    );
    await expect(dialog.locator("#quick-expense-category-select")).toContainText("Vehicle");

    await chooseSearchResult(page, dialog.locator("#quick-expense-payment-select"), "amex", "Amex");
    await expect(dialog.locator("#quick-expense-payment-select")).toContainText("Amex");

    await expectEmptyStateAndEscape(
      page,
      dialog.locator("#quick-expense-category-select"),
      /No matching categories/i
    );
    consoleState.assertClean();
  });

  test("Edit Expense and Inbox Preview dropdowns are searchable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const admin = adminClient();
    test.skip(!admin, "Supabase service role is required to seed expense dropdown tests.");
    const consoleState = attachConsoleCollector(page);
    const reviewedId = randomUUID();
    const inboxId = randomUUID();
    const reviewedVendor = `E2E-COMBO-EDIT-${Date.now()}`;
    const inboxVendor = `E2E-COMBO-INBOX-${Date.now()}`;

    await seedExpense(admin!, {
      id: reviewedId,
      vendor: reviewedVendor,
      status: "reviewed",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });
    await seedExpense(admin!, {
      id: inboxId,
      vendor: inboxVendor,
      status: "needs_review",
      projectId: null,
    });

    try {
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitForExpenseShell(page);
      await expensesVendorSearch(page).fill(reviewedVendor);
      const row = expenseListRowById(page, reviewedId);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.click();
      const expenseDialog = page.getByRole("dialog");
      await expect(expenseDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
        timeout: 15_000,
      });
      await expenseDialog.getByRole("button", { name: /^Edit$/ }).click();
      await expect(expenseDialog.getByRole("heading", { name: /Edit expense/i })).toBeVisible({
        timeout: 15_000,
      });

      await chooseSearchResult(
        page,
        expenseDialog.locator("#edit-expense-payment-source-select"),
        "worker",
        "Worker reimbursement"
      );
      await chooseSearchResult(
        page,
        expenseDialog.locator("#edit-expense-worker-select"),
        "seed",
        E2E_PRESERVED_WORKER_LABEL
      );
      await chooseSearchResult(
        page,
        expenseDialog.locator("#edit-expense-payment-method-select"),
        "amex",
        "Amex"
      );
      await chooseSearchResult(
        page,
        expenseDialog.locator("#edit-expense-payment-select"),
        "amex",
        "Amex"
      );

      await page.goto("/financial/inbox", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitForExpenseShell(page);
      await expensesVendorSearch(page).fill(inboxVendor);
      const inboxRow = expenseListRowById(page, inboxId);
      await expect(inboxRow).toBeVisible({ timeout: 60_000 });
      await inboxRow.click();
      const inboxDialog = page.getByRole("dialog");
      await expect(inboxDialog.getByRole("heading", { name: /^Expense$/ })).toBeVisible({
        timeout: 15_000,
      });
      await inboxDialog.getByRole("button", { name: /^Edit$/ }).click();
      await expect(inboxDialog.getByRole("heading", { name: /Edit expense/i })).toBeVisible({
        timeout: 15_000,
      });
      await chooseSearchResult(
        page,
        inboxDialog.locator("#edit-expense-cost-allocation-select"),
        "over",
        "Overhead"
      );
      await chooseSearchResult(
        page,
        inboxDialog.locator("#edit-expense-payment-source-select"),
        "worker",
        "Worker reimbursement"
      );
      await chooseSearchResult(
        page,
        inboxDialog.locator("#edit-expense-worker-select"),
        "seed",
        E2E_PRESERVED_WORKER_LABEL
      );
      await chooseSearchResult(
        page,
        inboxDialog.locator("#edit-expense-category-select"),
        "veh",
        "Vehicle"
      );
      consoleState.assertClean();
    } finally {
      await cleanupExpense(admin!, reviewedId);
      await cleanupExpense(admin!, inboxId);
    }
  });

  test("New Expense page dropdowns are searchable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const consoleState = attachConsoleCollector(page);

    await page.goto("/financial/expenses/new", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: /New expense/i })).toBeVisible({
      timeout: 60_000,
    });

    await chooseSearchResult(
      page,
      page.locator("#new-expense-cost-allocation-select"),
      "proj",
      "Project Cost"
    );
    await expect(page.locator("#new-expense-cost-allocation-select")).toContainText("Project Cost");

    await chooseSearchResult(
      page,
      page.locator("#new-expense-project-select"),
      "seed",
      E2E_PRESERVED_PROJECT_LABEL
    );
    await expect(page.locator("#new-expense-project-select")).toContainText(
      E2E_PRESERVED_PROJECT_LABEL
    );

    await chooseSearchResult(page, page.locator("#new-expense-category-select"), "veh", "Vehicle");
    await expect(page.locator("#new-expense-category-select")).toContainText("Vehicle");

    await chooseSearchResult(page, page.locator("#new-expense-payment-select"), "amex", "Amex");
    await expect(page.locator("#new-expense-payment-select")).toContainText("Amex");

    consoleState.assertClean();
  });

  test("Quick Expense searchable dropdown stays inside a 390px mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const consoleState = attachConsoleCollector(page);

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForExpenseShell(page);
    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.locator("#quick-expense-category-select").click();
    const content = page.locator('[data-expense-combobox-content="true"]').last();
    await expect(content).toBeVisible({ timeout: 15_000 });
    await content.getByRole("searchbox", { name: /search options/i }).fill("veh");
    await expect(content.getByRole("option", { name: "Vehicle" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(content).toBeHidden({ timeout: 10_000 });
    consoleState.assertClean();
  });
});
