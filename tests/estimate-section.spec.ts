import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("new estimate flow with section rename", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${BASE}/estimates/new`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText(/^Loading/i))
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);

  const moreDetailsBtn = page.getByRole("button", { name: /^More details$/i }).first();
  if (await moreDetailsBtn.isVisible().catch(() => false)) {
    await moreDetailsBtn.click();
  }

  const client = page.getByPlaceholder("Client or company name");
  await expect(client).toBeVisible({ timeout: 15_000 });
  await client.fill("Test Estimate Auto");

  const project = page.getByPlaceholder("Project name");
  await expect(project).toBeVisible();
  await project.fill("Playwright Project");

  const addSectionBtn = page.getByRole("button", { name: /^Add Section$/i }).first();
  await expect(addSectionBtn).toBeVisible({ timeout: 15_000 });
  await addSectionBtn.click();

  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 10_000 });
  await lineTitleInput.fill("Epoxy line");

  const sectionNameInput = page
    .locator("details")
    .filter({ has: lineTitleInput })
    .locator("summary input")
    .first();
  await expect(sectionNameInput).toBeVisible({ timeout: 10_000 });
  await sectionNameInput.fill("Epoxy Test");

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
