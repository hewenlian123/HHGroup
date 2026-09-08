import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";

const workspaces = [
  {
    name: "expenses",
    route: "/financial/expenses?date_kind=all",
    root: '[data-expenses-list-page="expenses"]',
    heading: "Expenses",
    navigation: "expense",
  },
  {
    name: "receipt-inbox",
    route: "/financial/inbox?date_kind=all",
    root: '[data-expenses-list-page="inbox"]',
    heading: "Receipt Inbox",
    navigation: "expense",
  },
  {
    name: "worker-submitted",
    route: "/financial/inbox/worker",
    root: "[data-worker-receipts-workspace]",
    heading: "Worker Submitted",
    navigation: "expense",
  },
  {
    name: "reimbursements",
    route: "/labor/reimbursements",
    root: "[data-reimbursements-workspace]",
    heading: "Worker Reimbursements",
    navigation: "labor",
  },
] as const;

async function openWorkspace(page: Page, workspace: (typeof workspaces)[number]) {
  await page.goto(workspace.route, { waitUntil: "domcontentloaded" });
  const root = page.locator(workspace.root);
  await expect(root).toBeVisible({ timeout: 60_000 });
  if (workspace.name === "expenses" || workspace.name === "receipt-inbox") {
    await expect(root).toHaveAttribute("data-expenses-query-status", "success", {
      timeout: 60_000,
    });
  }
  if (workspace.name === "reimbursements") {
    await expect(root.getByText("Loading…", { exact: true })).toHaveCount(0, {
      timeout: 60_000,
    });
  }
  return root;
}

async function expectContainedViewport(page: Page) {
  const metrics = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    if (!app) throw new Error("App scroll root is missing.");
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      appOverflow: app.scrollWidth - app.clientWidth,
    };
  });
  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.appOverflow).toBeLessThanOrEqual(1);
}

test.describe("Expense Operations visual cohesion (read-only)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("keeps the four desktop workspaces on one Light typography and surface system", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const workspace of workspaces) {
      const root = await openWorkspace(page, workspace);
      await page.evaluate(() => document.documentElement.removeAttribute("data-hh-theme"));
      await page.waitForTimeout(260);

      const nav =
        workspace.navigation === "expense"
          ? root.getByRole("navigation", { name: "Expense Operations workspace" })
          : root.getByRole("navigation", { name: "Labor navigation" });
      await expect(nav).toBeVisible();
      await expect(
        page.getByRole("heading", { name: workspace.heading, exact: true })
      ).toBeVisible();
      await expect(root).toHaveCSS("color-scheme", "light");
      await expectContainedViewport(page);

      const pageHeading = page.getByRole("heading", { name: workspace.heading, exact: true });
      const typography = await pageHeading.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      });
      expect(typography.fontSize).toBe("24px");
      expect(Number(typography.fontWeight)).toBeGreaterThanOrEqual(600);

      await page.screenshot({
        path: testInfo.outputPath(`${workspace.name}-light-1440.png`),
        fullPage: true,
      });
    }
  });

  test("retains intentional Dark surfaces without horizontal overflow", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const workspace of workspaces) {
      const root = await openWorkspace(page, workspace);
      await page.evaluate(() =>
        document.documentElement.setAttribute("data-hh-theme", "operational-dark")
      );
      await page.waitForTimeout(260);
      await expect(root).toHaveCSS("color-scheme", "dark");
      await expectContainedViewport(page);

      const background = await root.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      expect(background).not.toBe("rgba(0, 0, 0, 0)");

      if (workspace.name === "receipt-inbox" || workspace.name === "reimbursements") {
        await page.screenshot({
          path: testInfo.outputPath(`${workspace.name}-dark-1280.png`),
          fullPage: true,
        });
      }
    }
  });

  test("keeps iPad and mobile hierarchy contained with touch-sized primary navigation", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const workspace of workspaces) {
        const root = await openWorkspace(page, workspace);
        await page.evaluate(() => document.documentElement.removeAttribute("data-hh-theme"));
        await page.waitForTimeout(260);
        await expectContainedViewport(page);

        if (workspace.navigation === "expense") {
          const navLinks = root
            .getByRole("navigation", {
              name: "Expense Operations workspace",
            })
            .getByRole("link");
          const count = await navLinks.count();
          expect(count).toBe(3);
          if (viewport.width < 768) {
            for (let index = 0; index < count; index += 1) {
              const box = await navLinks.nth(index).boundingBox();
              expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
            }
          }
        } else if (viewport.width >= 768) {
          await expect(
            root.getByRole("navigation", { name: "Labor navigation" }).getByRole("link")
          ).toHaveCount(2);
        } else {
          const primaryAction = root.getByRole("button", { name: "New reimbursement" });
          await expect(primaryAction).toBeVisible();
          const box = await primaryAction.boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
});
