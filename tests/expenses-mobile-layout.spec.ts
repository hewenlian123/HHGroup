import { test, expect } from "@playwright/test";
import { clickVisibleQuickExpenseButton } from "./e2e-expenses-helpers";

/**
 * Mobile / responsive layout smoke for Expenses + Quick Expense (UI-only).
 * Does not assert business logic or DB.
 */
test.describe("Expenses mobile layout", () => {
  test.describe.configure({ timeout: 120_000 });

  async function assertNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
    const ok = await page.evaluate(() => {
      const tol = 2;
      const check = (el: Element | null) => !el || el.scrollWidth <= el.clientWidth + tol;
      const root = document.documentElement;
      const main = document.querySelector("main");
      const exp = document.querySelector(".expenses-ui");
      return root.scrollWidth <= root.clientWidth + tol && check(main) && check(exp);
    });
    expect(ok, "document or .expenses-ui wider than viewport").toBe(true);
  }

  for (const [name, size] of [
    ["iPhone 14", { width: 390, height: 844 }],
    ["iPhone SE", { width: 375, height: 667 }],
    ["iPad", { width: 768, height: 1024 }],
  ] as const) {
    test(`${name} (${size.width}x${size.height}): expenses list no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await assertNoHorizontalOverflow(page);
    });

    test(`${name}: Quick expense sheet scrolls and primary actions visible`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/financial/expenses", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });

      await clickVisibleQuickExpenseButton(page);
      const dialog = page.getByRole("dialog", { name: /Quick expense/i });
      await expect(dialog).toBeVisible({ timeout: 15_000 });

      await expect(
        dialog.getByRole("button", { name: /Take photo or upload receipt/i })
      ).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();

      const scrollable = dialog.locator("[class*='overflow-y-auto']").first();
      await expect(scrollable).toBeVisible();
      const metrics = await scrollable.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          overflowY: cs.overflowY,
        };
      });
      expect(metrics.overflowY).toMatch(/auto|scroll/);
      /** Phone-sized sheets are height-constrained; tablet/desktop modal often fits without scrolling. */
      if (size.width < 768) {
        expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
      }

      await assertNoHorizontalOverflow(page);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });
  }
});
