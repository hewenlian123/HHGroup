import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  REPORTS: true,
  SETTINGS: true,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleSidebar(page: Page): Locator {
  return page.locator("[data-app-sidebar]:visible").first();
}

function appMain(page: Page): Locator {
  return page.locator("[data-app-scroll-root]");
}

function navLink(page: Page, label: string): Locator {
  return visibleSidebar(page)
    .getByRole("link", { name: new RegExp(`^${escapeRegExp(label)}(?: \\(\\d+\\))?$`) })
    .first();
}

async function prepareStableSidebar(page: Page) {
  await page.addInitScript((sections) => {
    window.localStorage.setItem("hh.sidebarCollapsed", "0");
    window.localStorage.setItem("hh.sidebarSections", JSON.stringify(sections));
  }, OPEN_SECTIONS);
}

async function ensureSectionOpen(page: Page, label: string) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 20_000 });
  const sectionButton = sidebar.getByRole("button", { name: new RegExp(`^${label}$`) }).first();
  if (await sectionButton.isVisible().catch(() => false)) {
    const expanded = await sectionButton.getAttribute("aria-expanded");
    if (expanded !== "true") await sectionButton.click();
  }
}

async function ensureAllSectionsOpen(page: Page) {
  for (const label of ["DASHBOARD", "PROJECTS", "FINANCIAL", "PEOPLE", "REPORTS", "SETTINGS"]) {
    await ensureSectionOpen(page, label);
  }
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

async function waitForRouteSmoke(page: Page, path: string, expectedPath = path) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(expectedPath)}(?:[?#].*)?$`), {
    timeout: 30_000,
  });

  const main = appMain(page);
  await expect(main).toBeVisible({ timeout: 30_000 });
  await expect(main.getByText(/^Loading[.…]*$/).first())
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);
  await expectNoVisibleAppError(page);

  const textLength = await main.evaluate((el) => (el.textContent ?? "").trim().length);
  expect(textLength, `${path} main content should not be blank`).toBeGreaterThan(20);
}

