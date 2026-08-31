import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";
import { mkdir } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  captureUnexpectedBrowserErrors,
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_ID,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";

const EVIDENCE_DIR = "/private/tmp/hh-estimate-scope-grid";

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
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const path = `${EVIDENCE_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const viewport of [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`long Estimate Scope grid remains usable at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    const runtimeErrors = captureUnexpectedBrowserErrors(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await page.getByTestId("estimate-detail-header").getByRole("button", { name: "Edit" }).click();
    const scopeToolbar = page.getByRole("toolbar", { name: "Scope tools" });
    await expect(scopeToolbar).toBeVisible({ timeout: 30_000 });
    await scopeToolbar.scrollIntoViewIfNeeded();

    const visibleRows = page.locator(".eb-line-item-grid--pricing:visible");
    const mobileRows = page.locator(
      "[data-estimate-section-mobile-id] [data-estimate-line-item-id]:visible"
    );

    if (viewport.width >= 768) {
      const header = page.getByTestId("estimate-line-item-grid-header").first();
      await expect(header).toBeVisible();
      await expect(header.locator(":scope > *")).toHaveCount(5);
      expect(await visibleRows.count()).toBeGreaterThanOrEqual(50);
      await expect
        .poll(() =>
          visibleRows
            .first()
            .evaluate((row) => getComputedStyle(row).gridTemplateColumns.split(" ").length)
        )
        .toBe(5);
    } else {
      await expect(page.getByTestId("estimate-line-item-grid-header").first()).toBeHidden();
      await expect(visibleRows).toHaveCount(0);
      expect(await mobileRows.count()).toBeGreaterThanOrEqual(50);
      const firstSummary = mobileRows.first().locator(".eb-line-item-mobile-summary");
      await firstSummary.click();
      const mobileUnit = mobileRows.first().getByLabel(/^Line item \d+ unit$/);
      await mobileUnit.scrollIntoViewIfNeeded();
      await expect(mobileUnit).toBeVisible();
    }

    await expectNoHorizontalOverflow(page);
    expect(runtimeErrors).toEqual([]);
    await capture(page, testInfo, `estimate-scope-grid-${viewport.name}`);
  });
}
