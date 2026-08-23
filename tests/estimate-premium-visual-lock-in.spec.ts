import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const DENSE_ESTIMATE_ID = "edc68a63-cb87-4298-8231-9c668bf43ffe";
const SCREENSHOT_DIR = "/private/tmp/hh-estimate-final-acceptance-after";

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

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Existing Estimate locks typography, context, summary, and Builder rhythm", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

  const contextPanel = page
    .getByTestId("estimate-details-summary")
    .locator(".eb-estimate-context-panel");
  const contextLabel = contextPanel.locator(".eb-estimate-context-label").first();
  const summary = page.locator(".eb-pricing-summary-strip");
  const summaryLabel = summary.locator(".eb-pricing-summary-cell > span").first();
  const totalValue = summary.locator(".eb-pricing-summary-cell.is-total > strong");
  const regularValue = summary.locator(".eb-pricing-summary-cell > strong").first();
  const scopeSearch = page.locator(".eb-scope-toolbar-search-wrap > input");
  const sectionJump = page.locator(".eb-scope-jump-wrap");
  const sectionTitle = page.locator(".eb-scope-block-title").first();
  const itemCount = page.locator(".eb-scope-section-item-count").first();

  await expect(contextPanel).toBeVisible();
  await expect(summary).toBeVisible();
  await expect(page.locator("[data-estimate-line-item-id]")).toHaveCount(62);

  await expect
    .poll(() =>
      contextPanel.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          borderLeft: style.borderLeftWidth,
          radius: style.borderRadius,
          shadow: style.boxShadow,
        };
      })
    )
    .toEqual({ borderLeft: "0px", radius: "0px", shadow: "none" });

  await expect
    .poll(() =>
      contextLabel.evaluate((node) => {
        const style = getComputedStyle(node);
        return { letterSpacing: style.letterSpacing, textTransform: style.textTransform };
      })
    )
    .toEqual({ letterSpacing: "normal", textTransform: "none" });

  await expect
    .poll(() => summaryLabel.evaluate((node) => getComputedStyle(node).textTransform))
    .toBe("none");
  const [totalFont, regularFont] = await Promise.all([
    totalValue.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    regularValue.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
  ]);
  expect(totalFont).toBeGreaterThan(regularFont);

  const [searchMetrics, jumpMetrics] = await Promise.all(
    [scopeSearch, sectionJump].map((locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          height: box.height,
          radius: style.borderRadius,
        };
      })
    )
  );
  expect(searchMetrics).toEqual(jumpMetrics);
  expect(searchMetrics).toEqual({ background: "rgb(250, 250, 249)", height: 32, radius: "6px" });

  const [sectionTypography, itemCountTypography] = await Promise.all(
    [sectionTitle, itemCount].map((locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10),
        };
      })
    )
  );
  expect(sectionTypography.fontSize).toBeGreaterThanOrEqual(16);
  expect(sectionTypography.fontWeight).toBeGreaterThan(itemCountTypography.fontWeight);

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-view-1440");
});

test("Existing Edit Details presents primary relationships and supporting context", async ({
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
  const customerLabel = dialog.getByText("Customer", { exact: true }).first();

  await expect(
    dialog.locator(".eb-sheet-title").getByText("Estimate details", { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByText("Customer, project, document context, and commercial terms.")
  ).toBeVisible();
  await expect(primary.getByLabel("Customer")).toBeVisible();
  await expect(primary.getByLabel("Project / reference")).toBeVisible();
  await expect(supporting.getByLabel("Address")).toBeVisible();
  await expect(supporting.getByText("Estimate date", { exact: true })).toBeVisible();
  await expect(supporting.getByText("Estimate style", { exact: true })).toBeVisible();
  await expect(terms.getByText("Terms & pricing", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      primary.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderTopWidth,
          padding: style.paddingTop,
          radius: style.borderRadius,
        };
      })
    )
    .toEqual({
      background: "rgba(0, 0, 0, 0)",
      border: "0px",
      padding: "0px",
      radius: "0px",
    });
  await expect
    .poll(() => customerLabel.evaluate((node) => getComputedStyle(node).textTransform))
    .toBe("none");

  const customer = primary.getByLabel("Customer");
  await customer.focus();
  await expect
    .poll(() => customer.evaluate((node) => getComputedStyle(node).boxShadow))
    .toBe("rgba(23, 23, 23, 0.18) 0px 0px 0px 2px");
  await customer.blur();

  const validUntilShortcut = dialog.getByRole("button", { name: "7 days", exact: true });
  await expect(validUntilShortcut).toBeVisible();
  await expect
    .poll(() =>
      validUntilShortcut.evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, color: style.color };
      })
    )
    .toEqual({ background: "rgb(255, 255, 255)", color: "rgb(79, 79, 76)" });

  const save = dialog.getByRole("button", { name: "Save", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const [saveBox, cancelBox] = await Promise.all([save.boundingBox(), cancel.boundingBox()]);
  expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(cancelBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(saveBox?.x ?? 0).toBeGreaterThan(cancelBox?.x ?? 0);

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "edit-details-1440");
});

