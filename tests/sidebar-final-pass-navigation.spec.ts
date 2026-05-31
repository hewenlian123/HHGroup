import { expect, test, type Locator, type Page } from "@playwright/test";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  DOCUMENTS: true,
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
  for (const label of ["DASHBOARD", "PROJECTS", "FINANCIAL", "PEOPLE", "DOCUMENTS", "SETTINGS"]) {
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

async function waitForRouteSmoke(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}(?:[?#].*)?$`), {
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
  });

  test("desktop sidebar presents the final primary IA without deep leaf clutter", async ({
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
      "Customers",
      "Tasks",
      "Schedule",
      "Overview",
      "AR",
      "AP",
      "Cash",
      "Reports",
      "Workers",
      "Vendors",
      "Subcontractors",
      "All Contacts",
      "Documents",
      "Site Photos",
      "Inspection Log",
      "Company",
      "Users",
      "Roles",
      "Preferences",
      "Admin Center",
    ]) {
      await expect(visibleSidebar(page).getByText(label, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
    }

    for (const removedLabel of [
      "Material Catalog",
      "Punch List",
      "Upload Receipt",
      "Receipt Inbox",
      "Worker Balances",
      "Worker Receipts",
      "Worker Invoices",
      "System Metrics",
      "System Logs",
      "Backups",
    ]) {
      await expect(visibleSidebar(page).getByText(removedLabel, { exact: true })).toHaveCount(0);
    }
  });

  test("key routes load and activate the final sidebar owner", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const routes = [
      { path: "/dashboard", active: "Dashboard" },
      { path: "/projects", active: "Projects" },
      { path: "/estimates", active: "Estimates" },
      { path: "/tasks", active: "Tasks" },
      { path: "/schedule", active: "Schedule" },
      { path: "/financial", active: "Overview" },
      { path: "/financial/ar", active: "AR" },
      { path: "/bills", active: "AP" },
      { path: "/financial/expenses", active: "AP" },
      { path: "/financial/vendors", active: "Vendors" },
      { path: "/workers", active: "Workers" },
      { path: "/subcontractors", active: "Subcontractors" },
      { path: "/documents", active: "Documents" },
      { path: "/site-photos", active: "Site Photos" },
      { path: "/inspection-log", active: "Inspection Log" },
      { path: "/settings/company", active: "Company" },
      { path: "/system-health", active: "Admin Center" },
    ];

    for (const route of routes) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path);
        await expectActiveSidebarItem(page, route.active);
      });
    }
  });

  test("mobile drawer and bottom nav use one route owner per route", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of [
      { path: "/financial/vendors", bottom: "People" },
      { path: "/bills", bottom: "Financial" },
      { path: "/site-photos", bottom: "Documents" },
      { path: "/inspection-log", bottom: "Documents" },
      { path: "/estimates", bottom: "Projects" },
      { path: "/labor/payroll", bottom: "Financial" },
    ]) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path);
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
    await expect(visibleSidebar(page).getByText("Material Catalog", { exact: true })).toHaveCount(
      0
    );
    await expectNoHorizontalOverflow(page);
  });

  test("command palette finds routes removed from the primary sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForRouteSmoke(page, "/dashboard");
    const dialog = await openCommandPalette(page);

    for (const item of [
      { query: "material catalog", label: "Go to Material Catalog" },
      { query: "punch list", label: "Go to Punch List" },
      { query: "receipt inbox", label: "Go to Receipt Inbox" },
      { query: "worker balances", label: "Go to Worker Balances" },
      { query: "worker receipts", label: "Go to Worker Receipts" },
      { query: "worker invoices", label: "Go to Worker Invoices" },
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
      { path: "/financial/vendors", title: "People › Vendors" },
      { path: "/labor/payroll", title: "Financial › AP › Payroll" },
      { path: "/materials/catalog", title: "Projects › Material Catalog" },
      { path: "/system-health", title: "Settings › Admin Center › System Health" },
    ]) {
      await test.step(route.path, async () => {
        await waitForRouteSmoke(page, route.path);
        await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveAttribute(
          "title",
          route.title
        );
      });
    }
  });
});
