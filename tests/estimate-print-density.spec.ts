import { expect, test, type Page } from "./estimate-playwright-test";
import { mkdir, writeFile } from "node:fs/promises";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  captureUnexpectedBrowserErrors,
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_ID,
  DENSE_ESTIMATE_NUMBER,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";
import { expectBoundedLetterPages } from "./estimate-document-page-integrity";

const AFTER_EVIDENCE_DIR = "test-results/estimate-print-density/after";

test.beforeAll(seedDenseEstimateFixture);
test.afterAll(cleanupDenseEstimateFixture);

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => browserErrors.set(page, captureUnexpectedBrowserErrors(page)));
test.afterEach(({ page }) => expect(browserErrors.get(page) ?? []).toEqual([]));

test(`${DENSE_ESTIMATE_NUMBER} uses premium print density without losing document or financial content`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}/preview`);

  const pages = page.getByTestId("estimate-preview-page");
  await expect.poll(() => pages.count(), { timeout: 30_000 }).toBeGreaterThan(0);

  const pageCount = await pages.count();
  expect(pageCount).toBeGreaterThan(1);
  expect(
    (await pages.locator(".estimate-page-label").allTextContents()).map((label) => label.trim())
  ).toEqual(Array.from({ length: pageCount }, (_, index) => `Page ${index + 1} of ${pageCount}`));
  await expect(page.getByTestId("estimate-line-item-output")).toHaveCount(62);
  const scopePageItemCounts = await page
    .locator(".estimate-scope-page")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelectorAll('[data-testid="estimate-line-item-output"]').length)
    );
  expect(scopePageItemCounts.length).toBeGreaterThan(1);
  expect(scopePageItemCounts.every((count) => count > 0)).toBe(true);
  await expect(page.locator(".estimate-payment-row")).toHaveCount(5);
  await expect(
    page.locator(
      '[data-final-packet-part="payment"], [data-final-packet-part="payment-continuation"]'
    )
  ).toHaveCount(1);

  await expect(pages.first()).toContainText("Scope of Work");

  await expectBoundedLetterPages(pages);

  await expect(page.getByTestId("estimate-preview-summary")).toContainText("$3,253,937.00");
  await expect(page.getByTestId("estimate-document")).toContainText("Payment Schedule");
  await expect(page.getByTestId("estimate-document")).toContainText("Notes & Clarifications");
  await expect(page.getByTestId("estimate-document")).toContainText("Client Acceptance");

  const pdfResponse = await page.request.get(`/api/estimates/${DENSE_ESTIMATE_ID}/pdf`);
  expect(pdfResponse.ok()).toBe(true);
  const pdfBytes = await pdfResponse.body();
  expect(pdfBytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  const pdfPageCount = pdfBytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  expect(pdfPageCount).toBe(pageCount);
  await mkdir(AFTER_EVIDENCE_DIR, { recursive: true });
  await writeFile(`${AFTER_EVIDENCE_DIR}/E2E-EST-DENSE-0079-after-density.pdf`, pdfBytes);
});
