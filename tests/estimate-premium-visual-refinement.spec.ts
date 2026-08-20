import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const DENSE_ESTIMATE_ID = "edc68a63-cb87-4298-8231-9c668bf43ffe";
const SCREENSHOT_DIR = "/private/tmp/hh-estimate-premium-screenshots";

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

test("dense Estimate uses the premium flattened hierarchy", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

  const scopePanel = page.locator(".eb-scope-work-panel");
  const summary = page.locator(".eb-pricing-summary-strip");
  const summaryCell = summary.locator(".eb-pricing-summary-cell").first();
  const totalCell = summary.locator(".eb-pricing-summary-cell.is-total");
  const description = page.locator(".eb-scope-description-readonly").first();
  const sectionChip = page.locator(".eb-section-header-chip").first();

  await expect(scopePanel).toBeVisible();
  await expect(summary).toBeVisible();
  await expect(page.locator("[data-estimate-line-item-id]")).toHaveCount(62);
  await expect
    .poll(() => scopePanel.evaluate((node) => getComputedStyle(node).boxShadow))
    .toBe("none");
  await expect
    .poll(() => summaryCell.evaluate((node) => getComputedStyle(node).borderRightWidth))
    .toBe("0px");
  await expect
    .poll(() => totalCell.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(() => description.evaluate((node) => getComputedStyle(node).borderTopWidth))
    .toBe("0px");
  await expect
    .poll(() => sectionChip.evaluate((node) => getComputedStyle(node).backdropFilter))
    .toBe("none");

  const sectionTotal = page.locator(".eb-scope-block-total:visible").first();
  const firstLineTotal = page.locator(".eb-line-total-amount:visible").first();
  const [sectionBox, lineBox] = await Promise.all([
    sectionTotal.boundingBox(),
    firstLineTotal.boundingBox(),
  ]);
  expect(sectionBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(
    Math.abs(
      (sectionBox?.x ?? 0) + (sectionBox?.width ?? 0) - ((lineBox?.x ?? 0) + (lineBox?.width ?? 0))
    )
  ).toBeLessThanOrEqual(4);

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-view-1440");
});

test("desktop Edit fields stay quiet by default and explicit on focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await page.getByTestId("estimate-detail-header").getByRole("button", { name: "Edit" }).click();

  const quantity = page.getByLabel("Line item quantity").first();
  await expect(quantity).toBeVisible();
  const initial = await quantity.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      border: style.borderTopColor,
      background: style.backgroundColor,
      shadow: style.boxShadow,
    };
  });
  expect(initial.border).toBe("rgba(0, 0, 0, 0)");
  expect(initial.background).toBe("rgb(250, 250, 249)");
  expect(initial.shadow).toBe("none");

  await quantity.focus();
  await expect
    .poll(() =>
      quantity.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          border: style.borderTopColor,
          shadow: style.boxShadow,
        };
      })
    )
    .toEqual({
      border: "rgba(23, 23, 23, 0.45)",
      shadow: "rgba(23, 23, 23, 0.18) 0px 0px 0px 2px",
    });

  const descriptionEditor = page.getByRole("textbox", { name: "Line item description" }).first();
  await descriptionEditor.focus();
  await expect
    .poll(() =>
      descriptionEditor.locator("..").evaluate((node) => getComputedStyle(node).boxShadow)
    )
    .not.toBe("none");

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "existing-edit-1440");
});

test("New Estimate shares the flattened workspace language", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const scopePanel = page.locator(".eb-scope-work-panel");
  const summary = page.locator(".eb-pricing-summary-strip");
  await expect(scopePanel).toBeVisible();
  await expect(summary).toBeVisible();
  await expect
    .poll(() => scopePanel.evaluate((node) => getComputedStyle(node).boxShadow))
    .toBe("none");
  await expect
    .poll(() =>
      summary
        .locator(".eb-pricing-summary-cell")
        .first()
        .evaluate((node) => getComputedStyle(node).borderRightWidth)
    )
    .toBe("0px");
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "new-1440");
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`premium Estimate remains usable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await page.getByRole("heading", { name: "Scope of work" }).scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 390) {
      await page
        .getByTestId("estimate-detail-header")
        .getByRole("button", { name: "Edit" })
        .click();
      const mobileSummary = page.locator(".eb-line-item-mobile-summary").first();
      await expect(mobileSummary).toBeVisible();
      const metrics = await mobileSummary.evaluate((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return { border: style.borderTopWidth, height: box.height };
      });
      expect(Number.parseFloat(metrics.border)).toBeGreaterThan(0);
      expect(metrics.height).toBeGreaterThanOrEqual(44);

      const scopeSearch = page.locator(".eb-scope-toolbar-search-wrap > input");
      const searchBox = await scopeSearch.boundingBox();
      expect(searchBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await capture(page, testInfo, `existing-view-${viewport.name}`);
  });
}
