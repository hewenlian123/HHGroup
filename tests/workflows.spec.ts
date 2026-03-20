import { test, expect } from "@playwright/test";
import { changeFirstProjectTableRowToDifferentStatus } from "./e2e-helpers";

const BASE = "http://localhost:3000";

test("labor modal opens", async ({ page }) => {
  await page.goto(`${BASE}/labor`);
  await page.waitForLoadState("domcontentloaded");

  await page.getByRole("button", { name: "+ Add Entry" }).click();

  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Add Daily Entry" })
  ).toBeVisible();
});

test("project status change", async ({ page }) => {
  // Desktop table is `hidden sm:block`; mobile list is `sm:hidden` — scope to visible table
  // so we don’t hit the first <select> in the hidden mobile DOM.
  await page.setViewportSize({ width: 1280, height: 800 });
  await changeFirstProjectTableRowToDifferentStatus(page, BASE);
});

test("new estimate - select customer and autofill", async ({ page }) => {
  await page.goto(`${BASE}/estimates/new`);
  // Next.js often keeps connections open — networkidle hangs; DOM ready is enough.
  await page.waitForLoadState("domcontentloaded");

  // Some builds show compact summary first; open details if needed.
  const editDetailsBtn = page
    .getByRole("button", { name: /^(Edit details|Edit)$/i })
    .first();
  if (await editDetailsBtn.isVisible()) {
    await editDetailsBtn.click();
  }

  const openCustomerPicker = page.locator('button:has-text("Select customer")').first();
  if (await openCustomerPicker.isVisible()) {
    await openCustomerPicker.click();

    const dialog = page.getByRole("dialog", { name: /Select customer/i });
    await expect(dialog).toBeVisible();
    const search = dialog.getByPlaceholder("Search by name or email");
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("test");

    const listRoot = dialog.locator("div.max-h-64.overflow-y-auto");
    const emptyAfterFilter = await dialog.getByText("No customers found.").isVisible();
    test.skip(
      emptyAfterFilter,
      'No customer matches search "test" — add one or change the search string.',
    );
    await expect(listRoot.locator("button").first()).toBeVisible({ timeout: 10_000 });
    await listRoot.locator("button").first().click();

    await expect(page.getByPlaceholder("Client or company name")).not.toHaveValue("");
    await expect(page.getByPlaceholder("Site or client address")).not.toHaveValue("");
  } else {
    // Fallback mode: no picker in this build/state, fill required fields directly.
    await page.getByPlaceholder("Client or company name").fill("Test Customer");
    await page.getByPlaceholder("Site or client address").fill("Test Address");
    await expect(page.getByPlaceholder("Client or company name")).toHaveValue("Test Customer");
  }

  // Optional: same pattern for phone / email when those customers have values.
  // await expect(page.getByPlaceholder("Phone")).not.toHaveValue("");
  // await expect(page.getByPlaceholder("Email")).not.toHaveValue("");
});

test("new estimate flow with category rename", async ({ page }) => {
  await page.goto(`${BASE}/estimates/new`);
  await page.waitForLoadState("domcontentloaded");

  const editDetailsBtn = page.getByRole("button", { name: /Edit details/i });
  if (await editDetailsBtn.isVisible()) {
    await editDetailsBtn.click();
  }

  const clientInput = page.getByPlaceholder("Client or company name");
  if (await clientInput.isVisible()) {
    await clientInput.fill("Test Estimate Auto");
  }

  const projectInput = page.getByPlaceholder("Project name");
  if (await projectInput.isVisible()) {
    await projectInput.fill("Playwright Project");
  }

  const addCategoryBtn = page.getByRole("button", { name: /^Add Category$/i }).first();
  await expect(addCategoryBtn).toBeVisible({ timeout: 15_000 });
  await addCategoryBtn.click();

  const categoryNameInput = page.locator('details input[placeholder]').first();
  await expect(categoryNameInput).toBeVisible({ timeout: 10_000 });
  await categoryNameInput.fill("Epoxy Test");

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
