import { mkdir, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "./estimate-playwright-test";

import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
import {
  cleanupEstimateFinancialFixture,
  ESTIMATE_FINANCIAL_FIXTURE_BASELINE,
  ESTIMATE_FINANCIAL_FIXTURE_ID,
  ESTIMATE_FINANCIAL_FIXTURE_NUMBER,
  seedEstimateFinancialFixture,
} from "./estimate-financial-fixture";
import {
  cleanupPopulatedEditableEstimateFixture,
  POPULATED_EDITABLE_ESTIMATE_ID,
  seedPopulatedEditableEstimateFixture,
} from "./estimate-populated-editable-fixture";

const P1_EVIDENCE_DIR = "/private/tmp/hh-estimate-p1-repair";

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

function collectRuntimeErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

test.beforeAll(async () => {
  await seedPopulatedEditableEstimateFixture();
  await seedEstimateFinancialFixture();
});

test.afterAll(async () => {
  try {
    await cleanupEstimateFinancialFixture();
  } finally {
    await cleanupPopulatedEditableEstimateFixture();
  }
});

test("Estimate List has one create path, one desktop status filter, and readable dense rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates");

  await expect(page.getByRole("link", { name: "New Estimate", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
  await expect(page.locator('select[aria-label="Filter estimates by status"]:visible')).toHaveCount(
    0
  );

  const row = page.locator(".estimate-list-row").first();
  const customer = row.getByTestId("estimate-row-client");
  const project = row.getByTestId("estimate-row-project");
  await expect(customer).toHaveCSS("-webkit-line-clamp", "1");
  await expect(project).toHaveCSS("-webkit-line-clamp", "1");
  await expect
    .poll(() =>
      row.evaluate((element) => {
        const customerNode = element.querySelector<HTMLElement>(
          '[data-testid="estimate-row-client"]'
        );
        const projectNode = element.querySelector<HTMLElement>(
          '[data-testid="estimate-row-project"]'
        );
        if (!customerNode || !projectNode) return -1;
        return (
          projectNode.getBoundingClientRect().top - customerNode.getBoundingClientRect().bottom
        );
      })
    )
    .toBeGreaterThanOrEqual(1);

  await expectNoHorizontalOverflow(page);
});

test("Estimate edit mode exposes one save exit, one section pattern, and truthful pricing actions", async ({
  page,
}) => {
  const runtime = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);

  const header = page.getByTestId("estimate-detail-header");
  await expect(header.getByRole("button", { name: "Delete estimate" })).toHaveCount(0);
  await header.getByRole("button", { name: "Estimate actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete estimate" })).toBeVisible();
  await page.keyboard.press("Escape");

  await header.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(header.getByRole("button", { name: "Save", exact: true })).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await expect(header.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("button", { name: /^Add Section$/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Add Final Section$/i })).toHaveCount(0);

  const sectionCount = await page.locator("[data-estimate-section-id]").count();
  await expect(page.getByRole("button", { name: /^Add Next Section after /i })).toHaveCount(
    Math.max(0, sectionCount - 1)
  );

  const pricingNavigation = page.getByRole("navigation", {
    name: "Pricing inspector sections",
  });
  await expect(pricingNavigation).toBeVisible();
  await expect(pricingNavigation.getByText("Overview", { exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(pricingNavigation.getByRole("button", { name: "Payment" })).toBeVisible();
  await expect(pricingNavigation.getByRole("button", { name: "Details" })).toBeVisible();

  const firstLine = page.locator("[data-estimate-line-item-id]:visible").first();
  const firstInput = firstLine.locator("input:visible").first();
  if ((await firstInput.count()) > 0) {
    await firstInput.focus();
    await expect(firstLine).toHaveCSS("outline-style", "none");
  }

  const quantity = page.getByLabel("Line item quantity").locator("visible=true").first();
  if ((await quantity.count()) > 0) {
    await expect(quantity).toHaveAttribute("step", "1");
    await quantity.focus();
    await quantity.dispatchEvent("wheel", { deltaY: 100 });
    await expect(quantity).not.toBeFocused();

    await firstLine.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Remove line item" }).click();
    const deleteLineDialog = page.getByRole("dialog", { name: "Delete line item?" });
    await expect(deleteLineDialog).toBeVisible();
    await deleteLineDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(deleteLineDialog).toBeHidden();
  }

  await expectNoHorizontalOverflow(page);
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

test("Estimate P1 drawer and keyboard contracts work through real controls", async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);
  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();

  const detailsTrigger = header.getByRole("button", { name: "Edit details" });
  await detailsTrigger.click();
  let details = page.getByRole("dialog", {
    name: "Customer / project / pricing details",
  });
  const customer = details.getByPlaceholder("Client or company name");
  const persistedCustomer = await customer.inputValue();
  await customer.fill(`${persistedCustomer} cancel probe`);
  await details.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(detailsTrigger).toBeFocused();

  await detailsTrigger.click();
  details = page.getByRole("dialog", { name: "Customer / project / pricing details" });
  await expect(details.getByPlaceholder("Client or company name")).toHaveValue(persistedCustomer);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(detailsTrigger).toBeFocused();

  const pricingNavigation = page.getByRole("navigation", {
    name: "Pricing inspector sections",
  });
  const paymentTrigger = pricingNavigation.getByRole("button", { name: "Payment" });
  await paymentTrigger.click();
  const paymentSheet = page.getByTestId("estimate-payment-schedule-sheet");
  await expect(paymentSheet).toBeVisible();
  await paymentSheet.getByRole("button", { name: "Close" }).click();
  await expect(paymentSheet).toBeHidden();
  await expect(paymentTrigger).toBeFocused();

  await paymentTrigger.click();
  await expect(paymentSheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paymentSheet).toBeHidden();
  await expect(paymentTrigger).toBeFocused();

  const firstLine = page.locator("[data-estimate-line-item-id]:visible").first();
  const title = firstLine.getByLabel("Line item title", { exact: true });
  const description = firstLine.getByLabel("Line item description", { exact: true });
  const quantity = firstLine.getByLabel("Line item quantity", { exact: true });
  const unit = firstLine.getByLabel("Line item unit", { exact: true });
  const price = firstLine.getByLabel("Line item unit price", { exact: true });
  const overflow = firstLine.getByRole("button", { name: "More actions" });

  await title.focus();
  await page.keyboard.press("Tab");
  await expect(description).toBeFocused();
  await page.keyboard.press("Enter");
  const descriptionEditor = firstLine.getByRole("textbox", { name: "Line item description" });
  await expect(descriptionEditor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(description).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(quantity).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(price).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(overflow).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(price).toBeFocused();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

test("Estimate section collapse target is touch safe at 820px", async ({ page }) => {
  const runtime = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 820, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);
  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();
  const collapse = page.getByRole("button", { name: "Collapse section" }).first();
  const box = await collapse.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

test("New Estimate details Cancel discards the current drawer draft", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");
  const header = page.getByTestId("estimate-new-header");
  const detailsTrigger = header.getByRole("button", { name: "Edit details" });
  await detailsTrigger.click();
  let details = page.getByRole("dialog", {
    name: "Customer / project / pricing details",
  });
  const customer = details.getByPlaceholder("Client or company name");
  const originalCustomer = await customer.inputValue();
  await customer.fill("Unsaved New Estimate Customer");
  await details.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(detailsTrigger).toBeFocused();

  await detailsTrigger.click();
  details = page.getByRole("dialog", { name: "Customer / project / pricing details" });
  await expect(details.getByPlaceholder("Client or company name")).toHaveValue(originalCustomer);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(detailsTrigger).toBeFocused();
  await expectNoHorizontalOverflow(page);
});

test("EST-0063 keeps financial, List, Preview, Print, PDF, and responsive parity", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mkdir(P1_EVIDENCE_DIR, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
  await expect(page.getByTestId("estimate-detail-header")).toContainText(
    ESTIMATE_FINANCIAL_FIXTURE_NUMBER
  );
  await expect(page.getByTestId("estimate-detail-header")).toContainText("Sent");
  const pricing = page.getByRole("region", { name: "Estimate pricing summary" });
  for (const amount of [
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.subtotal,
    `-${ESTIMATE_FINANCIAL_FIXTURE_BASELINE.discount}`,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.tax,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total,
  ]) {
    await expect(pricing).toContainText(amount);
  }

  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();
  await header.getByRole("button", { name: "Edit details" }).click();
  const details = page.getByRole("dialog", {
    name: "Customer, project, and estimate details",
  });
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(header.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.screenshot({
    path: `${P1_EVIDENCE_DIR}/est-0063-desktop-1440.png`,
    fullPage: false,
  });

  await gotoWithE2EAuth(page, "/estimates");
  await page
    .getByRole("textbox", { name: "Search estimates" })
    .fill(ESTIMATE_FINANCIAL_FIXTURE_NUMBER);
  const listRow = page.locator(".estimate-list-row", {
    hasText: ESTIMATE_FINANCIAL_FIXTURE_NUMBER,
  });
  await expect(listRow).toContainText("QA Test Customer");
  await expect(listRow).toContainText("QA Test Project");
  await expect(listRow).toContainText("Sent");
  await expect(listRow).toContainText(ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total);
  await listRow.locator(`a[href="/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`));

  await page.getByRole("link", { name: "Preview", exact: true }).click();
  const document = page.getByTestId("estimate-document");
  for (const content of [
    `${ESTIMATE_FINANCIAL_FIXTURE_NUMBER} Rev 0`,
    "QA Test Customer",
    "QA Test Project",
    "Demolition",
    "Remove existing flooring",
    "Flooring",
    "Install SPC flooring",
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.subtotal,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.tax,
    `−${ESTIMATE_FINANCIAL_FIXTURE_BASELINE.discount}`,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.deposit,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.final,
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.remaining,
  ]) {
    await expect(document).toContainText(content);
  }
  await expect(document.getByTestId("estimate-preview-page")).toHaveCount(2);
  await expect(document.locator("[data-app-sidebar], [data-app-topbar]")).toHaveCount(0);
  await page.screenshot({
    path: `${P1_EVIDENCE_DIR}/est-0063-preview-1440.png`,
    fullPage: true,
  });

  const printPagePromise = page.context().waitForEvent("page");
  await page.getByRole("link", { name: "Print", exact: true }).click();
  const printPage = await printPagePromise;
  await printPage.waitForLoadState("domcontentloaded");
  const printDocument = printPage.getByTestId("estimate-document");
  await expect(printDocument).toContainText(`${ESTIMATE_FINANCIAL_FIXTURE_NUMBER} Rev 0`);
  await expect(printDocument).toContainText(ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total);
  await expect(printDocument).toContainText(ESTIMATE_FINANCIAL_FIXTURE_BASELINE.deposit);
  await expect(printDocument).toContainText(ESTIMATE_FINANCIAL_FIXTURE_BASELINE.final);
  await expect(printDocument.getByTestId("estimate-preview-page")).toHaveCount(2);
  await printPage.close();

  const pdfResponse = await page.request.get(`/api/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  expect(pdfResponse.headers()["content-disposition"]).toContain("EST-0063");
  const pdf = await pdfResponse.body();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await writeFile(`${P1_EVIDENCE_DIR}/EST-0063.pdf`, pdf);

  for (const viewport of [
    { name: "desktop-1280", width: 1280, height: 850 },
    { name: "tablet-820", width: 820, height: 1180 },
    { name: "mobile-390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoWithE2EAuth(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `${P1_EVIDENCE_DIR}/est-0063-${viewport.name}.png`,
      fullPage: false,
    });
  }

  await page
    .getByTestId("estimate-detail-header")
    .getByRole("button", {
      name: "Edit",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /^Edit line item 1:/ }).click();
  const mobileTitle = page.getByLabel("Line item 1 title").locator("visible=true").first();
  const mobileTitleValue = await mobileTitle.inputValue();
  await mobileTitle.fill(mobileTitleValue);
  await mobileTitle.press("Tab");
  const mobileActions = page.getByLabel("Estimate edit actions");
  await mobileActions.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await expect(page.getByTestId("estimate-document")).toContainText(
    ESTIMATE_FINANCIAL_FIXTURE_BASELINE.total
  );
  await expectNoHorizontalOverflow(page);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("Estimate mobile keeps one create path and one save exit without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, "/estimates");
  await expect(page.getByRole("link", { name: "New Estimate", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);

  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();
  const actionBar = page.locator('[aria-label="Estimate edit actions"]');
  await expect(actionBar.getByRole("button", { name: "Save", exact: true })).toHaveCount(1);
  await expect(actionBar.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  await expect(actionBar.getByRole("status")).toHaveText("Saved");
  await expectNoHorizontalOverflow(page);
});

test("Cmd+S commits the active persisted line before closing edit mode", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let createdUrl: string | null = null;
  try {
    await page.getByRole("button", { name: "Edit details" }).click();
    const details = page.getByRole("dialog", {
      name: "Customer / project / pricing details",
    });
    await details
      .getByPlaceholder("Client or company name")
      .fill(`[E2E] Estimate UX Save ${suffix}`);
    await details.getByPlaceholder("Project name").fill(`[E2E] Estimate UX Save Project ${suffix}`);
    await details.getByRole("button", { name: "Save", exact: true }).click();

    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Blank section" }).click();
    await page.getByLabel("Line item 1 title").locator("visible=true").fill("Initial scope");
    await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
    await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("10");
    await page.getByRole("button", { name: "Save Estimate" }).click();
    await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
    createdUrl = page.url().replace(/\?.*$/, "");

    const header = page.getByTestId("estimate-detail-header");
    await header.getByRole("button", { name: "Edit", exact: true }).click();
    const title = page.getByLabel("Line item title").locator("visible=true").first();
    await title.fill(`Committed scope ${suffix}`);
    await expect(title).toBeFocused();
    await page.keyboard.press("Meta+s");
    await expect(header.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await header.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Line item title").locator("visible=true").first()).toHaveValue(
      `Committed scope ${suffix}`
    );
  } finally {
    if (createdUrl) {
      await gotoWithE2EAuth(page, "/estimates").catch(() => undefined);
      await gotoWithE2EAuth(page, createdUrl).catch(() => undefined);
      const header = page.getByTestId("estimate-detail-header");
      const directDelete = header.getByRole("button", { name: "Delete estimate" });
      if (await directDelete.isVisible().catch(() => false)) {
        await directDelete.click();
      } else {
        await header.getByRole("button", { name: "Estimate actions" }).click();
        await page.getByRole("menuitem", { name: "Delete estimate" }).click();
      }
      const confirm = page.getByRole("dialog", { name: "Delete estimate?" });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      }
    }
  }
});