async function expectActiveSidebarItem(page: Page, label: string) {
  const link = navLink(page, label);
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveClass(/text-white/, { timeout: 10_000 });
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

async function openCommandPalette(page: Page) {
  await page
    .getByRole("button", { name: "Open command palette" })
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe("HH Project OS sidebar final pass", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
    await loginAsE2EOwner(page, "/dashboard");
  });

  test("desktop sidebar presents the practical daily IA without losing high-use leaves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForRouteSmoke(page, "/dashboard");
    await ensureAllSectionsOpen(page);

    for (const label of [
      "Dashboard",
      "Projects",
      "Estimates",
      "Change Orders",
      "Time Entries",
      "Overview",
      "Owner Dashboard",
      "AR",
      "Invoices",
      "Payments Received",
      "Deposits",
      "AP",
      "Bills",
      "Expense Operations",
      "Commission Payments",
      "Cash",
      "Accounts",
      "Bank Transactions",
      "Cash Flow",
      "Reports",
      "Workforce",
      "Customers",
      "Workers",
      "Vendors",
      "Subcontractors",
      "Company",
      "Users",
      "Roles",
      "Preferences",
      "Admin Center",
      "System Health",
      "System Metrics",
      "System Logs",
      "Backups",
    ]) {
      await expect(visibleSidebar(page).getByText(label, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    await expect(visibleSidebar(page).getByText("Expense Operations", { exact: true })).toHaveCount(
      1
    );
    await expect(visibleSidebar(page).getByText("Expenses", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Receipt Inbox", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Reimbursements", { exact: true })).toHaveCount(0);
    for (const deletedProjectModule of [
      "Tasks",
      "Punch List",
      "Schedule",
      "Material Selections",
      "Documents",
      "Site Photos",
      "Inspection Log",
    ]) {
      await expect(
        visibleSidebar(page).getByText(deletedProjectModule, { exact: true })
      ).toHaveCount(0);
    }

    const workersBox = await navLink(page, "Workers").boundingBox();
    const reportsBox = await navLink(page, "Reports").boundingBox();
    const systemHealthBox = await navLink(page, "System Health").boundingBox();
    if (!workersBox || !reportsBox || !systemHealthBox) {
      throw new Error("Expected Workers, Reports, and System Health sidebar links to render");
    }
    expect(reportsBox.y, "Reports should sit after Workers in the main sidebar IA").toBeGreaterThan(
      workersBox.y
    );
    expect(
      reportsBox.y,
      "Reports should sit before System links in the main sidebar IA"
    ).toBeLessThan(systemHealthBox.y);

    for (const intentionallyHiddenLabel of ["Expense Preferences", "Financial Review"]) {
      await expect(
        visibleSidebar(page).getByText(intentionallyHiddenLabel, { exact: true })
      ).toHaveCount(0);
    }
  });

  test("key routes load and activate the final sidebar owner", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const routes = [
      { path: "/dashboard", active: "Dashboard" },
      { path: "/projects", active: "Projects" },
      { path: "/estimates", active: "Estimates" },
      { path: "/change-orders", active: "Change Orders" },
      { path: "/labor", active: "Time Entries" },
      { path: "/financial", active: "Overview" },
      { path: "/financial/owner", active: "Owner Dashboard" },
      { path: "/financial/ar", active: "AR" },
      { path: "/financial/invoices", active: "Invoices" },
      { path: "/financial/payments", active: "Payments Received" },
      { path: "/financial/deposits", active: "Deposits" },
      { path: "/bills", active: "Bills" },
      { path: "/financial/expenses", active: "Expense Operations" },
      { path: "/financial/inbox", active: "Expense Operations" },
      { path: "/labor/reimbursements", active: "Expense Operations" },
      { path: "/financial/commissions", active: "Commission Payments" },
      { path: "/financial/accounts", active: "Accounts" },
      { path: "/financial/bank", active: "Bank Transactions" },
      { path: "/dashboard/cashflow", active: "Cash Flow" },
      { path: "/reports", active: "Reports" },
      { path: "/customers", active: "Customers" },
      { path: "/financial/vendors", active: "Vendors" },
      { path: "/workers", active: "Workers" },
      { path: "/financial/inbox/worker", active: "Expense Operations" },
      { path: "/labor/payroll", expectedPath: "/reports/workforce", active: "Workforce" },
      { path: "/subcontractors", active: "Subcontractors" },
      { path: "/settings/company", active: "Company" },
      { path: "/system-health", active: "System Health" },
      { path: "/system-metrics", active: "System Metrics" },
      { path: "/system-logs", active: "System Logs" },
      { path: "/system/backups", active: "Backups" },
    ];

    for (const route of routes) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path, route.expectedPath);
        await expectActiveSidebarItem(page, route.active);
      });
    }
  });

  test("mobile drawer and bottom nav use one route owner per route", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of [
      { path: "/financial/vendors", bottom: "Directory" },
      { path: "/bills", bottom: "Financial" },
      { path: "/estimates", bottom: "Projects" },
      { path: "/labor", bottom: "Projects" },
      { path: "/labor/payroll", expectedPath: "/reports/workforce", bottom: "Reports" },
      { path: "/labor/payments", expectedPath: "/reports/workforce", bottom: "Reports" },
      { path: "/labor/reimbursements", bottom: "Financial" },
      { path: "/financial/inbox/worker", bottom: "Financial" },
      { path: "/workers/summary", expectedPath: "/reports/workforce", bottom: "Reports" },
      { path: "/dashboard/cashflow", bottom: "Financial" },
      { path: "/reports", bottom: "Reports" },
    ]) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path, route.expectedPath);
        const bottom = page.getByRole("navigation", { name: "Bottom navigation" });
        await expect(
          bottom.getByRole("link", { name: new RegExp(`^${route.bottom}$`) })
        ).toHaveAttribute("aria-current", "page");
        await expect(bottom.locator('[aria-current="page"]')).toHaveCount(1);
        await expectNoHorizontalOverflow(page);
      });
    }

    await page.getByRole("button", { name: /^Open menu$/i }).click();
    await ensureAllSectionsOpen(page);
    await expect(visibleSidebar(page).getByText("Admin Center", { exact: true })).toBeVisible();
    for (const deletedProjectModule of [
      "Tasks",
      "Punch List",
      "Schedule",
      "Material Selections",
      "Documents",
      "Site Photos",
      "Inspection Log",
    ]) {
      await expect(
        visibleSidebar(page).getByText(deletedProjectModule, { exact: true })
      ).toHaveCount(0);
    }
    await expect(visibleSidebar(page).getByText("Worker Receipts", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Expense Operations", { exact: true })).toHaveCount(
      1
    );
    await expect(visibleSidebar(page).getByText("Expenses", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Receipt Inbox", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Reimbursements", { exact: true })).toHaveCount(0);
    await expect(visibleSidebar(page).getByText("Cash Flow", { exact: true })).toBeVisible();
    await expect(navLink(page, "Reports")).toBeVisible();
    await navLink(page, "Reports").click();
    await expect(page).toHaveURL(/\/reports(?:[?#].*)?$/, { timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("command palette finds restored and deep practical routes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForRouteSmoke(page, "/dashboard");
    const dialog = await openCommandPalette(page);

    for (const deletedCommand of [
      "Go to Tasks",
      "Go to Punch List",
      "Go to Schedule",
      "Go to Material Selections",
      "Go to Documents",
      "Go to Site Photos",
      "Go to Inspection Log",
    ]) {
      await expect(dialog.getByText(deletedCommand, { exact: true })).toHaveCount(0);
    }

    for (const item of [
      { query: "expense operations", label: "Go to Expense Operations" },
      { query: "receipt inbox", label: "Go to Receipt Inbox" },
      { query: "upload receipt", label: "Upload Receipt" },
      { query: "worker summary", label: "Go to Workforce Overview" },
      { query: "worker balances", label: "Go to Workforce Balances" },
      { query: "worker submitted", label: "Go to Worker Submitted Receipts" },
      { query: "worker invoices", label: "Go to Worker Invoices" },
      { query: "cash flow", label: "Go to Cash Flow" },
      { query: "reports", label: "Go to Reports" },
      { query: "system metrics", label: "Go to System Metrics" },
      { query: "system logs", label: "Go to System Logs" },
      { query: "backups", label: "Go to Backups" },
      { query: "project financial review", label: "Go to Project Financial Review" },
    ]) {
      await test.step(item.query, async () => {
        await page.getByRole("combobox").fill(item.query);
        await expect(
          dialog.getByRole("option").filter({ hasText: item.label }).first()
        ).toBeVisible({
          timeout: 10_000,
        });
      });
    }
  });

  test("topbar breadcrumbs show logical IA ownership for legacy paths", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of [
      { path: "/bills", title: "Financial › AP › Bills" },
      { path: "/financial/vendors", title: "Directory › Vendors" },
      {
        path: "/labor/payroll",
        expectedPath: "/reports/workforce",
        title: "Reports › Workforce",
      },
      { path: "/dashboard/cashflow", title: "Financial › Cash › Cash Flow" },
      { path: "/reports", title: "Reports" },
      { path: "/system-health", title: "Settings › Admin Center › System Health" },
    ]) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path, route.expectedPath);
        await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveAttribute(
          "title",
          route.title
        );
      });
    }
  });
});
