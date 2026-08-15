/**
 * Legacy receipt-queue route — smoke only.
 * Attachment preview layout for inbox drafts is exercised via `tests/inbox-draft-upload.spec.ts`.
 */
import { expect, test } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";

test.describe("Legacy receipt queue compatibility", () => {
  test("deep link redirects to canonical Receipt Inbox", async ({ page }) => {
    await loginAsE2EOwner(page, "/financial/inbox");
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await expect(page).toHaveURL(/\/financial\/inbox(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Expense Operations" })).toBeVisible();
  });
});