test("New Estimate uses the same Edit Details hierarchy", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const templatePanel = page
    .getByTestId("estimate-template-selector")
    .locator(":scope > .eb-glass-panel");
  await expect(templatePanel).toBeVisible();
  await expect
    .poll(() =>
      templatePanel.evaluate((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          border: style.borderTopWidth,
          height: Math.round(box.height),
          radius: style.borderRadius,
          shadow: style.boxShadow,
        };
      })
    )
    .toEqual({
      background: "rgba(0, 0, 0, 0)",
      border: "0px",
      height: 52,
      radius: "0px",
      shadow: "none",
    });

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
  await page
    .getByLabel("Line item 1 description")
    .locator("visible=true")
    .fill("Coordinate occupied-site access, temporary protection, staging, cleanup, and closeout.");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true").fill("LS");
  await page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true")
    .fill("18500");

  await page.getByLabel("Line item 2 title").locator("visible=true").fill("Finish carpentry");
  await page
    .getByLabel("Line item 2 description")
    .locator("visible=true")
    .fill("Field verify, fabricate, install, protect, and complete final punch work.");
  await page.getByLabel("Line item 2 quantity").locator("visible=true").fill("120");
  await page.getByLabel("Line item 2 unit", { exact: true }).locator("visible=true").fill("LF");
  await page
    .getByLabel("Line item 2 unit price", { exact: true })
    .locator("visible=true")
    .fill("145.75");

  await page.evaluate(() => {
    window.scrollTo({ top: 0 });
    document.querySelector<HTMLElement>("[data-app-scroll-root]")?.scrollTo({ top: 0 });
  });
  await capture(page, testInfo, "new-1440");
});

test("Existing Estimate Edit keeps the unified control system", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await enterExistingEdit(page);

  const quantity = page.getByLabel("Line item quantity").first();
  const richText = page.getByRole("textbox", { name: "Line item description" }).first();
  await expect(quantity).toBeVisible();
  await expect(richText).toBeVisible();

  const defaultControl = await quantity.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      radius: style.borderRadius,
    };
  });
  expect(defaultControl).toEqual({
    background: "rgb(250, 250, 249)",
    border: "rgba(0, 0, 0, 0)",
    radius: "6px",
  });

  await richText.focus();
  await expect
    .poll(() => richText.locator("..").evaluate((node) => getComputedStyle(node).boxShadow))
    .toBe("rgba(23, 23, 23, 0.18) 0px 0px 0px 2px");

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-edit-1440");
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`premium Estimate remains comfortable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 390) {
      const scopeTop = await page
        .getByRole("heading", { name: "Scope of work" })
        .evaluate((node) => Math.round(node.getBoundingClientRect().top));
      testInfo.annotations.push({ type: "mobile-scope-top", description: String(scopeTop) });
      expect(scopeTop).toBeLessThanOrEqual(520);

      const headerActions = page.getByTestId("estimate-detail-header-actions");
      const preview = headerActions.getByRole("link", { name: "Preview", exact: true });
      const edit = headerActions.getByRole("button", { name: "Edit", exact: true });
      const more = headerActions.getByRole("button", { name: "More estimate actions" });
      await expect(preview).toBeVisible();
      await expect(edit).toBeVisible();
      await expect(more).toBeVisible();

      const actionMetrics = await Promise.all(
        [headerActions, preview, edit, more].map((locator) =>
          locator.evaluate((node) => {
            const box = node.getBoundingClientRect();
            return { height: Math.round(box.height), width: Math.round(box.width) };
          })
        )
      );
      expect(actionMetrics[0]?.height).toBeLessThanOrEqual(44);
      for (const metric of actionMetrics.slice(1)) {
        expect(metric.height).toBeGreaterThanOrEqual(44);
        expect(metric.width).toBeGreaterThanOrEqual(44);
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
        .getByRole("heading", { name: "Scope of work" })
        .evaluate((node) => node.scrollIntoView({ block: "start" }));
      await capture(page, testInfo, "existing-builder-mobile-390");
      await enterExistingEdit(page);
      await openEstimateDetails(page);
      const dialog = page.getByRole("dialog", {
        name: "Customer / project / pricing details",
      });
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(374);
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

test("Edit Details remains composed at 1280", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await enterExistingEdit(page);
  await openEstimateDetails(page);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "edit-details-1280");
});
