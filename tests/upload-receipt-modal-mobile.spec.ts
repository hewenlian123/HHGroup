import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
} from "./e2e-expenses-helpers";

async function openMobileUploadReceiptDialog(page: Page, url: string): Promise<Locator> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

  const upload = page.getByTestId("mobile-upload-receipt");
  await expect(upload).toBeVisible({ timeout: 15_000 });
  await upload.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog).toHaveCSS("pointer-events", "auto");
  await expect(dialog.getByRole("heading", { name: "Upload receipt" })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

async function expectFileChooserFromRealClick(
  page: Page,
  button: Locator,
  multiple: boolean
): Promise<void> {
  await expect(button).toBeVisible();
  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
  await button.click();
  const fileChooser = await fileChooserPromise;
  expect(fileChooser.isMultiple()).toBe(multiple);
  await fileChooser.setFiles([]);
}

async function expectUploadReceiptDialogActions(page: Page, dialog: Locator): Promise<void> {
  const cameraInput = dialog.getByTestId("upload-receipt-camera-input");
  const filesInput = dialog.getByTestId("upload-receipt-files-input");

  await expect(cameraInput).toHaveCount(1);
  await expect(cameraInput).toHaveAttribute("type", "file");
  await expect(cameraInput).toHaveAttribute("accept", "image/*");
  await expect(cameraInput).toHaveAttribute("capture", "environment");

  await expect(filesInput).toHaveCount(1);
  await expect(filesInput).toHaveAttribute("type", "file");
  await expect(filesInput).toHaveAttribute("accept", "image/*,application/pdf");
  await expect(filesInput).toHaveAttribute("multiple", "");

  await expectFileChooserFromRealClick(
    page,
    dialog.getByRole("button", { name: /Take Photo/i }),
    false
  );
  await expectFileChooserFromRealClick(
    page,
    dialog.getByRole("button", { name: /Upload Files/i }),
    true
  );

  const close = dialog.getByTestId("upload-receipt-modal-close");
  await expect(close).toBeVisible();
  await close.click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

/**
 * Mobile viewport: tap Upload in the financial Inbox/Expenses header opens the same Upload receipt
 * dialog. File pickers are triggered only through real Playwright pointer clicks.
 */
test.describe("Upload receipt modal (mobile)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Inbox: mobile Upload opens, file actions trigger, and Close dismisses", async ({
    page,
  }) => {
    const dialog = await openMobileUploadReceiptDialog(page, E2E_FINANCIAL_INBOX_URL);
    await expectUploadReceiptDialogActions(page, dialog);
  });

  test("Expenses: mobile Upload opens, file actions trigger, and Close dismisses", async ({
    page,
  }) => {
    const dialog = await openMobileUploadReceiptDialog(page, E2E_FINANCIAL_EXPENSES_ARCHIVE_URL);
    await expectUploadReceiptDialogActions(page, dialog);
  });
});
