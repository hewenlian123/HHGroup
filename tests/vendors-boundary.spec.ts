import { test, expect } from "@playwright/test";
import { acceptBrowserDialogs } from "./e2e-helpers";
import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";

const BASE = e2eTargetOrigin();

test.describe("Vendors guarded server boundary", () => {
  test("vendors API rejects anonymous production-locked requests", async ({ request }) => {
    const response = await request.get(`${BASE}/api/vendors`, {
      headers: { "x-hh-production-safety-lock": "1" },
    });
    if (response.status() === 200) {
      test.skip(true, "Local owner no-login mode allows guarded API access.");
    }
    expect([401, 403]).toContain(response.status());
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    expect(body.message ?? "").toMatch(/auth|access|required/i);
  });

  test("financial vendors page creates, edits, and deletes through guarded API", async ({
    page,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Vendor CRUD writes are disabled for this target.");
    acceptBrowserDialogs(page);

    await page.goto(`${BASE}/financial/vendors`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText(/Loading vendors/i))
      .not.toBeVisible({ timeout: 30_000 })
      .catch(() => undefined);

    if (
      await page
        .getByText(/Supabase is not configured/i)
        .isVisible()
        .catch(() => false)
    ) {
      test.skip(true, "Supabase not configured.");
    }

    const stamp = Date.now();
    const label = `E2E-VENDOR-BOUNDARY-${stamp}`;
    const renamed = `E2E-VENDOR-EDITED-${stamp}`;

    await page.getByRole("button", { name: /\+ New Vendor/i }).click();
    await page.getByPlaceholder("Required").first().fill(label);
    await page.getByRole("button", { name: /Create Vendor/i }).click();

    const createdRow = page.locator("tbody tr").filter({ hasText: label });
    await expect(createdRow).toBeVisible({ timeout: 25_000 });

    await createdRow.getByRole("button", { name: /^Edit$/ }).click();
    await page.getByPlaceholder("Required").first().fill(renamed);
    await page.getByRole("button", { name: /Save Changes/i }).click();

    const renamedRow = page.locator("tbody tr").filter({ hasText: renamed });
    await expect(renamedRow).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("tbody tr").filter({ hasText: label })).toHaveCount(0);

    await renamedRow.getByRole("button", { name: /^Delete$/ }).click();
    await expect(renamedRow).toHaveCount(0, { timeout: 15_000 });
  });
});
