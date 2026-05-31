import { expect, test, type Page } from "@playwright/test";

import { E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";

const TAB_ALIAS_SMOKE: Array<{ query: string; tab: string }> = [
  { query: "financial", tab: "Financial" },
  { query: "schedule", tab: "Schedule" },
  { query: "tasks", tab: "Tasks" },
  { query: "documents", tab: "Documents" },
  { query: "materials", tab: "Materials" },
  { query: "closeout", tab: "Closeout" },
];

async function expectNoAppError(page: Page) {
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

async function waitForAppReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("[data-app-scroll-root], main").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page
      .locator("body")
      .getByText(/^Loading…$/)
      .first()
  )
    .not.toBeVisible({ timeout: 60_000 })
    .catch(() => undefined);
  await expectNoAppError(page);
}

async function firstProjectPath(page: Page): Promise<string> {
  await page.goto("/projects", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  return `/projects/${E2E_PRESERVED_PROJECT_ID}`;
}

async function expectWorkspaceTabs(page: Page) {
  const tabList = page.getByRole("tablist", { name: "Project workspace sections" });
  await expect(tabList).toBeVisible({ timeout: 30_000 });
  for (const label of [
    "Overview",
    "Financial",
    "Schedule",
    "Tasks",
    "People",
    "Documents",
    "Photos",
    "Materials",
    "Inspections",
    "Closeout",
  ]) {
    await expect(page.getByRole("tab", { name: label })).toHaveCount(1);
  }
}

test.describe("Project Workspace V3 shell", () => {
  test("desktop routes and tab aliases render the V3 workspace", async ({ page }) => {
    const projectPath = await firstProjectPath(page);

    await page.goto(projectPath, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expectWorkspaceTabs(page);
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active"
    );

    for (const route of TAB_ALIAS_SMOKE) {
      await page.goto(`${projectPath}?tab=${route.query}`, { waitUntil: "domcontentloaded" });
      await waitForAppReady(page);
      await expectWorkspaceTabs(page);
      await expect(page.getByRole("tab", { name: route.tab })).toHaveAttribute(
        "data-state",
        "active"
      );
    }
  });

  test("mobile tab rail stays usable without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const projectPath = await firstProjectPath(page);

    await page.goto(projectPath, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expectWorkspaceTabs(page);

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(pageOverflow).toBeLessThanOrEqual(1);

    const tabList = page.getByRole("tablist", { name: "Project workspace sections" });
    await tabList.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect(page.getByRole("tab", { name: "Closeout" })).toBeVisible();
  });
});
