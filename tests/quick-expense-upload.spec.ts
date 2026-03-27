import { test, expect } from "@playwright/test";

/** Minimal valid 1×1 PNG (keeps upload + OCR path light in CI). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Quick Expense: upload and save", () => {
  test.describe.configure({ timeout: 120_000 });

  test("upload shows attachment count, preview control, and saves", async ({ page }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page.getByRole("button", { name: "Quick Expense" }).click();
    const dialog = page.getByRole("dialog", { name: /Quick Expense Upload/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    if (
      await dialog
        .getByText(/Supabase is not configured/i)
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

    await expect(dialog.getByText("Processing...")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Processing...")).not.toBeVisible({ timeout: 90_000 });

    await expect(dialog.getByText(/1 file\(s\) ready/i)).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("button", { name: "View attachment 1" })).toBeVisible();

    const vendorMark = `E2E-QE-${Date.now()}`;
    await dialog
      .locator(
        "input:not([type='file']):not([type='number']):not([type='date']):not([type='hidden'])"
      )
      .first()
      .fill(vendorMark);
    await dialog.locator("input[type='number']").fill("42.5");

    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    const savedToast = page.locator('[role="status"]').filter({ hasText: "Expense saved" });
    await expect(savedToast).toBeVisible({ timeout: 45_000 });

    await expect(dialog).not.toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    await page.getByPlaceholder("Search expenses...").fill(vendorMark);
    const dataRow = page.locator("tbody tr").filter({ hasText: vendorMark }).first();
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
  });
});
