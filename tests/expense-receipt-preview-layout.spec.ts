import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID, purgeE2EReceiptQueueRows } from "./e2e-cleanup-db";
import {
  attachmentPreviewModal,
  pickOrCreatePaymentInSelect,
  pollReceiptQueueRowUntilConfirmableDom,
  prepareReceiptQueueRowForConfirm,
  receiptQueuePaymentAccountTrigger,
  receiptQueueRowByFileName,
  receiptQueueRowIdFromLocator,
  waitForReceiptQueueConfirmDeleteResponse,
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
    const ts = Date.now();
    /** PNG uploads are compressed to JPEG; DB row uses `.jpg` file_name. */
    const queueFileStored = `receipt-layout-${ts}.jpg`;

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

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbService) {
      await purgeE2EReceiptQueueRows(createClient(sbUrl, sbService));
    }

    await page
      .locator("main")
      .locator('input[type="file"][multiple]')
      .setInputFiles({
        name: `receipt-layout-${ts}.png`,
        mimeType: "image/png",
        buffer: PNG_1X1,
      });

    const queueRow = receiptQueueRowByFileName(page, queueFileStored);
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    await prepareReceiptQueueRowForConfirm(page, queueRow, {
      vendor: vendorMark,
      amount: "22.22",
      projectId: E2E_PRESERVED_PROJECT_ID,
    });

    const paySel = receiptQueuePaymentAccountTrigger(queueRow);
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

    // Soft refresh can refetch before debounced queue patches land; re-resolve row after preview closes.
    const rowForConfirm = page
      .locator(`[data-testid="receipt-queue-row"][data-queue-file-name="${queueFileStored}"]`)
      .first();
    await expect(rowForConfirm).toBeVisible({ timeout: 120_000 });
    await pollReceiptQueueRowUntilConfirmableDom(
      page,
      rowForConfirm,
      { vendor: vendorMark, amount: "22.22", projectId: E2E_PRESERVED_PROJECT_ID },
      {
        afterPrepare: async () => {
          const paySelFresh = receiptQueuePaymentAccountTrigger(rowForConfirm);
          await pickOrCreatePaymentInSelect(page, paySelFresh);
        },
      }
    );

    const receiptQueueRowId = await receiptQueueRowIdFromLocator(rowForConfirm);
    if (!receiptQueueRowId) {
      throw new Error("E2E: missing data-receipt-queue-row on receipt queue row");
    }
    const confirmPersisted = waitForReceiptQueueConfirmDeleteResponse(page, receiptQueueRowId);
    await rowForConfirm.getByRole("button", { name: "Confirm", exact: true }).click();
    await confirmPersisted;
  });
});
