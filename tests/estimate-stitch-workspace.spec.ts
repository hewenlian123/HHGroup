// PRESENTATION SNAPSHOT: task-scoped evidence for the current implementation only.
// Explicit user-requested redesign may replace or retire these presentation assertions.
// This file is not permanent UI authority.

import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./estimate-playwright-test";
import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import {
  seedEstimateFinancialFixture,
  cleanupEstimateFinancialFixture,
  ESTIMATE_FINANCIAL_FIXTURE_ID,
  ESTIMATE_FINANCIAL_FIXTURE_BASELINE,
} from "./estimate-financial-fixture";

test.use({ actionTimeout: 10_000 });
const failedResponses: string[] = [];
test.beforeEach(async ({ page }) => {
  failedResponses.length = 0;
  page.on("response", (response) => {
    if (response.url().startsWith("http://localhost:3000/") && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
});
test.afterEach(() => expect(failedResponses, "Local Estimate HTTP failures").toEqual([]));

test("Stitch workspace preserves real edits, totals, responsive layout and route isolation", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await seedEstimateFinancialFixture();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    const header = page.getByTestId("estimate-detail-header");
    await expect(header).toBeVisible();
    const summary = page.getByRole("region", { name: "Estimate pricing summary" });
    await expect(summary).toContainText(ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total);
    await expect(page.locator("[data-app-sidebar]")).toHaveCount(1);
    await expect(page.locator('[data-canonical-estimate-workspace="read"]')).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Scope of work statement", exact: true })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("stitch-desktop-overview.png") });
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const inspect = page.getByRole("button", { name: "Inspect line 1", exact: true });
    await page
      .locator(".estimate-stitch-rows .estimate-stitch-data-row")
      .first()
      .click({ position: { x: 2, y: 2 } });
    await expect(inspect).toHaveAttribute("aria-pressed", "true");
    const inspector = page.getByRole("region", { name: "Item inspector" });
    await expect(inspector).toBeVisible();
    const title = inspector.getByRole("textbox", { name: "Line item title", exact: true });
    await expect(title).toBeFocused();
    await title.fill("PW Stitch persisted title");
    await title.press("Tab");
    await expect(header).toContainText(/Saved/);
    const quantity = inspector.getByRole("spinbutton", { name: "Line item quantity" });
    const unit = inspector.getByRole("combobox", { name: "Line item unit", exact: true });
    await quantity.fill("2");
    await expect(summary.locator(".estimate-stitch-running-total")).toContainText("$840.02");
    await expect(summary.locator(".estimate-stitch-running-total")).toContainText("+$420.01");
    await expect(summary.locator(".estimate-stitch-running-total")).toContainText("$1,381.27");
    await expect(header.locator('[aria-label="Estimate total (preview): $1,381.27"]')).toHaveCount(
      1
    );
    await quantity.press("Tab");
    await expect(header).toContainText(/Saved/);
    const quantityBox = await quantity.boundingBox();
    const unitBox = await unit.boundingBox();
    expect(quantityBox).not.toBeNull();
    expect(unitBox).not.toBeNull();
    expect(Math.abs(quantityBox!.y - unitBox!.y)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath("stitch-desktop-item.png") });
    await inspector.getByRole("button", { name: "Summary", exact: true }).click();
    await expect(summary).toContainText("$1,381.27");
    await expect(inspect).toHaveAttribute("aria-pressed", "true");
    await inspect.click();
    await expect(inspector).toBeVisible();
    await reloadWithE2EAuth(page);
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    await expect(title).toHaveValue("PW Stitch persisted title");
    await expect(quantity).toHaveValue("2");
    const search = page.getByRole("combobox", { name: "Search scope", exact: true });
    await search.fill("Install SPC flooring");
    await search.press("Enter");
    await expect(title).toHaveValue("Install SPC flooring");
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    await expect(title).toHaveValue("PW Stitch persisted title");
    const selectedSection = page.locator('[data-estimate-section-id="010000"]');
    await selectedSection.getByRole("button", { name: "Collapse section", exact: true }).click();
    await expect(inspector).toHaveCount(0);
    await expect(page.locator("[data-stitch-selected=true]")).toHaveCount(0);
    await selectedSection.getByRole("button", { name: "Expand section", exact: true }).click();
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 900 },
      { width: 1024, height: 1000 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(inspector).toBeVisible();
      await quantity.scrollIntoViewIfNeeded();
      await expect(quantity).toBeVisible();
      await expect(unit).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const root = document.documentElement;
            const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
            return Math.max(
              root.scrollWidth - root.clientWidth,
              app ? app.scrollWidth - app.clientWidth : 0
            );
          })
        )
        .toBeLessThanOrEqual(1);
      const flow = page.locator(".eb-v3-worksheet-flow");
      if (viewport.width < 1200) {
        const flowBox = await flow.boundingBox();
        const workbenchBox = await page.locator(".eb-estimate-workbench--v3").boundingBox();
        expect(flowBox!.width).toBeGreaterThan(workbenchBox!.width - 60);
      }
      const toolbar = page.getByRole("toolbar", { name: "Scope tools" });
      const toolbarBox = await toolbar.boundingBox();
      const addBox = await toolbar
        .getByRole("button", { name: "Add Section", exact: true })
        .boundingBox();
      expect(addBox!.y + addBox!.height).toBeLessThanOrEqual(toolbarBox!.y + toolbarBox!.height);
      await page.screenshot({ path: testInfo.outputPath(`stitch-${viewport.width}.png`) });
    }
    await inspector.getByRole("button", { name: "Summary", exact: true }).click();
    await expect(inspector).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator("[data-app-sidebar]")
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects(?:\?|$)/);
    await expect(page.locator('[data-integrated-estimate-workspace="true"]')).toHaveCount(0);
    await expect(page.locator("[data-canonical-estimate-workspace]")).toHaveCount(0);
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});

