import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import {
  expenseListRow,
  expensesVendorSearch,
  fillControlledTextInput,
  prepareReceiptQueueRowForConfirm,
  receiptQueueExpenseSuccessSeen,
  receiptQueueRowByFileName,
} from "./e2e-expenses-helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Expenses: receipt upload queue", () => {
  /** Parallel chromium workers + shared local DB can starve upload/OCR; retries absorb flake. */
  test.describe.configure({ timeout: 120_000, retries: 2, mode: "serial" });

  test("upload → receipt queue → confirm creates expense and clears row", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const vendorMark = `E2E-RQ-${Date.now()}`;
    const queueFileName = `queue-receipt-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const queueRow = receiptQueueRowByFileName(page, queueFileName);
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    await prepareReceiptQueueRowForConfirm(
      page,
      queueRow,
      {
        vendor: vendorMark,
        amount: "88.12",
        projectId: E2E_PRESERVED_PROJECT_ID,
      },
      { assertConfirmEnabled: true }
    );

    await queueRow.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect
      .poll(
        async () => {
          const body = await page.locator("body").innerText();
          if (/create failed/i.test(body)) {
            throw new Error("Receipt queue: Create failed toast.");
          }
          if (receiptQueueExpenseSuccessSeen(body)) return "done";
          const n = await page
            .getByTestId("receipt-queue-row")
            .filter({ has: page.locator(`input[value="${vendorMark}"]`) })
            .count();
          if (n === 0) return "done";
          return null;
        },
        { timeout: 120_000, intervals: [300] }
      )
      .toBe("done");

    await expect(
      page
        .getByTestId("receipt-queue-row")
        .filter({ has: page.locator(`input[value="${vendorMark}"]`) })
    ).toHaveCount(0, {
      timeout: 15_000,
    });

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorMark);
    const dataRow = expenseListRow(page, vendorMark);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
    await expect(dataRow).toContainText("[E2E] Seed — HH Unified");
  });

  test("inline validation shows stable vendor/amount hints after bad confirm", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const queueFileName = `queue-validate-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, "");
    await fillControlledTextInput(row.getByPlaceholder("Amount"), "");

    await row.getByRole("button", { name: "Confirm", exact: true }).click();

    const vendorHint = row.getByText("Vendor required");
    const amountHint = row.getByText("Amount required");
    await expect(vendorHint).toBeVisible();
    await expect(amountHint).toBeVisible();

    await fillControlledTextInput(vendorIn, "x");
    await expect(vendorHint).toBeHidden();
    await expect(amountHint).toBeVisible();
  });

  test("Enter moves focus to next field in the same row", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const queueFileName = `queue-enter-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, `E2E-Enter-${Date.now()}`);
    await vendorIn.press("Enter");
    await expect(row.getByPlaceholder("Amount")).toBeFocused({ timeout: 10_000 });
  });

  test("Shift+Enter flushes debounced vendor edit before reload", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const mark = `E2E-SHIFT-${Date.now()}`;
    const queueFileName = `queue-shift-${Date.now()}.png`;
    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const row = receiptQueueRowByFileName(page, queueFileName);
    await expect(row).toBeVisible({ timeout: 120_000 });
    const vendorIn = row.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorIn.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendorIn, mark);
    await vendorIn.press("Shift+Enter");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    const rowAfter = receiptQueueRowByFileName(page, queueFileName);
    await expect(rowAfter).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(async () => (await rowAfter.getByPlaceholder("Vendor").inputValue()).trim() === mark, {
        timeout: 60_000,
      })
      .toBe(true);
  });

  test("Shift+Enter persists debounced vendor edits on multiple rows after reload", async ({
    page,
  }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Browser Supabase client not configured (NEXT_PUBLIC_* env).");
    }

    const ts = Date.now();
    const f1 = `queue-multi-a-${ts}.png`;
    const f2 = `queue-multi-b-${ts}.png`;
    await page
      .locator("main")
      .locator('input[type="file"][multiple]')
      .setInputFiles([
        { name: f1, mimeType: "image/png", buffer: PNG_1X1 },
        { name: f2, mimeType: "image/png", buffer: PNG_1X1 },
      ]);

    const row1 = receiptQueueRowByFileName(page, f1);
    const row2 = receiptQueueRowByFileName(page, f2);
    await expect(row1).toBeVisible({ timeout: 120_000 });
    await expect(row2).toBeVisible({ timeout: 120_000 });

    const v1 = `E2E-M1-${ts}`;
    const v2 = `E2E-M2-${ts}`;
    const vendor1 = row1.locator('input[placeholder="Vendor"]:not([disabled])').first();
    const vendor2 = row2.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendor1.waitFor({ state: "visible", timeout: 120_000 });
    await vendor2.waitFor({ state: "visible", timeout: 120_000 });
    await fillControlledTextInput(vendor1, v1);
    await fillControlledTextInput(vendor2, v2);
    await vendor2.press("Shift+Enter");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    const r1 = receiptQueueRowByFileName(page, f1);
    const r2 = receiptQueueRowByFileName(page, f2);
    await expect(r1).toBeVisible({ timeout: 120_000 });
    await expect(r2).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(
        async () =>
          (await r1.getByPlaceholder("Vendor").inputValue()).trim() === v1 &&
          (await r2.getByPlaceholder("Vendor").inputValue()).trim() === v2,
        { timeout: 90_000 }
      )
      .toBe(true);
  });
});
