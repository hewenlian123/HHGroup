import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  assertE2EExpenseVisibleInDatabase,
  clickVisibleQuickExpenseButton,
  expenseListRowById,
  waitForExpensesQuerySuccess,
  waitForQuickExpenseProjectLabel,
} from "./e2e-expenses-helpers";

/** Minimal valid 1×1 PNG (keeps upload + OCR path light in CI). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function receiptOcrPngBytes(page: import("@playwright/test").Page, runId: string) {
  const receipt = await page.context().newPage();
  try {
    await receipt.setViewportSize({ width: 640, height: 900 });
    await receipt.setContent(
      `<!doctype html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #f3f4f6; font-family: Arial, sans-serif; }
            .wrap { padding: 42px; }
            .receipt { background: #fff; color: #111; padding: 34px; width: 480px; box-shadow: 0 12px 28px rgba(0,0,0,.18); }
            .center { text-align: center; }
            .brand { font-size: 34px; font-weight: 900; letter-spacing: .08em; }
            .small { font-size: 18px; line-height: 1.35; }
            .line { border-top: 2px dashed #222; margin: 20px 0; }
            .row { display: flex; justify-content: space-between; gap: 18px; font-size: 20px; line-height: 1.55; }
            .total { font-size: 30px; font-weight: 900; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="receipt">
              <div class="center brand">LOWE'S</div>
              <div class="center small">HOME IMPROVEMENT RECEIPT</div>
              <div class="center small">Store 2345 Honolulu HI</div>
              <div class="line"></div>
              <div class="small">Date: 06/10/2026</div>
              <div class="small">Receipt: QUICK-OCR-E2E-${runId}</div>
              <div class="line"></div>
              <div class="row"><span>Electrical Wire</span><span>$28.99</span></div>
              <div class="row"><span>Outlet Box</span><span>$9.00</span></div>
              <div class="row"><span>Sales Tax</span><span>$4.38</span></div>
              <div class="line"></div>
              <div class="row total"><span>TOTAL</span><span>$42.37</span></div>
              <div class="small">Paid with AMEX card</div>
              <div class="small">Thank you for shopping Lowe's</div>
            </div>
          </div>
        </body>
      </html>`,
      { waitUntil: "load" }
    );
    return (await receipt.screenshot({ fullPage: true })) as Buffer;
  } finally {
    await receipt.close();
  }
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function cleanupQuickCategoryRows(
  admin: SupabaseClient,
  {
    categoryNames,
    vendorPrefix,
  }: {
    categoryNames: string[];
    vendorPrefix: string;
  }
) {
  const { data: expenses, error: expenseLoadError } = await admin
    .from("expenses")
    .select("id")
    .or(`vendor_name.ilike.${vendorPrefix}%,vendor.ilike.${vendorPrefix}%`);
  if (expenseLoadError)
    throw new Error(`quick category cleanup load failed: ${expenseLoadError.message}`);

  const expenseIds = (expenses ?? []).map((row) => String((row as { id: string }).id));
  if (expenseIds.length > 0) {
    const lineDelete = await admin.from("expense_lines").delete().in("expense_id", expenseIds);
    if (lineDelete.error) {
      throw new Error(`quick category cleanup lines failed: ${lineDelete.error.message}`);
    }
    const expenseDelete = await admin.from("expenses").delete().in("id", expenseIds);
    if (expenseDelete.error) {
      throw new Error(`quick category cleanup expenses failed: ${expenseDelete.error.message}`);
    }
  }

  for (const name of categoryNames) {
    await admin.from("expense_options").delete().eq("type", "category").ilike("name", name);
  }
}

async function addCategoryFromQuickExpense(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator,
  name: string
) {
  await dialog.locator("#quick-expense-category-select").click();
  await page.getByRole("option", { name: "+ Add new category" }).click();
  const categoryDialog = page.getByRole("dialog", { name: /New category/i });
  await expect(categoryDialog).toBeVisible({ timeout: 10_000 });
  await categoryDialog.getByPlaceholder("Category name").fill(name);
  await categoryDialog.getByRole("button", { name: "Add", exact: true }).click();
  return categoryDialog;
}

test.describe("Quick Expense: upload and save", () => {
  test.describe.configure({ timeout: 120_000 });

  test("manual save binds project (not Overhead)", async ({ page }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page);

    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const vendorMark = `E2E-HD-${Date.now()}`;
    await dialog.locator("input[type='number']").fill("120");
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);
    await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(vendorMark);

    const grid = dialog.locator("form div.grid").first();
    await expect(grid).toBeVisible();
    await expect(grid.getByText("Amount", { exact: true })).toBeVisible();
    await expect(grid.getByText("Vendor", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await dialog
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 4_000 })
        .catch(() => false)
    ) {
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    }

    await expect
      .poll(
        async () => {
          const body = await page.locator("body").innerText();
          if (/save failed/i.test(body)) {
            throw new Error("Quick expense: Save failed toast is visible.");
          }
          const err = dialog
            .locator("p.text-xs.text-destructive")
            .or(dialog.locator("p.text-sm.text-destructive"));
          if (
            await err
              .first()
              .isVisible()
              .catch(() => false)
          ) {
            throw new Error(
              `Quick expense: ${((await err.first().textContent()) ?? "").trim() || "validation error"}`
            );
          }
          if (/expense saved/i.test(body)) return "done";
          return null;
        },
        { timeout: 120_000, intervals: [400] }
      )
      .toBe("done");

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });
    const saved = await assertE2EExpenseVisibleInDatabase(vendorMark);

    // Project + category quick saves are workflow-complete and belong in the archive list.
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    const dataRow = expenseListRowById(page, saved.expenseId);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
    await expect(dataRow).toContainText("Unknown Vendor");
    await expect(dataRow).not.toContainText(vendorMark);
    await expect(dataRow).toContainText("[E2E] Seed — HH Unified");
    await expect(dataRow).not.toContainText("Overhead");
  });

  test("receipt OCR autofills Lowe's fields before save", async ({ page }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    const runId = `${Date.now()}`;
    const vendorPrefix = `E2E-QE-OCR-${runId}`;
    await cleanupQuickCategoryRows(admin, {
      categoryNames: [],
      vendorPrefix,
    });

    try {
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page);

      await clickVisibleQuickExpenseButton(page);
      const dialog = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      if (
        await dialog
          .getByText(/Supabase not configured/i)
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
      }

      await dialog.locator('input[type="file"]').setInputFiles({
        name: `quick-ocr-${runId}.png`,
        mimeType: "image/png",
        buffer: await receiptOcrPngBytes(page, runId),
      });

      await expect(dialog.locator("#quick-expense-vendor")).toHaveValue("Lowe's", {
        timeout: 150_000,
      });
      await expect(dialog.locator("input[type='number']")).toHaveValue("42.37");
      await expect(dialog.locator("input[type='date']")).toHaveValue("2026-06-10");
      await expect(dialog.locator("#quick-expense-category-select")).toContainText("Materials");

      const savedVendor = `${vendorPrefix}-lowes`;
      await dialog.locator("#quick-expense-vendor").fill(savedVendor);
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

      const saved = await assertE2EExpenseVisibleInDatabase(savedVendor);
      const { data: line, error: lineError } = await admin
        .from("expense_lines")
        .select("amount,category")
        .eq("expense_id", saved.expenseId)
        .limit(1)
        .maybeSingle();
      if (lineError) throw new Error(`Quick OCR line check failed: ${lineError.message}`);
      expect(
        Number((line as { amount?: number | string | null } | null)?.amount ?? 0).toFixed(2)
      ).toBe("42.37");
      expect(String((line as { category?: string | null } | null)?.category ?? "")).toBe(
        "Materials"
      );
    } finally {
      await cleanupQuickCategoryRows(admin, {
        categoryNames: [],
        vendorPrefix,
      });
    }
  });

  test("overhead can save without project, while project cost requires project", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    const stamp = Date.now();
    const vendorPrefix = `E2E-QE-OH-${stamp}`;

    await cleanupQuickCategoryRows(admin, {
      categoryNames: [],
      vendorPrefix,
    });

    try {
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page);

      await clickVisibleQuickExpenseButton(page);
      let dialog = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      if (
        await dialog
          .getByText(/Supabase not configured/i)
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
      }

      const overheadVendor = `${vendorPrefix}-fuel`;
      await dialog.locator("input[type='number']").fill("31.25");
      await dialog.locator("#quick-expense-vendor").fill(overheadVendor);
      await dialog.locator("#quick-expense-category-select").click();
      await page.getByRole("option", { name: "Other", exact: true }).click();
      await expect(dialog.locator("#quick-expense-category-select")).toContainText("Other");
      await dialog.locator("#quick-expense-cost-allocation-select").click();
      await page.getByRole("option", { name: "Overhead", exact: true }).click();
      await dialog.locator("#quick-expense-project-select").click();
      await page.getByRole("option", { name: "No project", exact: true }).click();
      await expect(dialog.locator("#quick-expense-project-select")).toContainText(/No project/i);

      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect
        .poll(
          async () =>
            /expense saved/i.test(await page.locator("body").innerText()) ? "done" : null,
          { timeout: 120_000, intervals: [400] }
        )
        .toBe("done");
      await expect(dialog).not.toBeVisible({ timeout: 30_000 });

      const overheadSaved = await assertE2EExpenseVisibleInDatabase(overheadVendor);
      expect(overheadSaved.status).toBe("reviewed");
      expect(overheadSaved.project_id).toBeNull();
      expect(overheadSaved.line_project_id).toBeNull();
      expect(overheadSaved.line_category).toBe("Other");

      await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, { waitUntil: "domcontentloaded" });
      await waitForExpensesQuerySuccess(page);
      await expect(expenseListRowById(page, overheadSaved.expenseId)).toBeVisible({
        timeout: 30_000,
      });

      await clickVisibleQuickExpenseButton(page);
      dialog = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      const projectCostVendor = `${vendorPrefix}-materials`;
      await dialog.locator("input[type='number']").fill("44.4");
      await dialog.locator("#quick-expense-vendor").fill(projectCostVendor);
      await dialog.locator("#quick-expense-category-select").click();
      await page.getByRole("option", { name: "Materials", exact: true }).click();
      await dialog.locator("#quick-expense-cost-allocation-select").click();
      await page.getByRole("option", { name: "Project Cost", exact: true }).click();
      await dialog.locator("#quick-expense-project-select").click();
      await page.getByRole("option", { name: "No project", exact: true }).click();
      await expect(dialog.locator("#quick-expense-project-select")).toContainText(/No project/i);

      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog.getByText(/Project Cost expenses require a project/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(projectCostVendor);
      await expect(dialog.locator("input[type='number']")).toHaveValue("44.4");

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

      const projectCostSaved = await assertE2EExpenseVisibleInDatabase(projectCostVendor);
      expect(projectCostSaved.status).toBe("reviewed");
      expect(projectCostSaved.line_project_id).not.toBeNull();
      expect(projectCostSaved.line_category).toBe("Materials");
    } finally {
      await cleanupQuickCategoryRows(admin, {
        categoryNames: [],
        vendorPrefix,
      });
    }
  });

  test("upload shows attachment count, preview control, and saves", async ({ page }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page);

    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    await expect(dialog.locator('img[alt=""]').first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled({
      timeout: 90_000,
    });

    const vendorMark = `E2E-QE-${Date.now()}`;
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("input[type='number']").fill("42.5");
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);
    await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(vendorMark);

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await dialog
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 4_000 })
        .catch(() => false)
    ) {
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
    }

    await expect
      .poll(
        async () => {
          const body = await page.locator("body").innerText();
          if (/save failed/i.test(body)) {
            throw new Error("Quick expense: Save failed toast is visible.");
          }
          const err = dialog
            .locator("p.text-xs.text-destructive")
            .or(dialog.locator("p.text-sm.text-destructive"));
          if (
            await err
              .first()
              .isVisible()
              .catch(() => false)
          ) {
            throw new Error(
              `Quick expense: ${((await err.first().textContent()) ?? "").trim() || "validation error"}`
            );
          }
          if (/expense saved/i.test(body)) return "done";
          if (body.includes(vendorMark)) return "done";
          return null;
        },
        { timeout: 120_000, intervals: [400] }
      )
      .toBe("done");

    await expect(dialog).not.toBeVisible({ timeout: 30_000 });
    const saved = await assertE2EExpenseVisibleInDatabase(vendorMark);

    // With attachment + project + category, quick save can land as archived (`reviewed`), which Inbox excludes.
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    const dataRow = expenseListRowById(page, saved.expenseId);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
    await expect(dataRow).toContainText("Unknown Vendor");
    await expect(dataRow).not.toContainText(vendorMark);
  });

  test("adds, reuses, and saves a Quick Expense category without losing form fields", async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) {
      test.skip(true, "Supabase service role is not configured.");
      return;
    }

    const stamp = Date.now();
    const vendorPrefix = `E2E-QECAT-${stamp}`;
    const newCategory = `E2E Foundation ${stamp}`;

    await cleanupQuickCategoryRows(admin, {
      categoryNames: [newCategory],
      vendorPrefix,
    });

    try {
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await waitForExpensesQuerySuccess(page);

      await clickVisibleQuickExpenseButton(page);
      const dialog = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      const vendorMark = `${vendorPrefix}-save`;
      await dialog.locator("input[type='number']").fill("88.88");
      await dialog.locator("#quick-expense-vendor").fill(vendorMark);
      await dialog.locator("#quick-expense-project-select").click();
      await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
      await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);
      const paymentBefore = await dialog.locator("#quick-expense-payment-select").innerText();
      const dateBefore = await dialog.locator("input[type='date']").inputValue();

      const categoryDialog = await addCategoryFromQuickExpense(page, dialog, newCategory);
      await expect(categoryDialog).not.toBeVisible({ timeout: 15_000 });
      await expect(dialog.locator("#quick-expense-category-select")).toContainText(newCategory, {
        timeout: 15_000,
      });
      await expect(dialog.locator("input[type='number']")).toHaveValue("88.88");
      await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(vendorMark);
      await expect(dialog.locator("#quick-expense-project-select")).toContainText(
        E2E_PRESERVED_PROJECT_LABEL
      );
      await expect(dialog.locator("#quick-expense-payment-select")).toContainText(
        paymentBefore.trim()
      );
      await expect(dialog.locator("input[type='date']")).toHaveValue(dateBefore);

      await dialog.locator("#quick-expense-category-select").click();
      await page.getByRole("option", { name: "Other", exact: true }).click();
      await expect(dialog.locator("#quick-expense-category-select")).toContainText("Other");

      const existingCategoryDialog = await addCategoryFromQuickExpense(page, dialog, newCategory);
      await expect(existingCategoryDialog).not.toBeVisible({ timeout: 15_000 });
      await expect(dialog.locator("#quick-expense-category-select")).toContainText(newCategory, {
        timeout: 15_000,
      });
      await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(vendorMark);
      await expect(dialog.locator("input[type='number']")).toHaveValue("88.88");

      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      if (
        await dialog
          .getByText(/Possible duplicate/i)
          .isVisible({ timeout: 4_000 })
          .catch(() => false)
      ) {
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
      }

      await expect
        .poll(
          async () => {
            const body = await page.locator("body").innerText();
            if (/save failed/i.test(body)) {
              throw new Error("Quick expense: Save failed toast is visible.");
            }
            if (/expense saved/i.test(body)) return "done";
            return null;
          },
          { timeout: 120_000, intervals: [400] }
        )
        .toBe("done");

      const saved = await assertE2EExpenseVisibleInDatabase(vendorMark);
      expect(saved.line_category).toBe(newCategory);

      await clickVisibleQuickExpenseButton(page);
      const reopened = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(reopened).toBeVisible({ timeout: 15_000 });
      await reopened.locator("#quick-expense-category-select").click();
      await expect(page.getByRole("option", { name: newCategory, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanupQuickCategoryRows(admin, {
        categoryNames: [newCategory],
        vendorPrefix,
      });
    }
  });

  test("shows precise inline category create errors and preserves Quick Expense fields", async ({
    page,
  }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page);

    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const vendorMark = `E2E-QECAT-ERR-${Date.now()}`;
    await dialog.locator("input[type='number']").fill("55.55");
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);

    await page.route("**/api/settings/expense-options", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Permission denied for table expense_options.",
        }),
      });
    });

    const categoryDialog = await addCategoryFromQuickExpense(
      page,
      dialog,
      `E2E Blocked Category ${Date.now()}`
    );
    await expect(categoryDialog).toBeVisible();
    await expect(categoryDialog.getByTestId("expense-category-create-error")).toContainText(
      "Permission denied for table expense_options."
    );
    await categoryDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(categoryDialog).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("input[type='number']")).toHaveValue("55.55");
    await expect(dialog.locator("#quick-expense-vendor")).toHaveValue(vendorMark);
    await expect(dialog.locator("#quick-expense-project-select")).toContainText(
      E2E_PRESERVED_PROJECT_LABEL
    );
  });

  test("mobile iPhone: receipt input attrs, preview on pick, failed upload keeps preview + retry", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await waitForExpensesQuerySuccess(page);

    await clickVisibleQuickExpenseButton(page);
    const dialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    await page.route("**/api/quick-expense/upload-attachment**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );
    await page.route("**/storage/v1/object/**", (route) =>
      route.fulfill({ status: 403, contentType: "application/json", body: "{}" })
    );

    const fileInput = dialog.getByTestId("quick-expense-receipt-input");
    await expect(fileInput).toHaveAttribute("accept", "image/*,application/pdf");
    await expect(fileInput).toHaveAttribute("capture", "environment");

    await fileInput.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    await expect(dialog.locator('img[alt=""]').first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId("quick-expense-receipt-retry")).toBeVisible({
      timeout: 90_000,
    });

    const noOverflow = await page.evaluate(() => {
      const tol = 2;
      const root = document.documentElement;
      const main = document.querySelector("main");
      const exp = document.querySelector(".expenses-ui");
      const check = (el: Element | null) => !el || el.scrollWidth <= el.clientWidth + tol;
      return root.scrollWidth <= root.clientWidth + tol && check(main) && check(exp);
    });
    expect(noOverflow).toBe(true);
  });
});
