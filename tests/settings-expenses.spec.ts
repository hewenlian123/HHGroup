import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function skipIfNoExpenseOptions(page: import("@playwright/test").Page): Promise<boolean> {
  await page.goto(`${BASE}/settings/expenses`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
  const noCfg = await page
    .getByText(/Supabase is not configured/i)
    .isVisible()
    .catch(() => false);
  if (noCfg) return true;
  await page.getByTestId("settings-expenses-tab-payment_method").click();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({ timeout: 60_000 });
  await page
    .locator("tbody")
    .getByText("Loading…")
    .waitFor({ state: "detached", timeout: 120_000 })
    .catch(() => undefined);
  const migrationRequired = await page
    .getByTestId("settings-expenses-migration-required")
    .isVisible()
    .catch(() => false);
  return migrationRequired;
}

function rowByOptionName(page: import("@playwright/test").Page, label: string) {
  return page
    .locator(`tr[data-testid^="settings-expenses-row-"]`)
    .filter({ hasText: label })
    .first();
}

async function addOption(page: import("@playwright/test").Page, name: string) {
  await page.getByTestId("settings-expenses-add-name").fill(name);
  await page.getByTestId("settings-expenses-add-submit").click();
  await expect(rowByOptionName(page, name)).toBeVisible({ timeout: 30_000 });
}

test.describe("Settings → Expenses", () => {
  test.describe.configure({ timeout: 180_000, mode: "serial" });

  test("add, rename, archive, and set default payment method", async ({ page }) => {
    test.skip(
      await skipIfNoExpenseOptions(page),
      "expense_options migration missing or Supabase not configured."
    );

    await page.getByTestId("settings-expenses-tab-payment_method").click();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({ timeout: 30_000 });

    const suffix = `E2E-${Date.now()}`;
    const name = `ZZ-${suffix}`;
    await addOption(page, name);

    const row1 = rowByOptionName(page, name);
    const id1 = (await row1.getAttribute("data-testid"))!.replace("settings-expenses-row-", "");

    await page.getByTestId(`settings-expenses-rename-${id1}`).click();
    const renamed = `${name}-R`;
    await page.getByTestId("settings-expenses-rename-input").fill(renamed);
    await page.getByTestId("settings-expenses-rename-save").click();

    const row2 = rowByOptionName(page, renamed);
    await expect(row2).toBeVisible({ timeout: 30_000 });
    const id2 = (await row2.getAttribute("data-testid"))!.replace("settings-expenses-row-", "");

    await page.getByTestId(`settings-expenses-default-${id2}`).click();
    await expect(row2.locator("td").nth(2)).toContainText("Yes");

    await page.getByTestId(`settings-expenses-archive-${id2}`).click();
    await expect(row2.locator("td").nth(1)).toContainText("Archived");
    await expect(row2.locator("td").nth(2)).not.toContainText("Yes");
  });

  test("prevents duplicate payment method names when renaming", async ({ page }) => {
    test.skip(
      await skipIfNoExpenseOptions(page),
      "expense_options migration missing or Supabase not configured."
    );

    await page.getByTestId("settings-expenses-tab-payment_method").click();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({ timeout: 30_000 });

    const suffix = `E2E-DUP-${Date.now()}`;
    const first = `ZZ-${suffix}-A`;
    const second = `ZZ-${suffix}-B`;
    await addOption(page, first);
    await addOption(page, second);

    const firstRow = rowByOptionName(page, first);
    const firstId = (await firstRow.getAttribute("data-testid"))!.replace(
      "settings-expenses-row-",
      ""
    );

    await page.getByTestId(`settings-expenses-rename-${firstId}`).click();
    await page.getByTestId("settings-expenses-rename-input").fill(second);
    await page.getByTestId("settings-expenses-rename-save").click();

    await expect(page.getByText("Rename failed", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(rowByOptionName(page, first)).toBeVisible({ timeout: 15_000 });
    await expect(rowByOptionName(page, second)).toBeVisible({ timeout: 15_000 });
  });
});
