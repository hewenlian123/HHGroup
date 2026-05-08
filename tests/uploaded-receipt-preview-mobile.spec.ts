import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  clickVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const FAKE_SIGNED_RECEIPT_URL = "https://receipt-preview.test/mobile-signed-receipt.png";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installSlowReceiptRoutes(page: Page): Promise<void> {
  await page.route("**/api/quick-expense/upload-attachment**", async (route) => {
    await delay(1400);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        path: "quick-expense/e2e-mobile-signed-receipt.png",
        signed_url: FAKE_SIGNED_RECEIPT_URL,
        public_url: FAKE_SIGNED_RECEIPT_URL,
      }),
    });
  });

  await page.route("https://receipt-preview.test/**", async (route) => {
    const isHead = route.request().method() === "HEAD";
    await delay(isHead ? 900 : 3000);
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
        "content-length": String(PNG_1X1.length),
      },
      body: isHead ? undefined : PNG_1X1,
    });
  });
}

async function openQuickExpense(page: Page): Promise<Locator> {
  await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
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
  return dialog;
}

async function expectDarkPreviewShell(preview: Locator): Promise<void> {
  const shell = await preview.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
    };
  });
  expect(
    shell.backgroundImage !== "none" ||
      /rgb\((?:0|1?[0-9]|2[0-9]|3[0-9])[, ]/.test(shell.backgroundColor),
    `preview shell should not be a white blank: ${JSON.stringify(shell)}`
  ).toBe(true);
}

test.describe("Uploaded receipt preview mobile smoothness", () => {
  test.describe.configure({ timeout: 150_000, retries: 0 });

  test("iPhone: preview opens immediately, handles delayed signed image, repeats, and leaves no stale overlay", async ({
    page,
  }) => {
    await installSlowReceiptRoutes(page);
    const dialog = await openQuickExpense(page);

    const fileInput = dialog.getByTestId("quick-expense-receipt-input");
    await fileInput.setInputFiles({
      name: "mobile-receipt.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    const receiptThumb = dialog.getByRole("button", { name: /^Preview receipt$/ }).first();
    await expect(receiptThumb).toBeVisible({ timeout: 1500 });

    const preview = page.locator("[data-attachment-preview-modal]");
    const firstOpenAt = Date.now();
    await receiptThumb.tap();
    await expect(preview).toBeVisible({ timeout: 1000 });
    expect(Date.now() - firstOpenAt).toBeLessThan(700);
    await expectDarkPreviewShell(preview);

    const imageArea = preview.getByTestId("receipt-preview-image-area");
    await expect(imageArea).toHaveAttribute("data-preview-stage", /loading|ready/, {
      timeout: 1000,
    });
    await expect(imageArea).toHaveAttribute("data-preview-stage", "ready", { timeout: 5000 });

    await preview.getByRole("button", { name: /^Close$/ }).tap();
    await expect(preview).not.toBeVisible({ timeout: 5000 });

    await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    await receiptThumb.tap();
    await expect(preview).toBeVisible({ timeout: 1000 });
    await expectDarkPreviewShell(preview);
    await expect(imageArea).toHaveAttribute("data-preview-stage", "checking", { timeout: 500 });
    await expect(preview.locator('[aria-busy="true"], .animate-pulse').first()).toBeVisible({
      timeout: 500,
    });
    await expect(imageArea).toHaveAttribute("data-preview-stage", "ready", { timeout: 8000 });

    for (let i = 0; i < 3; i += 1) {
      await preview.getByRole("button", { name: /^Close$/ }).tap();
      await expect(preview).not.toBeVisible({ timeout: 5000 });
      const openAt = Date.now();
      await receiptThumb.tap();
      await expect(preview).toBeVisible({ timeout: 1000 });
      expect(Date.now() - openAt).toBeLessThan(700);
      await expect(imageArea).toHaveAttribute("data-preview-stage", "ready", { timeout: 1500 });
    }

    const imgBox = await preview.locator("img").first().boundingBox();
    expect(imgBox).not.toBeNull();
    await page.touchscreen.tap(imgBox!.x + imgBox!.width / 2, imgBox!.y + imgBox!.height / 2);
    await page.touchscreen.tap(imgBox!.x + imgBox!.width / 2, imgBox!.y + imgBox!.height / 2);

    await preview.getByRole("button", { name: /^Close$/ }).tap();
    await expect(preview).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-attachment-preview-modal]")).toHaveCount(0, {
      timeout: 5000,
    });

    const previewStillBlocksTouch = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return Boolean(el?.closest("[data-attachment-preview-modal]"));
    });
    expect(previewStillBlocksTouch).toBe(false);

    const vendorInput = dialog.locator("#quick-expense-vendor");
    await vendorInput.tap();
    await expect(vendorInput).toBeFocused();
  });
});
