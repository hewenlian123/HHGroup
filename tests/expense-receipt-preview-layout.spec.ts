import { expect, test } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import {
  attachmentPreviewModal,
  pickOrCreatePaymentInSelect,
  prepareReceiptQueueRowForConfirm,
  receiptQueueExpenseSuccessSeen,
  receiptQueueRowByFileName,
} from "./e2e-expenses-helpers";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** 1×1 PNG — receipt queue → preview dialog layout screenshot (global attachment preview). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Expense receipt preview (layout)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("receipt queue Preview receipt dialog: centered image screenshot", async ({ page }) => {
    const shotPath = resolve(process.cwd(), "test-results/receipt-preview-dialog-layout.png");
    mkdirSync(dirname(shotPath), { recursive: true });
    const vendorMark = `E2E-PV-${Date.now()}`;
    const queueFileName = `receipt-layout-${Date.now()}.png`;

    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    if (
      await page
        .getByText(/Configure Supabase to upload/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase browser client not configured.");
    }

    await page.locator("main").locator('input[type="file"][multiple]').setInputFiles({
      name: queueFileName,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const queueRow = receiptQueueRowByFileName(page, queueFileName);
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    await prepareReceiptQueueRowForConfirm(page, queueRow, {
      vendor: vendorMark,
      amount: "22.22",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });

    const paySel = queueRow
      .locator("select")
      .filter({ has: page.getByRole("option", { name: "+ Add new account" }) })
      .first();
    await pickOrCreatePaymentInSelect(page, paySel);

    const previewTrigger = queueRow.getByRole("button", { name: /preview receipt/i });
    await expect(previewTrigger).toBeEnabled({ timeout: 120_000 });
    await previewTrigger.click();

    const preview = attachmentPreviewModal(page);
    await expect(preview).toBeVisible({ timeout: 15_000 });
    const img = preview.locator("img").first();
    await expect(img).toBeAttached();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 30_000,
        intervals: [200],
      })
      .toBeGreaterThan(0);

    await preview.screenshot({ path: shotPath });

    await preview.getByRole("button", { name: "Close" }).click();
    await expect(preview).toBeHidden({ timeout: 10_000 });

    // Soft refresh can refetch before debounced queue patches land; re-sync row + payment.
    await prepareReceiptQueueRowForConfirm(
      page,
      queueRow,
      { vendor: vendorMark, amount: "22.22", projectId: E2E_PRESERVED_PROJECT_ID },
      { assertConfirmEnabled: true }
    );
    await pickOrCreatePaymentInSelect(page, paySel);

    await queueRow.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect
      .poll(
        async () => {
          const t = await page.locator("body").innerText();
          if (/create failed/i.test(t)) throw new Error("Confirm failed.");
          return receiptQueueExpenseSuccessSeen(t) ? "done" : null;
        },
        { timeout: 120_000, intervals: [300] }
      )
      .toBe("done");
  });
});
