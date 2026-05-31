import { expect, test, type Locator, type Page } from "@playwright/test";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

type PeopleRoute = {
  label: string;
  path: string;
  heading: RegExp;
  finalPath?: string;
  activeLabel?: string;
};

const peopleRoutes: PeopleRoute[] = [
  { label: "Customers", path: "/customers", heading: /^Customers$/i },
  { label: "Workers", path: "/workers", heading: /^Workers$/i },
  {
    label: "Worker Summary",
    path: "/workers/summary",
    heading: /^Worker Summary$/i,
    activeLabel: "Workers",
  },
  {
    label: "Worker Balances",
    path: "/labor/worker-balances",
    heading: /^(Worker Balances|Balances)$/i,
  },
  {
    label: "Worker Payments",
    path: "/labor/payments",
    heading: /^Worker Payments$/i,
  },
  {
    label: "Worker Advances",
    path: "/labor/advances",
    heading: /^(Worker Advances|Advances)$/i,
  },
  {
    label: "Worker Invoices",
    path: "/labor/worker-invoices",
    heading: /^Worker Invoices$/i,
  },
  {
    label: "Payroll Summary",
    path: "/labor/payroll",
    heading: /^Payroll Summary$/i,
  },
  { label: "Vendors", path: "/financial/vendors", heading: /^Vendors$/i },
  {
    label: "Vendors Alias",
    path: "/vendors",
    finalPath: "/financial/vendors",
    heading: /^Vendors$/i,
    activeLabel: "Vendors",
  },
  { label: "Subcontractors", path: "/subcontractors", heading: /^Subcontractors$/i },
  {
    label: "Subcontractors Alias",
    path: "/labor/subcontractors",
    finalPath: "/subcontractors",
    heading: /^Subcontractors$/i,
    activeLabel: "Subcontractors",
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

async function ensureSectionOpen(page: Page, label: string) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 20_000 });
  const sectionButton = sidebar.getByRole("button", { name: new RegExp(`^${label}$`) }).first();
  if (await sectionButton.isVisible().catch(() => false)) {
    const expanded = await sectionButton.getAttribute("aria-expanded");
    if (expanded !== "true") await sectionButton.click();
  }
}

async function ensurePeopleNavigationVisible(page: Page) {
  await ensureSectionOpen(page, "PEOPLE");
  const sidebar = visibleSidebar(page);
  for (const label of [
    "Customers",
    "Workers",
    "Worker Balances",
    "Worker Payments",
    "Worker Advances",
    "Worker Invoices",
    "Payroll Summary",
    "Vendors",
    "Subcontractors",
  ]) {
    await expect(navLink(page, label)).toBeVisible({ timeout: 10_000 });
  }
  await expect(sidebar.getByText("All Contacts", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
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

async function waitForRouteReady(page: Page, route: PeopleRoute) {
  const finalPath = route.finalPath ?? route.path;
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(routeUrlPattern(finalPath), { timeout: 30_000 });

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
  await ensureSectionOpen(page, "PEOPLE");
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

test.describe("People OS navigation shell", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
  });

  test("desktop sidebar presents People as a directory and preserves route compatibility", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await ensurePeopleNavigationVisible(page);
    await ensureSectionOpen(page, "PROJECTS");
    await ensureSectionOpen(page, "FINANCIAL");
    for (const label of ["Worker Reimbursements", "Worker Receipts"]) {
      await expect(visibleSidebar(page).getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(visibleSidebar(page).getByText("AP", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    for (const route of peopleRoutes) {
      await test.step(route.label, async () => {
        await ensureSectionOpen(page, "PEOPLE");

        if (route.activeLabel || route.finalPath) {
          await page.goto(route.path);
        } else {
          await Promise.all([
            page.waitForURL(routeUrlPattern(route.path), { timeout: 30_000 }),
            navLink(page, route.label).click(),
          ]);
        }

        await waitForRouteReady(page, route);
        await expectActiveSidebarItem(page, route.activeLabel ?? route.label);
      });
    }
  });

  test("command palette finds People OS directory modules", async ({ page }) => {
    await page.goto("/workers", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Open command palette" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    for (const item of [
      { query: "customers", label: "Go to Customers" },
      { query: "workers", label: "Go to Workers" },
      { query: "vendors", label: "Go to Vendors" },
      { query: "subcontractors", label: "Go to Subcontractors" },
      { query: "worker balances", label: "Go to Worker Balances" },
      { query: "worker payments", label: "Go to Worker Payments" },
      { query: "worker advances", label: "Go to Worker Advances" },
      { query: "worker invoices", label: "Go to Worker Invoices" },
      { query: "payroll summary", label: "Go to Payroll Summary" },
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

  test("mobile People navigation is usable without horizontal overflow", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customers");
    await waitForRouteReady(page, peopleRoutes[0]);
    await expect(
      page
        .getByRole("navigation", { name: "Bottom navigation" })
        .getByRole("link", { name: /^People$/ })
    ).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalOverflow(page);

    await openMobileMenu(page);
    await ensurePeopleNavigationVisible(page);
    await expectNoHorizontalOverflow(page);

    for (const route of [
      peopleRoutes[1],
      peopleRoutes[3],
      peopleRoutes[4],
      peopleRoutes[5],
      peopleRoutes[8],
      peopleRoutes[10],
    ]) {
      await test.step(route.label, async () => {
        await Promise.all([
          page.waitForURL(routeUrlPattern(route.path), { timeout: 30_000 }),
          navLink(page, route.activeLabel ?? route.label).click(),
        ]);
        await waitForRouteReady(page, route);
        await expect(page.getByRole("button", { name: /^Open menu$/i })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await openMobileMenu(page);
      });
    }
  });
});
