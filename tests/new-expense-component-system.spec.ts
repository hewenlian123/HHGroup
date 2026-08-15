import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  clickVisibleQuickExpenseButton,
  waitForExpensesQuerySuccess,
} from "./e2e-expenses-helpers";

function collectPageFailures(page: Page) {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500 && response.url().startsWith("http://127.0.0.1:3002/")) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return { consoleErrors, failedResponses };
}

async function openNewExpense(page: Page): Promise<Locator> {
  await loginAsE2EOwner(page, "/financial/expenses");
  await waitForExpensesQuerySuccess(page);
  await clickVisibleQuickExpenseButton(page);
  const dialog = page.getByRole("dialog", { name: "New Expense", exact: true });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}

async function expectNeutralComponentSurface(surface: Locator, background: string) {
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS("background-color", background);
  await expect(surface).toHaveCSS("border-radius", "10px");
  await expect(surface).toHaveCSS("animation-duration", "0.18s");
  await expect(surface).toHaveCSS("animation-name", "expense-new-surface-in");
}

test.describe("New Expense component system reconciliation", () => {
  test.describe.configure({ timeout: 180_000 });

  test("desktop surface, fields, opened components, scrolling, actions, and themes align", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const failures = collectPageFailures(page);
    const dialog = await openNewExpense(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(dialog).toHaveCSS("border-radius", "14px");
    await expect(dialog).toHaveCSS("animation-name", "expense-new-surface-in");
    await expect(dialog).toHaveCSS("animation-duration", "0.18s");
    const dialogVisual = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(style.transform);
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        scaleX: matrix.a,
        scaleY: matrix.d,
      };
    });
    expect(dialogVisual.borderColor).not.toBe("rgb(245, 158, 11)");
    expect(dialogVisual.boxShadow).not.toBe("none");
    expect(dialogVisual.scaleX).toBeCloseTo(1, 4);
    expect(dialogVisual.scaleY).toBeCloseTo(1, 4);

    const amount = dialog.locator("[data-new-expense-amount]");
    await amount.focus();
    const amountFocus = await amount.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    expect(amountFocus.borderColor).not.toMatch(/245, 158, 11|217, 119, 6|161, 98, 7/);
    expect(amountFocus.boxShadow).not.toBe("none");

    const projectTrigger = dialog.locator("#quick-expense-project-select");
    await projectTrigger.click();
    const projectSurface = page.locator(".expense-new-component-surface:visible").last();
    await expectNeutralComponentSurface(projectSurface, "rgb(255, 255, 255)");
    await expect(projectSurface.getByRole("searchbox", { name: "Search options" })).toBeFocused();
    const firstProjectOption = projectSurface.getByRole("option").first();
    await expect(firstProjectOption).toBeVisible();
    expect(
      await firstProjectOption.evaluate((element) => element.getBoundingClientRect().height)
    ).toBeGreaterThanOrEqual(36);
    await page.keyboard.press("Escape");
    await expect(projectTrigger).toBeFocused();

    await dialog.locator("#quick-expense-category-select").click();
    await expectNeutralComponentSurface(
      page.locator(".expense-new-component-surface:visible").last(),
      "rgb(255, 255, 255)"
    );
    await page.keyboard.press("Escape");

    await dialog.locator("#quick-expense-date").click();
    await expectNeutralComponentSurface(
      page.locator(".expense-new-component-surface:visible").last(),
      "rgb(255, 255, 255)"
    );
    await page.keyboard.press("Escape");

    const moreTrigger = dialog.getByRole("button", { name: /More Details/i });
    await moreTrigger.click();
    const more = dialog.locator("[data-quick-expense-more-content]");
    await expect(more).toBeVisible();
    await expect(more).toHaveCSS("animation-duration", "0.18s");
    await expect(more).toHaveCSS("overflow-y", "visible");
    const formScroll = dialog.locator(".expense-new-dialog-scroll");
    await expect(formScroll).toHaveCSS("overflow-y", "auto");

    const commonItems = dialog.locator("#quick-expense-common-items-select");
    await commonItems.click();
    const itemSurface = page.locator(".expense-new-component-surface:visible").last();
    await expectNeutralComponentSurface(itemSurface, "rgb(255, 255, 255)");
    await page.keyboard.press("Escape");
    await expect(itemSurface).toBeHidden();
    await expect(commonItems).toBeFocused();

    const dropzone = dialog.locator('[data-new-expense-receipt-dropzone="true"]');
    await dropzone.focus();
    await expect(dropzone).toBeFocused();
    await expect(dropzone).toHaveCSS("border-style", "solid");

    const footer = dialog.locator('[data-new-expense-footer="true"]');
    const cancel = footer.getByRole("button", { name: "Cancel", exact: true });
    const saveAndNew = footer.getByRole("button", { name: "Save & New", exact: true });
    const save = footer.getByRole("button", { name: "Save", exact: true });
    for (const action of [saveAndNew, save]) {
      expect(await action.evaluate((element) => element.getBoundingClientRect().width)).toBe(160);
    }
    const cancelStyle = await cancel.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    expect(cancelStyle).toBe("rgba(0, 0, 0, 0)");
    await save.evaluate((element) => element.setAttribute("disabled", ""));
    await expect(save).toHaveCSS("background-color", "rgb(242, 242, 240)");
    await expect(save).toHaveCSS("opacity", "1");
    await save.evaluate((element) => element.removeAttribute("disabled"));

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.body.style.pointerEvents)).not.toBe("none");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await clickVisibleQuickExpenseButton(page);
    const darkDialog = page.getByRole("dialog", { name: "New Expense", exact: true });
    await expect(darkDialog).toHaveCSS("background-color", "rgb(41, 41, 41)");
    await darkDialog.locator("#quick-expense-project-select").click();
    await expectNeutralComponentSurface(
      page.locator(".expense-new-component-surface:visible").last(),
      "rgb(37, 37, 37)"
    );
    await page.keyboard.press("Escape");
    await darkDialog.getByRole("button", { name: "Close" }).click();
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    expect(failures).toEqual({ consoleErrors: [], failedResponses: [] });
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}x${viewport.height} keeps one scroll owner and reachable actions`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const failures = collectPageFailures(page);
      const dialog = await openNewExpense(page);
      await dialog.getByRole("button", { name: /More Details/i }).click();

      const more = dialog.locator("[data-quick-expense-more-content]");
      const formScroll = dialog.locator(".expense-new-dialog-scroll");
      await expect(more).toBeVisible();
      await expect(more).toHaveCSS("overflow-y", "visible");
      await expect(formScroll).toHaveCSS("overflow-y", "auto");

      const overflow = await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="quick-expense-dialog"]');
        const more = document.querySelector("[data-quick-expense-more-content]");
        return {
          page: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          dialog: Boolean(dialog && dialog.scrollWidth > dialog.clientWidth + 2),
          moreOwnsScroll: Boolean(more && getComputedStyle(more).overflowY !== "visible"),
        };
      });
      expect(overflow).toEqual({ page: false, dialog: false, moreOwnsScroll: false });

      const projectTrigger = dialog.locator("#quick-expense-project-select");
      await projectTrigger.click();
      const surface = page.locator(".expense-new-component-surface:visible").last();
      const surfaceBox = await surface.boundingBox();
      expect(surfaceBox).not.toBeNull();
      expect(surfaceBox!.x).toBeGreaterThanOrEqual(0);
      expect(surfaceBox!.x + surfaceBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(surfaceBox!.y + surfaceBox!.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.keyboard.press("Escape");

      const description = dialog.locator("textarea");
      await description.scrollIntoViewIfNeeded();
      await description.focus();
      const footer = dialog.locator('[data-new-expense-footer="true"]');
      await expect(footer).toBeVisible();
      if (viewport.width <= 768) {
        const descriptionBox = await description.boundingBox();
        const footerBox = await footer.boundingBox();
        expect(descriptionBox).not.toBeNull();
        expect(footerBox).not.toBeNull();
        expect(descriptionBox!.y + descriptionBox!.height).toBeLessThanOrEqual(footerBox!.y + 2);
        for (const name of ["Save", "Save & New", "Cancel"]) {
          const action = footer.getByRole("button", { name, exact: true });
          expect(
            await action.evaluate((element) => element.getBoundingClientRect().height)
          ).toBeGreaterThanOrEqual(44);
        }
        expect(
          await dialog
            .getByRole("button", { name: /More Details/i })
            .evaluate((element) => element.getBoundingClientRect().height)
        ).toBeGreaterThanOrEqual(44);
      }

      await dialog.getByRole("button", { name: "Close" }).click();
      expect(failures).toEqual({ consoleErrors: [], failedResponses: [] });
    });
  }
});
