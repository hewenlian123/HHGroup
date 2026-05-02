import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import {
  expectExpenseVendorRowArchiveOrInbox,
  expenseListRow,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
  waitForReceiptQueuePatchIdle,
  waitForReceiptQueuePatchesAfterPressQuiet,
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
  /** Shift+Enter + reload polls need headroom; serial avoids shared-queue races. */
  test.describe.configure({ timeout: 300_000, retries: 2, mode: "serial" });

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

    await expectExpenseVendorRowArchiveOrInbox(page, vendorMark, { timeoutMs: 180_000 });
    await expect
      .poll(
        async () => {
          const row = expenseListRow(page, vendorMark);
          if (!(await row.isVisible().catch(() => false))) return false;
          const t = (await row.innerText()).replace(/\s+/g, " ");
          return t.includes("88.12") && t.includes("[E2E] Seed — HH Unified");
        },
        { timeout: 120_000, intervals: [400, 800, 1500, 2500] }
      )
      .toBe(true);
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

  test.describe("Shift+Enter multi-row reload", () => {
    test.describe.configure({ retries: 0 });

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

    await expect
      .poll(
        async () => {
          const a = (await row1.getByPlaceholder("Vendor").inputValue()).trim();
          const b = (await row2.getByPlaceholder("Vendor").inputValue()).trim();
          return a === v1 && b === v2;
        },
        { timeout: 30_000, intervals: [50, 100, 200, 400] }
      )
      .toBe(true);

    await waitForReceiptQueuePatchIdle(page, 800, 90_000);

    await waitForReceiptQueuePatchesAfterPressQuiet(
      page,
      async () => {
        await vendor2.press("Shift+Enter");
      },
      1200,
      180_000
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      await expect
        .poll(
          async () => {
            const { data, error } = await sb
              .from("receipt_queue")
              .select("file_name,vendor_name")
              .in("file_name", [f1, f2]);
            if (error) throw error;
            const m = new Map(
              (data ?? []).map((r: { file_name: string; vendor_name: string | null }) => [
                r.file_name,
                String(r.vendor_name ?? "").trim(),
              ])
            );
            return m.get(f1) === v1 && m.get(f2) === v2;
          },
          { timeout: 120_000, intervals: [200, 400, 600, 1000] }
        )
        .toBe(true);
    }

    const receiptQueueListReload = page.waitForResponse(
      (resp) => {
        const req = resp.request();
        return (
          resp.url().includes("receipt_queue") &&
          req.method() === "GET" &&
          resp.status() >= 200 &&
          resp.status() < 300
        );
      },
      { timeout: 120_000 }
    );
    await Promise.all([
      receiptQueueListReload,
      page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 }),
    ]);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await expect
      .poll(
        async () => {
          const rA = receiptQueueRowByFileName(page, f1);
          const rB = receiptQueueRowByFileName(page, f2);
          if ((await rA.count()) === 0 || (await rB.count()) === 0) return false;
          const a = (await rA.getByPlaceholder("Vendor").inputValue()).trim();
          const b = (await rB.getByPlaceholder("Vendor").inputValue()).trim();
          return a === v1 && b === v2;
        },
        { timeout: 240_000, intervals: [200, 400, 600, 1000, 1500] }
      )
      .toBe(true);
    });
  });
});
