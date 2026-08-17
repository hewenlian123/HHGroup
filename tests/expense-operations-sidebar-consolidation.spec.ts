import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  REPORTS: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

function visibleSidebar(page: Page): Locator {
  return page.locator("[data-app-sidebar]:visible").first();
}

async function ensureFinancialSectionOpen(page: Page) {
  const sidebar = visibleSidebar(page);
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  const toggle = sidebar.getByRole("button", { name: /^FINANCIAL$/ }).first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

async function expectExpenseOperationsActive(page: Page) {
  await ensureFinancialSectionOpen(page);
  const link = visibleSidebar(page).getByRole("link", { name: "Expense Operations", exact: true });
  await expect(link).toHaveAttribute("href", "/financial/expenses");
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(link).toHaveClass(/text-white/);
}

test.describe("Expense Operations sidebar consolidation", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((sections) => {
      window.localStorage.setItem("hh.sidebarCollapsed", "0");
      window.localStorage.setItem("hh.sidebarSections", JSON.stringify(sections));
    }, OPEN_SECTIONS);
    await loginAsE2EOwner(page, "/financial/expenses");
  });

  test("uses one desktop parent entry across canonical child routes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of [
      { path: "/financial/expenses", breadcrumb: "Financial › AP › Expenses" },
      { path: "/financial/inbox", breadcrumb: "Financial › AP › Receipt Inbox" },
      {
        path: "/financial/inbox/worker",
        breadcrumb: "Financial › AP › Receipt Inbox › Worker Submitted",
      },
      { path: "/labor/reimbursements", breadcrumb: "Financial › AP › Reimbursements" },
    ]) {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${route.path.replaceAll("/", "\\/")}(?:[?#].*)?$`));
      await expectExpenseOperationsActive(page);
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveAttribute(
        "title",
        route.breadcrumb
      );
    }

    const sidebar = visibleSidebar(page);
    await expect(
      sidebar.getByRole("link", { name: "Expense Operations", exact: true })
    ).toHaveCount(1);
    await expect(sidebar.getByRole("link", { name: "Expenses", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Receipt Inbox", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Reimbursements", exact: true })).toHaveCount(0);

    await page.screenshot({
      path: "test-results/expense-operations-navigation-desktop.png",
      fullPage: false,
    });
  });

  test("keeps compatibility routes and command search valid", async ({ page }) => {
    await page.goto("/financial/receipt-queue", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/financial\/inbox(?:[?#].*)?$/);
    await expectExpenseOperationsActive(page);

    await page.goto("/labor/receipts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/financial\/inbox\/worker(?:[?#].*)?$/);
    await expectExpenseOperationsActive(page);

    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await expect(palette).toBeVisible();
    await page.getByRole("combobox").fill("expense operations");
    await expect(palette.getByRole("option", { name: /Go to Expense Operations/ })).toBeVisible();
    await page.getByRole("combobox").fill("receipt inbox");
    await expect(palette.getByRole("option", { name: /Go to Receipt Inbox/ })).toBeVisible();
  });

  test("keeps one mobile drawer entry and the Financial bottom-nav owner", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/financial/inbox/worker", { waitUntil: "domcontentloaded" });

    const bottomNav = page.getByRole("navigation", { name: "Bottom navigation" });
    await expect(bottomNav.getByRole("link", { name: "Financial", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.getByRole("button", { name: /^Open menu$/i }).click();
    await ensureFinancialSectionOpen(page);
    const sidebar = visibleSidebar(page);
    await expect(
      sidebar.getByRole("link", { name: "Expense Operations", exact: true })
    ).toHaveCount(1);
    await expect(sidebar.getByRole("link", { name: "Expenses", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Receipt Inbox", exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Reimbursements", exact: true })).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: "test-results/expense-operations-navigation-mobile.png",
      fullPage: false,
    });
  });
});
