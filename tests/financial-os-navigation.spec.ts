import { expect, test, type Locator, type Page } from "@playwright/test";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

type FinancialRoute = {
  label: string;
  path: string;
  heading: RegExp;
  activeLabel: string;
};

const financialRoutes: FinancialRoute[] = [
  { label: "Overview", path: "/financial", heading: /^Financial$/i, activeLabel: "Overview" },
  {
    label: "Owner Dashboard",
    path: "/financial/owner",
    heading: /^Finance dashboard$/i,
    activeLabel: "Owner Dashboard",
  },
  {
    label: "AR Summary",
    path: "/financial/ar",
    heading: /^Accounts Receivable$/i,
    activeLabel: "AR",
  },
  {
    label: "Invoices",
    path: "/financial/invoices",
    heading: /^Invoices$/i,
    activeLabel: "Invoices",
  },
  {
    label: "Payments Received",
    path: "/financial/payments",
    heading: /^Payments Received$/i,
    activeLabel: "Payments Received",
  },
  {
    label: "Deposits",
    path: "/financial/deposits",
    heading: /^Deposits$/i,
    activeLabel: "Deposits",
  },
  { label: "Bills", path: "/bills", heading: /^Bills$/i, activeLabel: "Bills" },
  {
    label: "Expenses",
    path: "/financial/expenses",
    heading: /^Expenses$/i,
    activeLabel: "Expenses",
  },
  {
    label: "Receipt Inbox",
    path: "/financial/inbox",
    heading: /^Inbox$/i,
    activeLabel: "Receipt Inbox",
  },
  {
    label: "Worker Receipts",
    path: "/labor/receipts",
    heading: /^(Worker Receipt Uploads|Receipt Uploads)$/i,
    activeLabel: "Worker Receipts",
  },
  {
    label: "Accounts",
    path: "/financial/accounts",
    heading: /^Accounts$/i,
    activeLabel: "Accounts",
  },
  {
    label: "Bank Transactions",
    path: "/financial/bank",
    heading: /^Bank Reconcile$/i,
    activeLabel: "Bank Transactions",
  },
  {
    label: "Cash Flow",
    path: "/dashboard/cashflow",
    heading: /^Cashflow$/i,
    activeLabel: "Cash Flow",
  },
  {
    label: "Commission Payments",
    path: "/financial/commissions",
    heading: /^Commission Payments$/i,
    activeLabel: "Commission Payments",
  },
  {
    label: "Reimbursements",
    path: "/labor/reimbursements",
    heading: /^(Worker Reimbursements|Reimbursements)$/i,
    activeLabel: "Reimbursements",
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeUrlPattern(path: string): RegExp {
  return new RegExp(`${escapeRegExp(path)}(?:[?#].*)?$`);
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
    .getByRole("link", { name: new RegExp(`^${escapeRegExp(label)}(?: \\(\\d+\\))?$`) })
    .first();
}

async function ensureFinancialSectionOpen(page: Page) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 20_000 });
  const sectionButton = sidebar.getByRole("button", { name: /^FINANCIAL$/ }).first();
  if (await sectionButton.isVisible().catch(() => false)) {
    const expanded = await sectionButton.getAttribute("aria-expanded");
    if (expanded !== "true") await sectionButton.click();
  }
}

async function expectFinancialGroupsVisible(page: Page) {
  const sidebar = visibleSidebar(page);
  for (const label of [
    "Overview",
    "Owner Dashboard",
    "AR",
    "Invoices",
    "Payments Received",
    "Deposits",
    "AP",
    "Bills",
    "Expenses",
    "Receipt Inbox",
    "Reimbursements",
    "Worker Receipts",
    "Commission Payments",
    "Cash",
    "Accounts",
    "Bank Transactions",
    "Cash Flow",
    "Reports",
  ]) {
    await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
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

async function waitForRouteReady(page: Page, route: FinancialRoute) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(routeUrlPattern(route.path), { timeout: 30_000 });

  const main = appMain(page);
  await expect(main).toBeVisible({ timeout: 30_000 });
  await expect(main.getByText(/^Loading[.…]*$/).first())
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);
  await expect(main.getByRole("heading", { name: route.heading }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoVisibleAppError(page);

  const textLength = await main.evaluate((el) => (el.textContent ?? "").trim().length);
  expect(textLength, `${route.label} main content should not be blank`).toBeGreaterThan(20);
}

async function expectActiveSidebarItem(page: Page, label: string) {
  const link = navLink(page, label);
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveClass(/text-white/, { timeout: 10_000 });
}

async function openMobileMenu(page: Page) {
  await page.getByRole("button", { name: /^Open menu$/i }).click();
  await ensureFinancialSectionOpen(page);
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

test.describe("Financial OS navigation grouping", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
  });

  test("desktop sidebar groups Financial into final OS hubs and keeps routes compatible", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await ensureFinancialSectionOpen(page);
    await expectFinancialGroupsVisible(page);

    for (const route of financialRoutes) {
      await test.step(route.label, async () => {
        await page.goto(route.path);
        await waitForRouteReady(page, route);
        await expectActiveSidebarItem(page, route.activeLabel);
      });
    }
  });

  test("preserves Financial OS compatibility redirects", async ({ page }) => {
    await page.goto("/financial/estimates");
    await expect(page).toHaveURL(/\/estimates(?:[?#].*)?$/, { timeout: 30_000 });

    await page.goto("/financial/bills");
    await expect(page).toHaveURL(/\/bills(?:[?#].*)?$/, { timeout: 30_000 });

    await page.goto("/financial/payments-received");
    await expect(page).toHaveURL(/\/financial\/payments(?:[?#].*)?$/, { timeout: 30_000 });

    await page.goto("/finance");
    await expect(page).toHaveURL(/\/finance(?:[?#].*)?$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Finance Overview$/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("mobile drawer exposes Financial OS groups without horizontal overflow", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial");
    await page.waitForLoadState("domcontentloaded");
    await waitForRouteReady(page, financialRoutes[0]);
    await expectNoHorizontalOverflow(page);

    await openMobileMenu(page);
    await expectFinancialGroupsVisible(page);

    for (const route of [
      financialRoutes[2],
      financialRoutes[6],
      financialRoutes[8],
      financialRoutes[9],
      financialRoutes[12],
    ]) {
      await test.step(route.label, async () => {
        await page.goto(route.path);
        await waitForRouteReady(page, route);
        await expect(
          page
            .getByRole("navigation", { name: "Bottom navigation" })
            .getByRole("link", { name: /^Financial$/ })
        ).toHaveAttribute("aria-current", "page");
        await expect(page.getByRole("button", { name: /^Open menu$/i })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await openMobileMenu(page);
      });
    }
  });
});
