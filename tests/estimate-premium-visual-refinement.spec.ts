import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  captureUnexpectedBrowserErrors,
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_ID,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";

const SCREENSHOT_DIR = "/private/tmp/hh-estimate-premium-screenshots";
const browserErrors = new WeakMap<Page, string[]>();

test.beforeAll(seedDenseEstimateFixture);
test.afterAll(cleanupDenseEstimateFixture);
test.beforeEach(({ page }) => browserErrors.set(page, captureUnexpectedBrowserErrors(page)));
test.afterEach(({ page }) => expect(browserErrors.get(page) ?? []).toEqual([]));

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
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
    .toBe(0);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("dense Estimate preserves ordered V3 worksheet scope and exact financial output", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  await expect(scopeTools).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  const sectionJump = scopeTools.getByLabel("Jump to section");
  await expect(sectionJump.locator("option")).toHaveCount(10);
  await expect(sectionJump.locator("option").first()).toHaveText(
    "Certified Dense Scope 1 · 7 items"
  );
  await expect(page.locator("[data-estimate-line-item-id]")).toHaveCount(62);
  await expect(page.getByText("Certified Dense Scope 1", { exact: true }).first()).toBeVisible();

  const summary = page.getByRole("region", { name: "Estimate pricing summary" });
  await expect(summary).toContainText("Subtotal");
  await expect(summary).toContainText("Tax");
  await expect(summary).toContainText("Discount");
  await expect(summary).toContainText("$3,253,937.00");
  await expect(summary).toContainText("5 milestones");

  await page.getByRole("combobox", { name: "Search scope" }).fill("scope line 62");
  await expect(
    page.getByRole("option", { name: /Certified construction scope line 62/ })
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-view-1440");
});

test("desktop Edit exposes keyboard-focusable current line controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await page.getByTestId("estimate-detail-header").getByRole("button", { name: "Edit" }).click();

  const quantity = page.getByLabel("Line item quantity").first();
  await expect(quantity).toBeVisible();
  await expect(quantity).toBeEditable();
  await quantity.focus();
  await expect(quantity).toBeFocused();

  const descriptionButton = page.getByRole("button", { name: "Line item description" }).first();
  if (await descriptionButton.isVisible()) await descriptionButton.click();
  const descriptionEditor = page.getByRole("textbox", { name: "Line item description" }).first();
  await expect(descriptionEditor).toBeVisible();
  await expect(descriptionEditor).toBeEditable();
  await descriptionEditor.focus();
  await expect(descriptionEditor).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-edit-1440");
});

test("New Estimate presents the current V3 command, worksheet, and pricing surfaces", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  await expect(page.getByTestId("estimate-new-header")).toContainText("New Estimate");
  await expect(page.getByTestId("estimate-template-selector")).toBeVisible();
  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  await expect(scopeTools).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  await expect(scopeTools.getByLabel("Jump to section")).toBeHidden();
  await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add Section$/i }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "new-1440");
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`dense V3 Estimate remains usable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await page.getByRole("toolbar", { name: "Scope tools" }).scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 390) {
      await page
        .getByTestId("estimate-detail-header")
        .getByRole("button", { name: "Edit" })
        .click();
      const lineToggle = page.getByRole("button", { name: /Edit line item 1:/ }).first();
      await expect(lineToggle).toBeVisible();
      const lineToggleBox = await lineToggle.boundingBox();
      expect(lineToggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(lineToggleBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      await lineToggle.click();
      await expect(page.getByLabel("Line item 1 quantity").locator("visible=true")).toBeVisible();

      const scopeSearch = page.getByRole("combobox", { name: "Search scope" });
      const searchBox = await scopeSearch.boundingBox();
      expect(searchBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await capture(page, testInfo, `existing-view-${viewport.name}`);
  });
}
