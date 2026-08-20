import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return Math.max(
          root.scrollWidth - root.clientWidth,
          app ? app.scrollWidth - app.clientWidth : 0
        );
      })
    )
    .toBe(0);
}

test("Estimate List composes summary, tools, and rows as one compact workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates");

  const workspace = page.getByTestId("estimate-list-workspace");
  const summaryRail = page.getByTestId("estimate-list-summary-rail");
  const recordsWorkspace = page.getByTestId("estimate-list-records");

  await expect(workspace).toBeVisible();
  await expect(summaryRail).toBeVisible();
  await expect(recordsWorkspace).toBeVisible();
  await expect
    .poll(async () => (await summaryRail.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(88);

  const tableRows = recordsWorkspace.locator("tbody tr");
  expect(await tableRows.count()).toBeGreaterThan(1);
  await expect(recordsWorkspace).toContainText("$3,253,937.00");

  const longEstimateRow = tableRows.filter({ hasText: "EST-0079" });
  await expect(longEstimateRow).toBeVisible();
  await expect(longEstimateRow.getByTestId("estimate-row-client")).toHaveCSS(
    "-webkit-line-clamp",
    "2"
  );
  await expect(longEstimateRow.getByTestId("estimate-row-project")).toHaveCSS(
    "-webkit-line-clamp",
    "2"
  );

  const search = page.getByPlaceholder("Search estimates…").locator("visible=true");
  await search.fill("EST-0079");
  await expect(tableRows).toHaveCount(1);
  await search.fill("");
  await page.locator("select:visible").selectOption("Draft");
  expect(await tableRows.count()).toBeGreaterThan(1);
  await expectNoHorizontalOverflow(page);
});

test("Estimate List mobile cards preserve task-oriented context and touch targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, "/estimates");

  const mobileList = page.getByTestId("estimate-mobile-list");
  await expect(mobileList).toBeVisible();
  await expect(mobileList.getByTestId("estimate-mobile-updated").first()).toHaveText(
    /^\d{4}-\d{2}-\d{2}$/
  );

  const create = page.getByRole("link", { name: "New estimate" });
  const filters = page.getByRole("button", { name: /^Filters/ });
  const rowActions = page.getByRole("button", { name: /Actions for estimate/ }).first();
  await expect(rowActions).toBeVisible();
  await expect(rowActions).toHaveCSS("opacity", "1");
  for (const control of [create, filters, rowActions]) {
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await expectNoHorizontalOverflow(page);
});

test("Estimate List iPad portrait uses the compact card composition", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await loginAsE2EOwner(page, "/estimates");

  await expect(page.getByTestId("estimate-mobile-list")).toBeVisible();
  await expect(page.locator(".estimate-list-table-shell")).toBeHidden();
  await expectNoHorizontalOverflow(page);
});
