import { expect, test, type Locator, type Page } from "@playwright/test";

const LABOR_SECTION_STORAGE = {
  PROJECTS: true,
  OPERATIONS: true,
  FINANCE: true,
  LABOR: true,
  PEOPLE: true,
  SYSTEM: true,
};

type LaborRoute = {
  label: string;
  path: string;
  heading: RegExp;
  action?: LaborAction;
};

type LaborAction =
  | {
      kind: "dialog";
      button: RegExp;
      dialog: RegExp;
    }
  | {
      kind: "inline";
      button: RegExp;
      openedHeading: RegExp;
      closeButton: RegExp;
    };

const laborRoutes: LaborRoute[] = [
  {
    label: "Time Entries",
    path: "/labor",
    heading: /^(Daily Labor|Labor)$/i,
    action: { kind: "dialog", button: /^Add Entry$/i, dialog: /^Add Daily Entry$/i },
  },
  {
    label: "Reimbursements",
    path: "/labor/reimbursements",
    heading: /^(Worker Reimbursements|Reimbursements)$/i,
    action: {
      kind: "inline",
      button: /^\+ New Reimbursement$/i,
      openedHeading: /^New Reimbursement$/i,
      closeButton: /^Cancel$/i,
    },
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
    action: { kind: "dialog", button: /^Create Advance$/i, dialog: /^Create Advance$/i },
  },
  {
    label: "Receipt Uploads",
    path: "/labor/receipts",
    heading: /^(Worker Receipt Uploads|Receipt Uploads)$/i,
  },
  {
    label: "Worker Invoices",
    path: "/labor/worker-invoices",
    heading: /^Worker Invoices$/i,
    action: {
      kind: "inline",
      button: /^New Invoice$/i,
      openedHeading: /^New Worker Invoice$/i,
      closeButton: /^Close$/i,
    },
  },
  {
    label: "Payroll Summary",
    path: "/labor/payroll",
    heading: /^Payroll Summary$/i,
  },
];

function routeUrlPattern(path: string): RegExp {
  return new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[?#].*)?$`);
}

async function prepareStableSidebar(page: Page) {
  await page.addInitScript((sections) => {
    window.localStorage.setItem("hh.sidebarCollapsed", "0");
    window.localStorage.setItem("hh.sidebarSections", JSON.stringify(sections));
  }, LABOR_SECTION_STORAGE);
}

function appMain(page: Page): Locator {
  return page.locator("[data-app-scroll-root]");
}

function visibleSidebar(page: Page): Locator {
  return page.locator("[data-app-sidebar]:visible").first();
}

function laborNavLink(page: Page, label: string): Locator {
  return visibleSidebar(page)
    .getByRole("link", { name: new RegExp(`^${label}$`) })
    .first();
}

async function ensureLaborSectionOpen(page: Page) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 20_000 });
  const sectionButton = sidebar.getByRole("button", { name: /^LABOR$/ }).first();
  if (await sectionButton.isVisible().catch(() => false)) {
    const expanded = await sectionButton.getAttribute("aria-expanded");
    if (expanded !== "true") await sectionButton.click();
  }
}

async function expectNoVisibleAppError(page: Page) {
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).not.toBeVisible();
  await expect(
    page
      .locator("body")
      .getByText(
        /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong|Supabase is not configured|Failed to load/i
      )
      .first()
  ).not.toBeVisible();
}

