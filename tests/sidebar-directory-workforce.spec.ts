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

type ConsoleWatch = {
  errors: string[];
  stop: () => void;
};

function startConsoleWatch(page: Page): ConsoleWatch {
  const errors: string[] = [];
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") errors.push(message.text());
  };
  const onPageError = (error: Error) => {
    errors.push(error.message);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    errors,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    },
  };
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

function visibleSidebar(page: Page): Locator {
  return page.locator("[data-app-sidebar]:visible").first();
}

function navLink(page: Page, label: string): Locator {
  return visibleSidebar(page)
    .getByRole("link", { name: new RegExp(`^${label}(?: \\(\\d+\\))?$`) })
    .first();
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

async function ensureSectionOpen(page: Page, label: RegExp) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  const button = sidebar.getByRole("button", { name: label }).first();
  if (await button.isVisible().catch(() => false)) {
    const expanded = await button.getAttribute("aria-expanded");
    if (expanded !== "true") await button.click();
  }
}

async function gotoAndWait(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(appMain(page)).toBeVisible({ timeout: 30_000 });
  await expectNoVisibleAppError(page);
}

async function firstWorkerId(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/labor/workers", { timeout: 15_000 });
  if (!response.ok()) return null;
  const json = (await response.json().catch(() => null)) as Array<{ id?: string }> | null;
  return json?.find((row) => typeof row.id === "string" && row.id.trim())?.id ?? null;
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

async function expectWorkforceTab(page: Page, tabName: string, tabValue: string) {
  const tabList = page.getByRole("tablist").first();
  const tab = tabList.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") });
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  if (tabValue === "overview") {
    const urlTab = new URL(page.url()).searchParams.get("tab");
    expect(urlTab === null || urlTab === "overview").toBe(true);
    return;
  }
  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe(tabValue);
}

test.describe("Directory sidebar and Workforce reports IA", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
  });

  test("Directory sidebar contains only directory entities and Workers opens Worker Center", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndWait(page, "/dashboard");
    await ensureSectionOpen(page, /^(DIRECTORY|PEOPLE)$/i);

    for (const label of ["Customers", "Workers", "Vendors", "Subcontractors"]) {
      await expect(navLink(page, label)).toBeVisible({ timeout: 10_000 });
    }

    for (const legacyLabel of [
      "Worker Center",
      "Worker Summary",
      "Payroll Summary",
      "Worker Balances",
      "Worker Payments",
      "Worker Advances",
      "Worker Invoices",
    ]) {
      await expect(visibleSidebar(page).getByText(legacyLabel, { exact: true })).toHaveCount(0);
    }

    await navLink(page, "Workers").click();
    await expect(page).toHaveURL(/\/workers(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: /^Worker Center$/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("Worker Detail tabs still render from Worker Center", async ({ page }) => {
    const workerId = await firstWorkerId(page);
    test.skip(!workerId, "No worker id available for Worker Detail tab smoke.");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndWait(page, `/workers/${encodeURIComponent(workerId!)}`);

    for (const label of [
      "Overview",
      "Work",
      "Receipts & Reimbursements",
      "Advances",
      "Payments",
      "Statements",
      "Rate History",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible({ timeout: 30_000 });
    }

    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByRole("tab", { name: "Payments" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("Reports opens and Reports Workforce tabs switch without console errors", async ({
    page,
  }) => {
    const consoleWatch = startConsoleWatch(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    await gotoAndWait(page, "/reports");
    await expect(page.getByRole("heading", { name: /^Reports$/ })).toBeVisible({
      timeout: 30_000,
    });

    await ensureSectionOpen(page, /^REPORTS$/i);
    await expect(navLink(page, "Workforce")).toBeVisible({ timeout: 10_000 });
    await navLink(page, "Workforce").click();
    await expect(page).toHaveURL(/\/reports\/workforce(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: /^Workforce Reports$/i })).toBeVisible({
      timeout: 30_000,
    });

    for (const [label, value] of [
      ["Overview", "overview"],
      ["Payroll", "payroll"],
      ["Balances", "balances"],
      ["Payments", "payments"],
      ["Advances", "advances"],
      ["Reimbursements", "reimbursements"],
      ["Statements", "statements"],
    ] as const) {
      await expectWorkforceTab(page, label, value);
    }

    consoleWatch.stop();
    expect(consoleWatch.errors).toEqual([]);
  });

  test("old worker report routes redirect to the matching Workforce tabs", async ({ page }) => {
    const cases = [
      ["/workers/summary", "overview"],
      ["/labor/payroll", "payroll"],
      ["/labor/payroll-summary", "payroll"],
      ["/labor/worker-balances", "balances"],
      ["/labor/payments", "payments"],
      ["/labor/advances", "advances"],
    ] as const;

    for (const [path, tab] of cases) {
      await test.step(path, async () => {
        await gotoAndWait(page, path);
        const url = new URL(page.url());
        expect(url.pathname).toBe("/reports/workforce");
        expect(url.searchParams.get("tab")).toBe(tab);
        await expect(
          page.getByRole("tab", {
            name: new RegExp(`^${tab === "overview" ? "Overview" : tab}$`, "i"),
          })
        ).toHaveAttribute("aria-selected", "true");
      });
    }
  });

  test("mobile Reports Workforce menu has no horizontal overflow", async ({ page }) => {
    const consoleWatch = startConsoleWatch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndWait(page, "/reports/workforce?tab=payments");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: /^Open menu$/i }).click();
    await expect(visibleSidebar(page)).toBeVisible({ timeout: 10_000 });
    await ensureSectionOpen(page, /^(DIRECTORY|PEOPLE)$/i);
    await expectNoHorizontalOverflow(page);

    consoleWatch.stop();
    expect(consoleWatch.errors).toEqual([]);
  });
});
