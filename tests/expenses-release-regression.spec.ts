import { expect, test } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";

test("keyboard inspection transfers focus and Escape closes the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/financial/expenses");
  await page.waitForLoadState("networkidle");
  const row = page.locator("[data-expense-keyboard-row]").filter({ visible: true }).first();
  await row.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("[data-expense-detail-panel]");
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  await expect(
    panel.getByRole("button", { name: /Upload receipt|Open receipt preview/ })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("empty receipt results use one actionable workspace", async ({ page }) => {
  await loginAsE2EOwner(page, "/financial/inbox");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("textbox", { name: "Search expenses" })
    .filter({ visible: true })
    .fill("no-matching-receipt-release-regression");
  const state = page.getByRole("region", { name: "Receipt Inbox status" });
  await expect(state.getByText("No receipts match these filters", { exact: true })).toBeVisible();
  await expect(state.getByRole("button", { name: "Clear filters", exact: true })).toBeVisible();
  await expect(page.getByText("Select a receipt to review", { exact: true })).toHaveCount(0);
  await state.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search expenses" }).filter({ visible: true })
  ).toHaveValue("");
});

test("filters, groups and continuous drawer inspection retain context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/financial/expenses");
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("searchbox", { name: "Search expenses" });
  await search.fill("[E2E]");
  for (const [label, option] of [
    ["Filter by project", "[E2E] Seed — HH Unified"],
    ["Filter by category", "Other"],
    ["Filter by status", "Done"],
    ["Filter by date", "All time"],
  ]) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await expect(page.getByRole("combobox", { name: label, exact: true })).toContainText(option);
  }
  await page.getByRole("button", { name: /^More filters/ }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByRole("toolbar").getByRole("combobox", { name: "Filter by project", exact: true })
  ).toContainText("All projects");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-expense-component-surface="filters"]:visible')).toHaveCount(0);
  await expect(search).toHaveValue("[E2E]");
  await page.getByRole("combobox", { name: "Expense groups per page" }).click();
  await page.getByRole("option", { name: "50", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Expense groups per page" })).toContainText("50");
  const row = page.locator("[data-expense-keyboard-row]").filter({ visible: true }).first();
  await row.click();
  const panel = page.locator("[data-expense-detail-panel]");
  await expect(panel).toBeVisible();
  const mountedPanel = await panel.elementHandle();
  const firstUrl = page.url();
  await panel.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).not.toHaveURL(firstUrl);
  expect(await mountedPanel!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(search).toHaveValue("[E2E]");
  await panel.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page).toHaveURL(firstUrl);
});

test("unsaved drawer edits remain protected without changing the expense", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/financial/expenses");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-expense-keyboard-row]").filter({ visible: true }).first().click();
  const panel = page.locator("[data-expense-detail-panel]");
  await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
  const vendor = panel.getByTestId("edit-expense-vendor-input");
  const original = await vendor.inputValue();
  await vendor.fill(`${original} unsaved QA`);
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(vendor).toHaveValue(`${original} unsaved QA`);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toBeHidden();
});
