/**
 * Legacy receipt-queue route — smoke only.
 * Attachment preview layout for inbox drafts is exercised via `tests/inbox-draft-upload.spec.ts`.
 */
import { expect, test } from "@playwright/test";

test.describe("Legacy receipt queue (smoke)", () => {
  test("page loads", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /receipt queue/i })).toBeVisible({
      timeout: 30_000,
    });
  });
});
