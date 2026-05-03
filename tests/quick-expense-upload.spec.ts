import { test, expect } from "@playwright/test";
import { E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
  clickVisibleQuickExpenseButton,
  expenseListRow,
  expensesVendorSearch,
  waitForExpensesQuerySuccess,
  waitForQuickExpenseProjectLabel,
} from "./e2e-expenses-helpers";

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

    const vendorMark = `E2E-HD-${Date.now()}`;
    await dialog.locator("input[type='number']").fill("120");
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);

    const grid = dialog.locator("form div.grid").first();
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

    await page.goto(E2E_FINANCIAL_INBOX_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
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

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    await expect(dialog.locator('img[alt=""]').first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Uploaded", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });

    const vendorMark = `E2E-QE-${Date.now()}`;
    await dialog.locator("#quick-expense-vendor").fill(vendorMark);
    await dialog.locator("input[type='number']").fill("42.5");
    await dialog.locator("#quick-expense-project-select").click();
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL }).click();
    await waitForQuickExpenseProjectLabel(dialog, E2E_PRESERVED_PROJECT_LABEL);

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

    // With attachment + project + category, quick save can land as archived (`reviewed`), which Inbox excludes.
    await page.goto(E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, { waitUntil: "domcontentloaded" });
    await waitForExpensesQuerySuccess(page);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 60_000 });

    await expensesVendorSearch(page).fill(vendorMark);
    const dataRow = expenseListRow(page, vendorMark);
    await expect(dataRow).toBeVisible({ timeout: 20_000 });
  });

  test("mobile iPhone: receipt input attrs, preview on pick, failed upload keeps preview + retry", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
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

    await page.route("**/api/quick-expense/upload-attachment**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );
    await page.route("**/storage/v1/object/**", (route) =>
      route.fulfill({ status: 403, contentType: "application/json", body: "{}" })
    );

    const fileInput = dialog.getByTestId("quick-expense-receipt-input");
    await expect(fileInput).toHaveAttribute("accept", "image/*,application/pdf");
    await expect(fileInput).toHaveAttribute("capture", "environment");

    await fileInput.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    await expect(dialog.locator('img[alt=""]').first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId("quick-expense-receipt-retry")).toBeVisible({
      timeout: 90_000,
    });

    const noOverflow = await page.evaluate(() => {
      const tol = 2;
      const root = document.documentElement;
      const main = document.querySelector("main");
      const exp = document.querySelector(".expenses-ui");
      const check = (el: Element | null) => !el || el.scrollWidth <= el.clientWidth + tol;
      return root.scrollWidth <= root.clientWidth + tol && check(main) && check(exp);
    });
    expect(noOverflow).toBe(true);
  });
});
