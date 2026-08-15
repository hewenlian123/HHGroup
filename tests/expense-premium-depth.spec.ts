import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { waitForExpensesQuerySuccess } from "./e2e-expenses-helpers";

function collectFailures(page: Page) {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  return { consoleErrors, failedResponses };
}

async function loadExpenses(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await loginAsE2EOwner(page, "/financial/expenses");
  await waitForExpensesQuerySuccess(page);
  const root = page.locator('[data-expenses-list-page="expenses"]');
  await expect(root).toHaveAttribute("data-expense-depth-system", "l0-l5");
  return root;
}

async function openFilters(page: Page, root: Locator) {
  await root
    .getByRole("button", { name: /Filters/ })
    .filter({ visible: true })
    .first()
    .click();
  const surface = page.locator('[data-expense-component-surface="filters"]:visible').last();
  await expect(surface).toBeVisible();
  return surface;
}

async function closeSurface(page: Page, surface: Locator) {
  const close = surface.getByRole("button", { name: "Close" }).filter({ visible: true });
  if ((await close.count()) > 0) await close.first().click();
  else await page.keyboard.press("Escape");
  await expect(surface).toBeHidden();
}

test.describe("Expense Operations premium depth system", () => {
  test.describe.configure({ timeout: 180_000 });

  test("Light and Dark layers distinguish canvas, operations, focus, floating, and task depth", async ({
    page,
  }, testInfo) => {
    const failures = collectFailures(page);
    const root = await loadExpenses(page, 1440, 900);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    await expect(root).toHaveCSS("background-color", "rgb(247, 247, 246)");
    const lightTokens = await root.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        strong: style.getPropertyValue("--eo-text-strong").trim(),
        secondary: style.getPropertyValue("--eo-text-secondary").trim(),
        tertiary: style.getPropertyValue("--eo-text-tertiary").trim(),
      };
    });
    expect(lightTokens).toEqual({
      strong: "#090909",
      secondary: "#4d4d4b",
      tertiary: "#686866",
    });
    const kpi = root.locator("[data-expenses-kpi-strip]");
    const ledger = root.locator(".expense-operations-ledger-panel");
    await expect(kpi).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(kpi).not.toHaveCSS("box-shadow", "none");
    await expect(kpi.locator("dt").first()).toHaveCSS("opacity", "0.86");
    await expect(kpi.locator("dd").first()).toHaveCSS("font-weight", "650");
    await expect(ledger).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(ledger).not.toHaveCSS("box-shadow", "none");

    const tableHeader = root.locator(".expense-compact-table-scroll thead");
    await expect(tableHeader).toHaveCSS("background-color", "rgb(250, 250, 250)");

    const activeWorkspaceTab = root.locator(
      '[data-expense-operations-shell] a[aria-current="page"]'
    );
    const inactiveWorkspaceTab = root
      .locator('[data-expense-operations-shell] a:not([aria-current="page"])')
      .first();
    await expect(activeWorkspaceTab).toHaveCSS("background-color", "rgb(236, 236, 234)");
    await inactiveWorkspaceTab.hover();
    await expect(inactiveWorkspaceTab).toHaveCSS("background-color", "rgb(244, 244, 242)");

    const row = root.locator("[data-expense-id]:visible").first();
    await expect(row).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await row.hover();
    await expect(row).toHaveCSS("background-color", "rgb(244, 244, 242)");
    await row.click();
    await expect(row).toHaveCSS("background-color", "rgb(236, 236, 234)");
    const selectedShadow = await row.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(selectedShadow).toContain("inset");
    expect(selectedShadow).toContain("2px 0px");

    const detail = page.locator("[data-expense-detail-panel]");
    await expect(detail).toBeVisible();
    await expect(detail).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(detail).not.toHaveCSS("box-shadow", "none");
    await expect(detail.locator("[data-expense-detail-body]")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
    const evidence = detail.locator("[data-expense-receipt-evidence]");
    await expect(evidence).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(evidence).not.toHaveCSS("box-shadow", "none");

    const filterSurface = await openFilters(page, root);
    await expect(filterSurface).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const floatingShadow = await filterSurface.evaluate(
      (element) => getComputedStyle(element).boxShadow
    );
    expect(floatingShadow).not.toBe("none");
    expect(floatingShadow).not.toContain("64px");
    await closeSurface(page, filterSurface);

    await root
      .getByRole("button", { name: "New Expense", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const task = page.getByTestId("quick-expense-dialog");
    await expect(task).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const taskOverlay = page.locator('body > [data-state="open"].fixed.inset-0.z-50').first();
    await expect(taskOverlay).toBeVisible();
    await expect(taskOverlay).toHaveCSS("backdrop-filter", "none");
    const taskVisual = await task.evaluate((element) => {
      const style = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(style.transform);
      return { shadow: style.boxShadow, scaleX: matrix.a, scaleY: matrix.d };
    });
    expect(taskVisual.shadow).not.toBe("none");
    expect(taskVisual.scaleX).toBeCloseTo(1, 4);
    expect(taskVisual.scaleY).toBeCloseTo(1, 4);
    await expect(task).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("expense-task-light.png"), fullPage: true });
    await task.getByRole("button", { name: "Close" }).click();

    await page.screenshot({ path: testInfo.outputPath("expense-depth-light.png"), fullPage: true });

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(root).toHaveCSS("background-color", "rgb(10, 10, 10)");
    await expect(kpi).toHaveCSS("background-color", "rgb(24, 24, 24)");
    await expect(ledger).toHaveCSS("background-color", "rgb(24, 24, 24)");
    await expect(row).toHaveCSS("background-color", "rgb(44, 44, 44)");
    await expect(detail).toHaveCSS("background-color", "rgb(24, 24, 24)");

    const darkFilter = await openFilters(page, root);
    await expect(darkFilter).toHaveCSS("background-color", "rgb(37, 37, 37)");
    await closeSurface(page, darkFilter);

    await root
      .getByRole("button", { name: "New Expense", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const darkTask = page.getByTestId("quick-expense-dialog");
    await expect(darkTask).toHaveCSS("background-color", "rgb(41, 41, 41)");
    await expect(darkTask).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath("expense-task-dark.png"), fullPage: true });
    await darkTask.getByRole("button", { name: "Close" }).click();
    await page.screenshot({ path: testInfo.outputPath("expense-depth-dark.png"), fullPage: true });

    expect(failures).toEqual({ consoleErrors: [], failedResponses: [] });
  });

  test("Issue preview uses the shared floating layer without sticky interaction state", async ({
    page,
  }) => {
    const failures = collectFailures(page);
    const root = await loadExpenses(page, 1440, 900);
    const indicator = root.locator('[data-expense-issue-indicator="count"]:visible').first();
    const preview = page.getByTestId("expense-inbox-issue-popover");

    await indicator.hover();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(preview).not.toHaveCSS("box-shadow", "none");

    await root.locator("[data-expenses-kpi-strip]").hover({ position: { x: 8, y: 8 } });
    await expect(preview).toBeHidden({ timeout: 800 });

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await indicator.hover();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS("background-color", "rgb(37, 37, 37)");
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
    expect(failures).toEqual({ consoleErrors: [], failedResponses: [] });
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}x${viewport.height} preserves depth without overflow or scroll regression`, async ({
      page,
    }) => {
      const failures = collectFailures(page);
      const root = await loadExpenses(page, viewport.width, viewport.height);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      );
      expect(overflow).toBe(false);

      const filterSurface = await openFilters(page, root);
      await expect(filterSurface).toHaveCSS("background-color", "rgb(255, 255, 255)");
      const reducedOrStandardDuration = Number.parseFloat(
        await filterSurface.evaluate((element) => getComputedStyle(element).animationDuration)
      );
      expect(reducedOrStandardDuration).toBeLessThanOrEqual(0.18);
      await closeSurface(page, filterSurface);

      const row = root.locator("[data-expense-id]:visible").first();
      await row.click();
      const detail = page.locator("[data-expense-detail-panel]");
      await expect(detail).toBeVisible();
      if (viewport.width <= 1023) {
        await expect(detail).toHaveCSS("position", "fixed");
        const back = detail.getByRole("button", { name: "Back to expense queue" });
        expect(
          await back.evaluate((element) => element.getBoundingClientRect().height)
        ).toBeGreaterThanOrEqual(44);
        await back.click();
      } else {
        await detail.getByRole("button", { name: "Close expense detail" }).click();
      }
      await expect(detail).toBeHidden();
      expect(failures).toEqual({ consoleErrors: [], failedResponses: [] });
    });
  }

  test("reduced motion keeps floating and task surfaces stable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const root = await loadExpenses(page, 390, 844);
    const filterSurface = await openFilters(page, root);
    expect(
      Number.parseFloat(
        await filterSurface.evaluate((element) => getComputedStyle(element).animationDuration)
      )
    ).toBeLessThanOrEqual(0.001);
    await closeSurface(page, filterSurface);

    await root
      .getByRole("button", { name: "New Expense", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    const task = page.getByTestId("quick-expense-dialog");
    expect(
      Number.parseFloat(
        await task.evaluate((element) => getComputedStyle(element).animationDuration)
      )
    ).toBeLessThanOrEqual(0.001);
    const taskTransform = await task.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { scaleX: matrix.a, scaleY: matrix.d };
    });
    expect(taskTransform.scaleX).toBeCloseTo(1, 4);
    expect(taskTransform.scaleY).toBeCloseTo(1, 4);
  });
});
