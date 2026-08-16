import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const WORKSPACES = [
  {
    name: "Expenses",
    route: "/financial/expenses",
    selector: '[data-expenses-list-page="expenses"]',
  },
  {
    name: "Receipt Inbox",
    route: "/financial/inbox",
    selector: '[data-expenses-list-page="inbox"]',
  },
  {
    name: "Worker Receipts",
    route: "/labor/receipts",
    selector: "[data-worker-receipts-workspace]",
  },
  {
    name: "Reimbursements",
    route: "/labor/reimbursements",
    selector: "[data-reimbursements-workspace]",
  },
] as const;

async function expectWorkspaceCoversVisibleCanvas(page: Page, selector: string) {
  const root = page.locator(selector);
  await expect(root).toBeVisible();

  const metrics = await root.evaluate((element) => {
    const main = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    if (!main) throw new Error("App scroll root is missing.");
    const rootRect = element.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      mainBottom: mainRect.bottom,
      mainClientHeight: main.clientHeight,
      mainHeight: mainRect.height,
      mainScrollHeight: main.scrollHeight,
      rootBackground: getComputedStyle(element).backgroundColor,
      rootBottom: rootRect.bottom,
      rootHeight: rootRect.height,
      rootMinHeight: getComputedStyle(element).minHeight,
    };
  });

  expect(metrics.rootBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(metrics.rootHeight).toBeGreaterThanOrEqual(metrics.mainHeight - 1);
  expect(metrics.rootBottom).toBeGreaterThanOrEqual(metrics.mainBottom - 1);
  return metrics;
}

test.describe("Expense Operations workspace viewport surfaces", () => {
  test.describe.configure({ timeout: 120_000 });

  test("Light L0 workspace covers short and long desktop viewports on every route", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, WORKSPACES[0].route);

    let sawScrollableWorkspace = false;
    for (const viewport of [
      { width: 1440, height: 1200 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      for (const workspace of WORKSPACES) {
        await page.goto(workspace.route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.documentElement.classList.remove("dark"));
        const metrics = await expectWorkspaceCoversVisibleCanvas(page, workspace.selector);
        expect(metrics.rootBackground).toBe("rgb(247, 247, 246)");
        sawScrollableWorkspace ||= metrics.mainScrollHeight > metrics.mainClientHeight + 1;
      }
    }

    expect(sawScrollableWorkspace).toBe(true);
  });

  test("Light and Dark L0 surfaces remain continuous on iPad and mobile", async ({ page }) => {
    await loginAsE2EOwner(page, WORKSPACES[0].route);

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const workspace of WORKSPACES) {
        await page.goto(workspace.route, { waitUntil: "domcontentloaded" });

        await page.evaluate(() => document.documentElement.classList.remove("dark"));
        const light = await expectWorkspaceCoversVisibleCanvas(page, workspace.selector);
        expect(light.rootBackground).toBe("rgb(247, 247, 246)");

        await page.evaluate(() => document.documentElement.classList.add("dark"));
        const dark = await expectWorkspaceCoversVisibleCanvas(page, workspace.selector);
        expect(dark.rootBackground).toBe("rgb(10, 10, 10)");

        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(1);
      }
    }
  });
});
