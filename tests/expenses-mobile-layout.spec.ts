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
    ["Desktop Chrome", { width: 1280, height: 900 }],
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
        dialog.locator(
          '[draggable="true"], [data-drag-handle], [data-draggable="true"], [class*="cursor-grab"], [class*="cursor-move"]'
        )
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: /Take photo or upload receipt/i })
      ).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Save & new", exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();

      const beforeDrag = await dialog.boundingBox();
      expect(beforeDrag, "Quick Expense dialog should have a stable fixed box").not.toBeNull();
      await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2, beforeDrag!.y + 20);
      await page.mouse.down();
      await page.mouse.move(beforeDrag!.x + beforeDrag!.width / 2, beforeDrag!.y + 160, {
        steps: 8,
      });
      await page.mouse.up();
      const afterDrag = await dialog.boundingBox();
      expect(
        afterDrag,
        "Quick Expense dialog should remain fixed after drag gestures"
      ).not.toBeNull();
      expect(Math.abs(afterDrag!.x - beforeDrag!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterDrag!.y - beforeDrag!.y)).toBeLessThanOrEqual(1);

      if (size.width < 768) {
        expect(afterDrag!.x).toBeGreaterThanOrEqual(-1);
        expect(afterDrag!.x + afterDrag!.width).toBeLessThanOrEqual(size.width + 1);
        expect(afterDrag!.y + afterDrag!.height).toBeLessThanOrEqual(size.height + 1);
        expect(afterDrag!.height).toBeGreaterThan(size.height * 0.75);
      } else {
        expect(Math.abs(afterDrag!.x + afterDrag!.width / 2 - size.width / 2)).toBeLessThanOrEqual(
          3
        );
      }

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
