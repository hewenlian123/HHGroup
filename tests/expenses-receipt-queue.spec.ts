import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { expenseListRow, expensesVendorSearch } from "./e2e-expenses-helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Expenses: receipt upload queue", () => {
  test.describe.configure({ timeout: 120_000 });

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

    const queueRow = page.locator("tbody tr").filter({ hasText: queueFileName }).first();
    await expect(queueRow).toBeVisible({ timeout: 120_000 });
    const vendorInput = queueRow.locator('input[placeholder="Vendor"]:not([disabled])').first();
    await vendorInput.waitFor({ state: "visible", timeout: 120_000 });
    await vendorInput.fill(vendorMark);
    await queueRow.getByPlaceholder("Amount").fill("88.12");

    const projectSelect = queueRow
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) });
    await projectSelect.selectOption({ value: E2E_PRESERVED_PROJECT_ID });

    await expect(queueRow.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled({
      timeout: 60_000,
    });
    await queueRow.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect
      .poll(
        async () => {
          const body = await page.locator("body").innerText();
          if (/create failed/i.test(body)) {
            throw new Error("Receipt queue: Create failed toast.");
          }
          if (/expense created/i.test(body)) return "done";
          return null;
        },
        { timeout: 120_000, intervals: [300] }
      )
      .toBe("done");

    await expect(page.locator(`tbody tr:has(input[value="${vendorMark}"])`)).toHaveCount(0, {
      timeout: 15_000,
    });

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });
    await expensesVendorSearch(page).fill(vendorMark);
    const dataRow = expenseListRow(page, vendorMark);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
    await expect(dataRow).toContainText("[E2E] Seed — HH Unified");
  });
});