test("Stitch inspector keeps failed drafts, retries real saves and supports keyboard exit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedEstimateFinancialFixture();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    const header = page.getByTestId("estimate-detail-header");
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    const inspector = page.getByRole("region", { name: "Item inspector" });
    const title = inspector.getByRole("textbox", { name: "Line item title", exact: true });
    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      let failNext = true;
      window.fetch = async (input, init) => {
        if (
          failNext &&
          init?.method?.toUpperCase() === "POST" &&
          new Headers(init.headers).has("Next-Action")
        ) {
          failNext = false;
          throw new TypeError("Temporary network failure. Please try again.");
        }
        return nativeFetch(input, init);
      };
    });
    await title.fill("PW failed draft retained");
    await title.press("Tab");
    await expect(header).toContainText(/Save failed/);
    await expect(title).toHaveValue("PW failed draft retained");
    await header.getByRole("button", { name: "Save", exact: true }).click();
    await expect(header.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await reloadWithE2EAuth(page);
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    await expect(title).toHaveValue("PW failed draft retained");
    const qty = inspector.getByRole("spinbutton", { name: "Line item quantity" });
    await qty.fill("3");
    await qty.press("Escape");
    await expect(inspector).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inspect line 1", exact: true })).toBeFocused();
    await expect(header).toContainText(/Saved/);
    await reloadWithE2EAuth(page);
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
    await expect(qty).toHaveValue("3");
    const accessibility = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});

test("Stitch core controls remain accessible across required viewports", async ({ page }) => {
  test.setTimeout(120_000);
  await seedEstimateFinancialFixture();
  try {
    await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    await page
      .getByTestId("estimate-detail-header")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page.waitForLoadState("networkidle");
    let unchangedSaveRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        new URL(request.url()).pathname === `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`
      ) {
        unchangedSaveRequests += 1;
      }
    });
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      console.log(`Checking core accessibility at ${width}px`);
      await page.getByRole("button", { name: "Inspect line 1", exact: true }).click();
      const inspector = page.getByRole("region", { name: "Item inspector" });
      await expect(inspector).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations, `Accessibility at ${width}px`).toEqual([]);
      if (width < 1200) {
        expect(
          (await inspector.getByRole("spinbutton", { name: "Line item quantity" }).boundingBox())!
            .height
        ).toBeGreaterThanOrEqual(44);
      }
      await inspector.getByRole("button", { name: "Summary", exact: true }).click();
    }
    await page.emulateMedia({ forcedColors: "active" });
    const trigger = page.getByRole("button", { name: "Inspect line 1", exact: true });
    await trigger.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveCSS("outline-style", "solid");
    await trigger.press("Enter");
    await expect(page.getByRole("region", { name: "Item inspector" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.emulateMedia({ forcedColors: "none" });
    await page.waitForLoadState("networkidle");
    expect(unchangedSaveRequests).toBe(0);
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});

test("New and saved Estimate modes share one workspace and Preview returns to the saved document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedEstimateFinancialFixture();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, "/estimates/new");
    const workspace = page.locator("[data-canonical-estimate-workspace]");
    await expect(workspace).toHaveCount(1);
    await expect(workspace).toHaveAttribute("data-canonical-estimate-workspace", "new");
    await expect(
      workspace.getByRole("heading", { name: "Scope of work statement", exact: true })
    ).toBeVisible();
    await expect(workspace.getByRole("region", { name: "Estimate pricing summary" })).toBeVisible();
    const newHeader = page.getByTestId("estimate-new-header");
    await expect(newHeader.getByRole("button", { name: "Preview", exact: true })).toBeVisible();
    await expect(
      newHeader.getByRole("button", { name: "Save Estimate", exact: true })
    ).toBeVisible();
    await gotoWithE2EAuth(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    await expect(workspace).toHaveCount(1);
    await expect(workspace).toHaveAttribute("data-canonical-estimate-workspace", "read");
    const header = page.getByTestId("estimate-detail-header");
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(workspace).toHaveAttribute("data-canonical-estimate-workspace", "edit");
    await expect(
      workspace.getByRole("heading", { name: "Scope of work statement", exact: true })
    ).toBeVisible();
    await header.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}/preview`));
    await expect(page.getByTestId("estimate-document")).toContainText(
      ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total
    );
    await expect(workspace).toHaveCount(0);
    await page.getByRole("link", { name: "Back to estimate", exact: true }).click();
    await expect(workspace).toHaveAttribute("data-canonical-estimate-workspace", "read");
    await expect(workspace.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
      ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total
    );
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});
