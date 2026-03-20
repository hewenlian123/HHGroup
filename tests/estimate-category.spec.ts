import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://hhprojectgroup.com";

test("new estimate flow with category rename", async ({ page }) => {
  await page.goto(`${BASE}/estimates/new`);
  await page.waitForLoadState("domcontentloaded");

  const client = page.getByPlaceholder("Client or company name");
  await expect(client).toBeVisible({ timeout: 15_000 });
  await client.fill("Test Estimate Auto");

  const project = page.getByPlaceholder("Project name");
  await expect(project).toBeVisible();
  await project.fill("Playwright Project");

  // Add first category in the new-estimate builder.
  const addCategoryBtn = page.getByRole("button", { name: /^Add Category$/i }).first();
  await expect(addCategoryBtn).toBeVisible({ timeout: 15_000 });
  await addCategoryBtn.click();

  // Rename the added category display name.
  const categoryNameInput = page.locator('details input[placeholder]').first();
  await expect(categoryNameInput).toBeVisible({ timeout: 10_000 });
  await categoryNameInput.fill("Epoxy Test");

  // Fill first unit price.
  const unitPriceInput = page.locator('input[type="number"]').nth(1);
  if (await unitPriceInput.isVisible()) {
    await unitPriceInput.fill("1000");
  }

  const saveEstimateBtn = page.getByRole("button", { name: /Save Estimate/i });
  await expect(saveEstimateBtn).toBeVisible({ timeout: 10_000 });
  await saveEstimateBtn.click();

  await expect(page.locator("body")).not.toContainText(/error|undefined/i);
  await page.waitForURL(/\/estimates\/[^/]+\??.*$/, { timeout: 20_000 });
});

