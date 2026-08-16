import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { waitForExpensesQuerySuccess } from "./e2e-expenses-helpers";

const WORKSPACES = [
  { route: "/financial/expenses?date_kind=all", surface: "expenses" },
  { route: "/financial/inbox?date_kind=all", surface: "inbox" },
] as const;

test.use({ hasTouch: true });

async function openEditableDetail(page: Page, route: string, surface: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await waitForExpensesQuerySuccess(page, 90_000);

  const root = page.locator(`[data-expenses-list-page="${surface}"]`);
  const row = root.locator("[data-expense-id]:visible").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  const panel = root.locator("[data-expense-detail-panel]");
  await expect(panel).toBeVisible();
  if (surface === "inbox") {
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
  } else {
    await panel.getByRole("button", { name: "Edit Expense", exact: true }).click();
    await expect(panel).toHaveAttribute("data-expense-detail-mode", "edit");
  }

  const detailBody = panel.locator("[data-expense-detail-body]");
  const moreDetails = panel.locator("details.expense-more-details").first();
  await expect(detailBody).toBeVisible();
  await expect(moreDetails).not.toHaveAttribute("open", "");
  return { detailBody, moreDetails, panel, root };
}

async function scrollMetrics(page: Page) {
  return page.evaluate(() => {
    const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const workspace = document.querySelector<HTMLElement>("[data-expense-operations-workspace]");
    const panelElement = document.querySelector<HTMLElement>("[data-expense-detail-panel]");
    const detailElement = document.querySelector<HTMLElement>("[data-expense-detail-body]");
    const queue = document.querySelector<HTMLElement>(
      "[data-expenses-ledger] .expense-compact-table-scroll, [data-expenses-ledger] [data-expense-mobile-ledger]"
    );
    if (!app || !workspace || !panelElement || !detailElement || !queue) {
      throw new Error("Expense scroll container is missing.");
    }
    const style = (element: Element) => getComputedStyle(element).overflowY;
    return {
      app: {
        clientHeight: app.clientHeight,
        overflowY: style(app),
        scrollHeight: app.scrollHeight,
        scrollTop: app.scrollTop,
      },
      detail: {
        clientHeight: detailElement.clientHeight,
        overflowY: style(detailElement),
        scrollHeight: detailElement.scrollHeight,
      },
      panelHeight: panelElement.getBoundingClientRect().height,
      queue: {
        clientHeight: queue.clientHeight,
        overflowY: style(queue),
        scrollHeight: queue.scrollHeight,
        scrollTop: queue.scrollTop,
      },
      workspaceHeight: workspace.getBoundingClientRect().height,
    };
  });
}

test.describe("Expense Detail scroll ownership", () => {
  test.describe.configure({ timeout: 240_000, retries: 0 });

  test("desktop More Details grows only the Detail scroll area", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsE2EOwner(page, "/financial/expenses");

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      for (const workspace of WORKSPACES) {
        const { detailBody, moreDetails } = await openEditableDetail(
          page,
          workspace.route,
          workspace.surface
        );
        const before = await scrollMetrics(page);

        await moreDetails.locator("summary").click();
        await expect(moreDetails).toHaveAttribute("open", "");
        const after = await scrollMetrics(page);

        expect(after.app.scrollHeight, `${workspace.surface} app scroll`).toBeLessThanOrEqual(
          after.app.clientHeight + 1
        );
        expect(after.panelHeight, `${workspace.surface} stable panel height`).toBeCloseTo(
          before.panelHeight,
          0
        );
        expect(after.workspaceHeight, `${workspace.surface} stable workspace height`).toBeCloseTo(
          before.workspaceHeight,
          0
        );
        expect(after.detail.overflowY).toBe("auto");
        expect(after.detail.scrollHeight).toBeGreaterThan(after.detail.clientHeight);
        expect(after.detail.scrollHeight).toBeGreaterThanOrEqual(before.detail.scrollHeight);
        expect(after.queue.overflowY).toBe("auto");

        if (viewport.width === 1024) {
          const queue = page
            .locator(`[data-expenses-list-page="${workspace.surface}"] [data-expenses-ledger]`)
            .locator(".expense-compact-table-scroll, [data-expense-mobile-ledger]")
            .filter({ visible: true })
            .first();
          await queue.hover();
          await page.mouse.wheel(0, 600);
          await expect
            .poll(() => queue.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
        }

        await detailBody.hover();
        await page.mouse.wheel(0, 600);
        await expect
          .poll(() => detailBody.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
        await expect
          .poll(() =>
            page.locator("[data-app-scroll-root]").evaluate((element) => element.scrollTop)
          )
          .toBe(0);
      }
    }
  });

  test("iPad and mobile Detail sheets keep body locked and scroll internally", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAsE2EOwner(page, "/financial/expenses");

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const workspace of WORKSPACES) {
        const { detailBody, moreDetails } = await openEditableDetail(
          page,
          workspace.route,
          workspace.surface
        );
        const summary = moreDetails.locator("summary");
        await summary.scrollIntoViewIfNeeded();
        const summaryBox = await summary.boundingBox();
        expect(summaryBox).not.toBeNull();
        await page.touchscreen.tap(
          summaryBox!.x + summaryBox!.width / 2,
          summaryBox!.y + summaryBox!.height / 2
        );
        await expect(moreDetails).toHaveAttribute("open", "");

        const metrics = await scrollMetrics(page);
        expect(metrics.app.overflowY).toBe("hidden");
        expect(metrics.detail.overflowY).toBe("auto");
        expect(metrics.detail.scrollHeight).toBeGreaterThan(metrics.detail.clientHeight);
        await detailBody.evaluate((element) => {
          element.scrollTop = Math.min(240, element.scrollHeight - element.clientHeight);
        });
        await expect
          .poll(() => detailBody.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
      }
    }
  });
});
