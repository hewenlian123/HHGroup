import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { expenseListRow, expensesVendorSearch } from "./e2e-expenses-helpers";

/** AppShell is `ssr: false`; `main` is absent until the client chunk loads — anchor on list UI instead. */
async function waitForExpensesListShell(page: Page, timeoutMs = 150_000): Promise<void> {
  await page
    .getByRole("button", { name: /Quick expense/i })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
}

test.describe("Expense list inline payment method", () => {
  /** Cold `next dev` + Quick modal + reloads need headroom beyond a single 180s gate. */
  test.describe.configure({ timeout: 300_000 });

  test("updates row optimistically and persists after reload", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForExpensesListShell(page);

    if (
      await page
        .getByText(/Configure Supabase|Supabase not configured/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const vendorMark = `E2E-PM-INLINE-${Date.now()}`;

    await page
      .getByRole("button", { name: /Quick expense/i })
      .first()
      .click();
    const q = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(q).toBeVisible({ timeout: 15_000 });

    if (
      await q
        .getByText(/Supabase not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    await q.locator("input[type='number']").fill("9.01");
    await q.locator("#quick-expense-vendor").fill(vendorMark);
    await q
      .locator("select")
      .filter({ has: page.locator(`option[value="${E2E_PRESERVED_PROJECT_ID}"]`) })
      .selectOption({ value: E2E_PRESERVED_PROJECT_ID });
    await q.getByRole("button", { name: "Save", exact: true }).click();
    if (
      await q
        .getByText(/Possible duplicate/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await q.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(q).not.toBeVisible({ timeout: 90_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForExpensesListShell(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);

    const row = expenseListRow(page, vendorMark);
    await expect(row).toBeVisible({ timeout: 60_000 });

    const pmButton = row.locator("button[title^='Payment method:']");
    await expect(pmButton).toBeVisible();
    const titleBefore = (await pmButton.getAttribute("title")) ?? "";
    expect(titleBefore.length).toBeGreaterThan(0);

    const targetMethod = titleBefore.includes("Visa") ? "Amex" : "Visa";

    const urlBefore = page.url();

    await pmButton.click();
    const combo = row.getByRole("combobox");
    await expect(combo).toBeVisible({ timeout: 10_000 });
    await combo.click();
    await page.getByRole("option", { name: targetMethod, exact: true }).click();

    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const pmTitleRe = new RegExp(
      `Payment method:.*${targetMethod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
    );
    await expect(row.locator("button[title^='Payment method:']")).toHaveAttribute(
      "title",
      pmTitleRe
    );

    await expect(page.getByRole("dialog", { name: /Edit expense/i })).not.toBeVisible();
    expect(page.url().split("#")[0]).toBe(urlBefore.split("#")[0]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForExpensesListShell(page, 90_000);
    await expensesVendorSearch(page).fill(vendorMark);
    const rowAfter = expenseListRow(page, vendorMark);
    await expect(rowAfter).toBeVisible({ timeout: 60_000 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data: dbRows, error: dbErr } = await sb
        .from("expenses")
        .select("payment_method,vendor,vendor_name")
        .or(`vendor_name.eq.${vendorMark},vendor.eq.${vendorMark}`)
        .limit(5);
      expect(dbErr, dbErr ? JSON.stringify(dbErr) : "").toBeNull();
      expect(dbRows?.length, `expected one expense for vendor ${vendorMark}`).toBe(1);
      expect(dbRows![0].payment_method, `expected DB payment_method for ${vendorMark}`).toBe(
        targetMethod
      );
    }

    await expect(rowAfter.locator("button[title^='Payment method:']")).toHaveAttribute(
      "title",
      pmTitleRe,
      { timeout: 15_000 }
    );
  });
});
