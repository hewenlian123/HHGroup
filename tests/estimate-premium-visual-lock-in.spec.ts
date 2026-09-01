import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  captureUnexpectedBrowserErrors,
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_ID,
  DENSE_ESTIMATE_NUMBER,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";

const SCREENSHOT_DIR = "/private/tmp/hh-estimate-final-acceptance-after";
const browserErrors = new WeakMap<Page, string[]>();

test.beforeAll(seedDenseEstimateFixture);
test.afterAll(cleanupDenseEstimateFixture);

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

async function enterExistingEdit(page: Page): Promise<void> {
  await page
    .getByTestId("estimate-detail-header")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
}

async function openEstimateDetails(page: Page): Promise<void> {
  await page
    .getByTestId("estimate-detail-header")
    .getByRole("button", { name: "Edit details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Customer / project / pricing details" })
  ).toBeVisible();
}

async function fillNewLineDescription(page: Page, ordinal: number, value: string): Promise<void> {
  const name = `Line item ${ordinal} description`;
  await page.getByRole("button", { name, exact: true }).locator("visible=true").click();
  const editor = page.getByRole("textbox", { name, exact: true }).locator("visible=true");
  await editor.fill(value);
  await page.getByTestId("estimate-description-done").locator("visible=true").click();
  await expect(
    page.getByRole("button", { name, exact: true }).locator("visible=true")
  ).toContainText(value);
}

