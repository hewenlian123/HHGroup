import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  clickVisibleQuickExpenseButton,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

async function openNewExpense(page: Page): Promise<Locator> {
  await loginAsE2EOwner(page, "/financial/expenses");
  await waitForExpensesQuerySuccess(page);
  await clickVisibleQuickExpenseButton(page);
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function wheelScrollableElement(page: Page, element: Locator, deltaY = 260) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(box!.height / 2, 120));
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(150);
}

async function touchScrollElement(page: Page, element: Locator) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  const session = await page.context().newCDPSession(page);
  await session.send("Input.synthesizeScrollGesture", {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + Math.min(box!.height - 12, box!.height * 0.7)),
    yDistance: -260,
    speed: 800,
    gestureSourceType: "touch",
  });
  await page.waitForTimeout(150);
  await session.detach();
}

test.describe("New Expense disabled action and native scrolling", () => {
  test.describe.configure({ timeout: 180_000 });

  test("empty Amount visually recedes Save without changing canonical click validation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openNewExpense(page);
    const save = dialog
      .locator('[data-new-expense-footer="true"] .expense-new-desktop-actions')
      .getByRole("button", { name: "Save", exact: true });

    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute("data-new-expense-save-readiness", "incomplete");
    await expect(save).not.toHaveCSS("background-color", "rgb(23, 23, 23)");
    await expect(save).not.toHaveCSS("color", "rgb(255, 255, 255)");
    await save.click();
    await expect(dialog.getByText("Amount must be greater than 0.", { exact: true })).toBeVisible();

    await dialog.locator("[data-new-expense-amount]").fill("24.50");
    await expect(save).toHaveAttribute("data-new-expense-save-readiness", "ready");
    await expect(save).toHaveCSS("background-color", "rgb(23, 23, 23)");
    await expect(save).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(save).toHaveCSS("background-color", "rgb(242, 242, 239)");
    await expect(save).toHaveCSS("color", "rgb(22, 22, 22)");
    await dialog.locator("[data-new-expense-amount]").fill("");
    await expect(save).toHaveAttribute("data-new-expense-save-readiness", "incomplete");
    await expect(save).not.toHaveCSS("background-color", "rgb(242, 242, 239)");
  });

  test("disabled Save is visually subdued in Light and Dark without changing its width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openNewExpense(page);
    const save = dialog
      .locator('[data-new-expense-footer="true"] .expense-new-desktop-actions')
      .getByRole("button", { name: "Save", exact: true });
    const enabledWidth = await save.evaluate((element) => element.getBoundingClientRect().width);

    await save.evaluate((element) => {
      element.setAttribute("disabled", "");
    });
    await expect(save).toBeDisabled();
    await expect(save).toHaveCSS("cursor", "not-allowed");
    await expect(save).toHaveCSS("opacity", "1");
    expect(await save.evaluate((element) => element.getBoundingClientRect().width)).toBe(
      enabledWidth
    );

    const light = await save.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(light.background).not.toBe("rgb(23, 23, 23)");
    expect(light.color).not.toBe("rgb(255, 255, 255)");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const dark = await save.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(dark.background).not.toBe("rgb(242, 242, 239)");
    expect(dark.color).not.toBe("rgb(22, 22, 22)");
  });

  test("wheel scrolls a portalled Project list and the New Expense body", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const dialog = await openNewExpense(page);

    await dialog.locator("#quick-expense-project-select").click();
    const projectSurface = page.locator(".expense-new-component-surface:visible").last();
    const projectList = projectSurface.locator('[data-expense-component-scroll="true"]');
    await expect(projectList).toBeVisible();
    expect(
      await projectList.evaluate((element) => element.scrollHeight > element.clientHeight)
    ).toBe(true);
    await projectList.evaluate((element) => {
      element.scrollTop = 0;
    });
    await wheelScrollableElement(page, projectList);
    expect(await projectList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(dialog.locator("#quick-expense-project-select")).toBeFocused();

    const categoryTrigger = dialog.locator("#quick-expense-category-select");
    await categoryTrigger.click();
    const categorySurface = page.locator(".expense-new-component-surface:visible").last();
    const categoryList = categorySurface.locator('[data-expense-component-scroll="true"]');
    await expect(categoryList).toBeVisible();
    expect(
      await categoryList.evaluate((element) => element.scrollHeight > element.clientHeight)
    ).toBe(true);
    await wheelScrollableElement(page, categoryList);
    expect(await categoryList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");

    await categoryTrigger.focus();
    await page.keyboard.press("Enter");
    const search = page
      .locator(".expense-new-component-surface:visible")
      .last()
      .getByRole("searchbox", { name: "Search options" });
    await expect(search).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(categoryTrigger).toBeFocused();

    await dialog.getByRole("button", { name: /More Details/i }).click();
    const body = dialog.locator(".expense-new-dialog-scroll");
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true
    );
    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await wheelScrollableElement(page, body);
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await dialog.locator("#quick-expense-project-select").click();
    const darkProjectList = page
      .locator(".expense-new-component-surface:visible")
      .last()
      .locator('[data-expense-component-scroll="true"]');
    await darkProjectList.evaluate((element) => {
      element.scrollTop = 0;
    });
    await wheelScrollableElement(page, darkProjectList);
    expect(await darkProjectList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  test("mobile touch scroll stays inside the dropdown or task sheet", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      const dialog = await openNewExpense(page);
      const mobileSave = dialog
        .locator('[data-new-expense-footer="true"] .expense-new-mobile-actions')
        .getByRole("button", { name: "Save", exact: true });
      await expect(mobileSave).toHaveAttribute("data-new-expense-save-readiness", "incomplete");
      await expect(mobileSave).not.toHaveCSS("background-color", "rgb(23, 23, 23)");
      const projectTrigger = dialog.locator("#quick-expense-project-select");
      await projectTrigger.tap();
      const projectList = page
        .locator(".expense-new-component-surface:visible")
        .last()
        .locator('[data-expense-component-scroll="true"]');
      await projectList.evaluate((element) => {
        element.scrollTop = 0;
      });
      await touchScrollElement(page, projectList);
      expect(await projectList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: /More Details/i }).tap();
      const body = dialog.locator(".expense-new-dialog-scroll");
      await body.evaluate((element) => {
        element.scrollTop = 0;
      });
      await touchScrollElement(page, body);
      expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(dialog.locator('[data-new-expense-footer="true"]')).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await context.close();
    }
  });
});
