import { test, expect, type Locator } from "@playwright/test";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
} from "./e2e-expenses-helpers";

/**
 * Close via the real header button. Uses `HTMLElement.click()` because Playwright’s pointer
 * hit-testing often reports `position:fixed` portal controls as “outside the viewport” even when
 * visible (Chromium + narrow layout viewport).
 */
async function clickUploadReceiptModalClose(dialog: Locator): Promise<void> {
  const close = dialog.getByTestId("upload-receipt-modal-close");
  await expect(close).toBeVisible();
  await close.evaluate((el) => (el as HTMLButtonElement).click());
}

/**
 * Mobile viewport: tap Upload in the financial Inbox/Expenses header opens the same Upload receipt dialog.
 * UI-only; does not exercise storage or OCR.
 */
test.describe("Upload receipt modal (mobile)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Inbox: mobile Upload opens Upload receipt dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page.getByTestId("mobile-upload-receipt").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Upload receipt" })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test("Inbox: mobile Close button dismisses Upload receipt dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page.getByTestId("mobile-upload-receipt").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Upload receipt" })).toBeVisible({
      timeout: 15_000,
    });
    await clickUploadReceiptModalClose(dialog);
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test("Expenses: mobile Upload opens Upload receipt dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page.getByTestId("mobile-upload-receipt").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Upload receipt" })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test("Expenses: mobile Close button dismisses Upload receipt dialog", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page.getByTestId("mobile-upload-receipt").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Upload receipt" })).toBeVisible({
      timeout: 15_000,
    });
    await clickUploadReceiptModalClose(dialog);
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });
});
