/**
 * Legacy `/financial/receipt-queue` surface — smoke only.
 * New receipt intake is covered by `tests/inbox-draft-upload.spec.ts` (Inbox draft flow).
 */
import { test, expect } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";

test.describe("Legacy receipt queue compatibility", () => {
  test("redirects to canonical Receipt Inbox without mounting the legacy table", async ({
    page,
  }) => {
    const forbidden: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 403) forbidden.push(response.url());
    });

    await loginAsE2EOwner(page, "/financial/inbox");
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
    await expect(page).toHaveURL(/\/financial\/inbox(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Expense Operations" })).toBeVisible();
    expect(forbidden).toEqual([]);
  });
});
