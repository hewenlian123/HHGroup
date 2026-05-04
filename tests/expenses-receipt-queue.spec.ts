/**
 * Legacy `/financial/receipt-queue` surface — smoke only.
 * New receipt intake is covered by `tests/inbox-draft-upload.spec.ts` (Inbox draft flow).
 */
import { test, expect } from "@playwright/test";

test.describe("Legacy receipt queue page", () => {
  test("loads without error (internal table only)", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /receipt queue/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
