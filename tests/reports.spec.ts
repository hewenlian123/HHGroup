import { expect, test, type Locator, type Page } from "@playwright/test";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  REPORTS: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function prepareStableSidebar(page: Page) {
  await page.addInitScript((sections) => {
    window.localStorage.setItem("hh.sidebarCollapsed", "0");
    window.localStorage.setItem("hh.sidebarSections", JSON.stringify(sections));
  }, OPEN_SECTIONS);
}

function appMain(page: Page): Locator {
  return page.locator("[data-app-scroll-root]");
}

async function expectNoVisibleAppError(page: Page) {
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).not.toBeVisible();
  await expect(
    page
      .locator("body")
      .getByText(
        /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong|Hydration failed/i
      )
      .first()
  ).not.toBeVisible();
}

async function gotoReports(page: Page, query = "") {
  await page.goto(`/reports${query}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/reports(?:${escapeRegExp(query)})?$`), {
    timeout: 30_000,
  });
  await expect(appMain(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /^Reports$/ })).toBeVisible({
    timeout: 30_000,
  });
  await expectNoVisibleAppError(page);
}

async function waitForRouteSmoke(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}(?:[?#].*)?$`), {
    timeout: 30_000,
  });
  const main = appMain(page);
  await expect(main).toBeVisible({ timeout: 30_000 });
  await expectNoVisibleAppError(page);
  const textLength = await main.evaluate((el) => (el.textContent ?? "").trim().length);
  expect(textLength, `${path} main content should not be blank`).toBeGreaterThan(20);
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    Math.max(metrics.documentWidth, metrics.bodyWidth),
    `No horizontal overflow: ${JSON.stringify(metrics)}`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

test.describe("Reports module", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
  });

  test("reports renders with monthly business report tabs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReports(page);

    for (const label of [
      "Monthly Business Report",
      "Project Profitability",
      "AR Aging",
      "AP Aging",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }

    for (const label of [
      "Invoiced Revenue",
      "Cash Collected",
      "Expenses",
      "Labor Cost",
      "Subcontractor Cost",
      "Bills / AP",
      "Gross Profit",
      "Net Profit",
      "Profit Margin",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("monthly empty state works for an empty custom date range", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await gotoReports(page, "?period=custom&from=2100-01-01&to=2100-01-31");

    await expect(page.getByTestId("monthly-report-empty-state")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("No report activity for this period.", { exact: true })
    ).toBeVisible();
  });

  test("project profitability renders without crash", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReports(page, "?tab=project-profitability");

    await expect(page.getByRole("tab", { name: "Project Profitability" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByTestId("project-profitability-content")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Invoice / Contract Amount", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Open AR", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Open AP", { exact: true }).first()).toBeVisible();
  });

  test("AR aging buckets render", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await gotoReports(page, "?tab=ar-aging");

    await expect(page.getByTestId("ar-aging-content")).toBeVisible({ timeout: 30_000 });
    for (const bucket of ["Current", "1-30", "31-60", "61-90", "90+"]) {
      await expect(page.getByTestId(`ar-aging-bucket-${bucket}`)).toBeVisible();
    }
  });

  test("AP aging buckets render", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await gotoReports(page, "?tab=ap-aging");

    await expect(page.getByTestId("ap-aging-content")).toBeVisible({ timeout: 30_000 });
    for (const bucket of ["Current", "1-30", "31-60", "61-90", "90+"]) {
      await expect(page.getByTestId(`ap-aging-bucket-${bucket}`)).toBeVisible();
    }
  });

  test("mobile has no horizontal overflow and exposes Reports navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReports(page);

    const bottom = page.getByRole("navigation", { name: "Bottom navigation" });
    await expect(bottom.getByRole("link", { name: /^Reports$/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(bottom.locator('[aria-current="page"]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });

  test("regression smoke keeps dashboard invoices labor and projects rendering", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const path of ["/dashboard", "/financial/invoices", "/labor", "/projects"]) {
      await test.step(path, async () => {
        await waitForRouteSmoke(page, path);
      });
    }
  });
});