async function waitForRouteReady(page: Page, route: LaborRoute) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(routeUrlPattern(route.path), { timeout: 30_000 });

  const main = appMain(page);
  await expect(main).toBeVisible({ timeout: 30_000 });
  await expect(main.getByText(/^Loading…$/).first())
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);
  await expect(main.getByRole("heading", { name: route.heading }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectNoVisibleAppError(page);

  const textLength = await main.evaluate((el) => (el.textContent ?? "").trim().length);
  expect(textLength, `${route.label} main content should not be blank`).toBeGreaterThan(20);
}

async function expectActiveSidebarItem(page: Page, route: LaborRoute) {
  const link = laborNavLink(page, route.label);
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveClass(/text-white/, { timeout: 10_000 });
}

async function findVisibleText(root: Locator, pattern: RegExp): Promise<Locator | null> {
  const matches = root.getByText(pattern);
  const count = await matches.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = matches.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function expectRowsOrEmptyState(page: Page, route: LaborRoute) {
  const main = appMain(page);
  const table = main.locator("table:visible").first();
  if (await table.isVisible().catch(() => false)) {
    const firstRow = table.locator("tbody tr:visible").first();
    if (await firstRow.isVisible().catch(() => false)) return;
  }

  const empty = await findVisibleText(
    main,
    /No (labor entries this month|entries for this day|reimbursements|workers|payments|advances|invoices|receipts|results|workers found|workers match|payments match|advances match|receipts match|invoices to review)/i
  );
  expect(empty, `${route.label} should render table rows or an empty state`).not.toBeNull();
}

async function smokeMainAction(page: Page, route: LaborRoute) {
  if (!route.action) return;

  const main = appMain(page);
  const button = main.getByRole("button", { name: route.action.button }).first();
  if (!(await button.isVisible().catch(() => false))) return;

  await button.click();
  await expectNoVisibleAppError(page);

  if (route.action.kind === "dialog") {
    const dialog = page.getByRole("dialog", { name: route.action.dialog }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    return;
  }

  const opened = main.getByRole("heading", { name: route.action.openedHeading }).first();
  await expect(opened).toBeVisible({ timeout: 10_000 });
  await main.getByRole("button", { name: route.action.closeButton }).first().click();
  await expect(opened).not.toBeVisible({ timeout: 10_000 });
}

async function openMobileLaborDrawer(page: Page) {
  await page.getByRole("button", { name: /^Open menu$/i }).click();
  await expect(visibleSidebar(page)).toBeVisible({ timeout: 10_000 });
  await ensureLaborSectionOpen(page);
}

async function expectScrollRootUsable(page: Page, route: LaborRoute) {
  const main = appMain(page);
  const measure = async () =>
    main.evaluate((el) => {
      const doc = document.documentElement;
      return {
        mainMaxScroll: el.scrollHeight - el.clientHeight,
        mainScrollTop: el.scrollTop,
        windowMaxScroll: doc.scrollHeight - window.innerHeight,
        windowScrollY: window.scrollY,
        bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      };
    });

  expect(
    (await measure()).mainMaxScroll,
    `${route.label} scroll root should be measurable`
  ).toBeGreaterThanOrEqual(0);

  await main.evaluate((el) => {
    el.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(100);
  const down = await measure();

  const maxScrollable = Math.max(down.mainMaxScroll, down.windowMaxScroll);
  if (maxScrollable > 96) {
    const moved = down.mainScrollTop > 0 || down.windowScrollY > 0;
    expect(
      moved,
      `${route.label} mobile page should scroll down; state=${JSON.stringify(down)}`
    ).toBe(true);

    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(100);
    const up = await measure();
    expect(
      up.mainScrollTop === 0 || up.windowScrollY === 0,
      `${route.label} mobile page should scroll back up; state=${JSON.stringify(up)}`
    ).toBe(true);
  }
}

test.describe("Labor module sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await prepareStableSidebar(page);
  });

  test("desktop sidebar routes load, activate, and render lists or empty states", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await ensureLaborSectionOpen(page);

    for (const route of laborRoutes) {
      await test.step(route.label, async () => {
        await ensureLaborSectionOpen(page);
        await Promise.all([
          page.waitForURL(routeUrlPattern(route.path), { timeout: 30_000 }),
          laborNavLink(page, route.label).click(),
        ]);
        await waitForRouteReady(page, route);
        await expectActiveSidebarItem(page, route);
        await expectRowsOrEmptyState(page, route);
        await smokeMainAction(page, route);
        await expectNoVisibleAppError(page);
      });
    }
  });

  test("mobile drawer opens and Labor routes load with usable page scroll", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    for (const route of laborRoutes) {
      await test.step(route.label, async () => {
        await openMobileLaborDrawer(page);
        await Promise.all([
          page.waitForURL(routeUrlPattern(route.path), { timeout: 30_000 }),
          laborNavLink(page, route.label).click(),
        ]);
        await waitForRouteReady(page, route);
        await expect(page.getByRole("button", { name: /^Open menu$/i })).toBeVisible();
        await expectScrollRootUsable(page, route);
        await expectNoVisibleAppError(page);
      });
    }
  });
});