test.beforeEach(async ({ page }) => {
  browserErrors.set(page, captureUnexpectedBrowserErrors(page));
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test.afterEach(({ page }) => expect(browserErrors.get(page) ?? []).toEqual([]));

test("Existing Estimate exposes the V3 command, worksheet navigation, scope, and pricing hierarchy", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

  await expect(page.getByTestId("estimate-detail-header")).toContainText(DENSE_ESTIMATE_NUMBER);
  await expect(page.getByTestId("estimate-details-summary")).toContainText(
    "[E2E] Pacific Heritage Construction Partners"
  );
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  await expect(scopeTools).toBeVisible();
  const sectionJump = scopeTools.getByLabel("Jump to section");
  await expect(sectionJump.locator("option")).toHaveCount(10);
  await expect(sectionJump.locator("option").first()).toHaveText(
    "Certified Dense Scope 1 · 7 items"
  );
  await expect(page.getByRole("combobox", { name: "Search scope" })).toBeVisible();
  await expect(page.locator("[data-estimate-line-item-id]")).toHaveCount(62);

  const pricing = page.getByRole("region", { name: "Estimate pricing summary" });
  await expect(pricing).toBeVisible();
  await expect(pricing).toContainText("$3,253,937.00");
  await expect(pricing).toContainText("5 milestones");

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-view-1440");
});

test("Existing Edit Details separates information from current pricing controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await enterExistingEdit(page);
  await openEstimateDetails(page);

  const dialog = page.getByRole("dialog", { name: "Customer / project / pricing details" });
  const primary = dialog.getByTestId("estimate-details-primary-relationships");
  const supporting = dialog.getByTestId("estimate-details-supporting-context");
  const terms = dialog.getByTestId("estimate-details-terms");

  await expect(dialog.getByText("Estimate Information", { exact: true })).toBeVisible();
  await expect(primary.getByLabel("Customer")).toHaveValue(
    "[E2E] Pacific Heritage Construction Partners"
  );
  await expect(primary.getByLabel("Project / reference")).toBeVisible();
  await expect(supporting.getByLabel("Site address")).toBeVisible();
  await expect(supporting.getByText("Estimate date", { exact: true })).toBeVisible();
  await expect(supporting.getByText("Estimate style", { exact: true })).toBeVisible();
  await expect(terms).toBeHidden();

  const customer = primary.getByLabel("Customer");
  await customer.focus();
  await expect(customer).toBeFocused();

  const save = dialog.getByRole("button", { name: "Save", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const [saveBox, cancelBox] = await Promise.all([save.boundingBox(), cancel.boundingBox()]);
  expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(cancelBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await cancel.click();

  await page
    .getByRole("region", { name: "Estimate pricing summary" })
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await expect(dialog.getByText("Advanced Pricing", { exact: true })).toBeVisible();
  await expect(primary).toBeHidden();
  await expect(supporting).toBeHidden();
  await expect(terms).toBeVisible();
  await expect(terms.getByTestId("estimate-pricing-live-summary")).toContainText("$3,253,937.00");
  await expect(terms).toContainText(
    "Internal overhead and profit references are stored for planning only"
  );

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "edit-details-1440");
});

test("New Estimate uses V2 details and the collapsed-description interaction", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  await expect(page.getByTestId("estimate-new-header")).toContainText("New Estimate");
  await expect(page.getByTestId("estimate-template-selector")).toBeVisible();

  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Customer / project / pricing details" });
  const primary = dialog.getByTestId("estimate-details-primary-relationships");
  const supporting = dialog.getByTestId("estimate-details-supporting-context");
  const terms = dialog.getByTestId("estimate-details-terms");

  await expect(dialog).toBeVisible();
  await expect(primary.getByText("Link customer", { exact: true })).toBeVisible();
  await expect(primary.getByLabel("Customer")).toBeVisible();
  await expect(primary.getByLabel("Project / reference")).toBeVisible();
  await expect(supporting.getByLabel("Address")).toBeVisible();
  await expect(supporting.getByText("Estimate style", { exact: true })).toBeVisible();
  await expect(terms.getByText("Terms & pricing", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await primary.getByRole("button", { name: "Select customer", exact: true }).click();
  const customerPicker = page.getByRole("dialog", { name: "Select customer" });
  await expect(customerPicker.getByPlaceholder("Search by name or email")).toBeVisible();
  await customerPicker.getByPlaceholder("Search by name or email").fill("__no_local_match__");
  await expect(customerPicker.getByText("No customers found.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(customerPicker).toBeHidden();

  await dialog.getByLabel("Customer", { exact: true }).fill("Discarded customer");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await dialog
    .getByLabel("Customer", { exact: true })
    .fill("Kūpuna Ridge Hospitality & Residential Holdings, Limited Partnership");
  await dialog
    .getByLabel("Project / reference")
    .fill("Oceanfront Estate Renovation — Guest Pavilion and Site Utility Modernization");
  await dialog
    .getByLabel("Address")
    .fill("72-1100 Coastal Ridge Drive, Kailua-Kona, Hawaiʻi 96740");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  for (let sectionIndex = 0; sectionIndex < 2; sectionIndex += 1) {
    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /^Blank section$/i }).click();
  }

  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Site logistics setup");
  await fillNewLineDescription(
    page,
    1,
    "Coordinate occupied-site access, temporary protection, staging, cleanup, and closeout."
  );
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true").fill("LS");
  await page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true")
    .fill("18500");

  await page.getByLabel("Line item 2 title").locator("visible=true").fill("Finish carpentry");
  await fillNewLineDescription(
    page,
    2,
    "Field verify, fabricate, install, protect, and complete final punch work."
  );
  await page.getByLabel("Line item 2 quantity").locator("visible=true").fill("120");
  await page.getByLabel("Line item 2 unit", { exact: true }).locator("visible=true").fill("LF");
  await page
    .getByLabel("Line item 2 unit price", { exact: true })
    .locator("visible=true")
    .fill("145.75");

  await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
    "$35,990.00"
  );
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "new-1440");
});

test("Existing Estimate Edit exposes accessible, focusable line controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await enterExistingEdit(page);

  const quantity = page.getByLabel("Line item quantity").first();
  await expect(quantity).toBeVisible();
  await expect(quantity).toBeEditable();
  await quantity.focus();
  await expect(quantity).toBeFocused();

  const descriptionButton = page.getByRole("button", { name: "Line item description" }).first();
  if (await descriptionButton.isVisible()) await descriptionButton.click();
  const richText = page.getByRole("textbox", { name: "Line item description" }).first();
  await expect(richText).toBeVisible();
  await expect(richText).toBeEditable();
  await richText.focus();
  await expect(richText).toBeFocused();

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-edit-1440");
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`Certified V2 Estimate remains usable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Scope tools" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 390) {
      const headerActions = page.getByTestId("estimate-detail-header-actions");
      const preview = headerActions.getByRole("link", { name: "Preview", exact: true });
      const edit = headerActions.getByRole("button", { name: "Edit", exact: true });
      const more = headerActions.getByRole("button", { name: "More estimate actions" });
      await expect(preview).toBeVisible();
      await expect(edit).toBeVisible();
      await expect(more).toBeVisible();

      for (const control of [preview, edit, more]) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }

      await more.click();
      await expect(page.getByRole("menuitem", { name: "Mark as Sent", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Mark as Draft" })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: "Save as Template" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Delete estimate" })).toBeVisible();
      await page.keyboard.press("Escape");

      const supportingContext = page.getByTestId("estimate-mobile-supporting-context");
      await expect(supportingContext).toBeVisible();
      await expect(supportingContext).not.toHaveAttribute("open", "");
      await supportingContext.locator("summary").click();
      await expect(supportingContext.getByText("Address", { exact: true })).toBeVisible();
      await expect(supportingContext.getByText("Estimate date", { exact: true })).toBeVisible();
      await expect(supportingContext.getByText("Estimate style", { exact: true })).toBeVisible();
      await supportingContext.locator("summary").click();

      await capture(page, testInfo, `existing-view-${viewport.name}`);
      await page
        .getByRole("toolbar", { name: "Scope tools" })
        .evaluate((node) => node.scrollIntoView({ block: "start" }));
      await capture(page, testInfo, "existing-builder-mobile-390");
      await enterExistingEdit(page);
      await openEstimateDetails(page);
      const dialog = page.getByRole("dialog", {
        name: "Customer / project / pricing details",
      });
      await expect(dialog).toBeInViewport();
      await expect(dialog.getByRole("textbox", { name: "Customer" })).toHaveCSS(
        "min-height",
        "44px"
      );
      await capture(page, testInfo, "edit-details-mobile-390");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    } else {
      await capture(page, testInfo, `existing-view-${viewport.name}`);
    }
  });
}

test("Edit Details remains visible and overflow-free at 1280", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await enterExistingEdit(page);
  await openEstimateDetails(page);
  await expect(
    page.getByRole("dialog", { name: "Customer / project / pricing details" })
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "edit-details-1280");
});
