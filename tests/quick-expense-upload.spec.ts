import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { expenseListRow, expensesVendorSearch } from "./e2e-expenses-helpers";

/** Minimal valid 1×1 PNG (keeps upload + OCR path light in CI). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Quick Expense: upload and save", () => {
  test.describe.configure({ timeout: 120_000 });

  test("manual save binds project (not Overhead)", async ({ page }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
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
    const projectSelect = dialog
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) });
    await projectSelect.selectOption({ value: E2E_PRESERVED_PROJECT_ID });

    const grid = dialog.locator(".grid.grid-cols-2").first();
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

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    await expensesVendorSearch(page).fill(vendorMark);
    const dataRow = expenseListRow(page, vendorMark);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
    await expect(dataRow).toContainText("[E2E] Seed — HH Unified");
    await expect(dataRow).not.toContainText("Overhead");
  });

  test("upload shows attachment count, preview control, and saves", async ({ page }) => {
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
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

    await expect(dialog.getByText(/Scanning/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/Scanning/i)).not.toBeVisible({ timeout: 90_000 });

    await expect(dialog.getByRole("button", { name: /attached — view/i })).toBeVisible({
      timeout: 15_000,
    });

    const vendorMark = `E2E-QE-${Date.now()}`;
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("input[type='number']").fill("42.5");

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

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    await expensesVendorSearch(page).fill(vendorMark);
    const dataRow = expenseListRow(page, vendorMark);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
  });
});
