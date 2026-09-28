import { expect, test, type Page } from "./estimate-playwright-test";

import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";

async function addBlankSection(page: Page, assertSingleAction = false): Promise<void> {
  if (assertSingleAction) {
    await expect(page.getByRole("button", { name: /^Add section$/i })).toHaveCount(1);
  }
  const addSection = page.getByRole("button", { name: /^Add Section$/i });
  await expect(addSection).toHaveCount(1);
  await addSection.click();
  const blankSection = page.getByRole("menuitem", { name: "Blank section" });
  await expect(blankSection).toBeVisible();
  await blankSection.click();
}

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates/new");
});

test("new Estimate has one section action and protects unsaved changes", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator('span[role="status"]', { hasText: "Unsaved changes" }).first()
  ).toBeHidden();

  await addBlankSection(page, true);
  await expect(
    page.locator('span[role="status"]', { hasText: "Unsaved changes" }).first()
  ).toBeVisible();

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Estimates /", exact: true }).click();
  await expect.poll(() => dialogMessage).toContain("unsaved");
  await expect(page).toHaveURL(/\/estimates\/new$/);
});

test("desktop Save stays reachable on a long Estimate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addBlankSection(page);
  const notes = page.getByRole("button", { name: "Add note" });
  await notes.scrollIntoViewIfNeeded();

  const save = page.getByRole("button", { name: "Save Estimate" });
  await expect(save).toHaveCount(1);
  await expect
    .poll(async () => {
      const box = await save.boundingBox();
      return box ? box.y >= 0 && box.y + box.height <= 900 : false;
    })
    .toBe(true);
});

test("desktop quantity fields show multi-digit construction quantities without clipping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addBlankSection(page);
  const quantity = page.getByLabel("Line item 1 quantity").locator("visible=true").first();
  await quantity.fill("180.5");
  const geometry = await quantity.evaluate((input: HTMLInputElement) => ({
    clientWidth: input.clientWidth,
    scrollWidth: input.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test("Preview exposes fit and zoom controls and Escape returns to Estimate", async ({ page }) => {
  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`);
  await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Fit pages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(
    new RegExp(`/estimates/${E2E_PRESERVED_ESTIMATE_ID}(?:\\?returnScroll=\\d+)?$`)
  );
});

test("mobile Estimate editor cannot retain horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addBlankSection(page);
  const addDetails = page.getByRole("button", { name: /^Edit line item \d+:/ });
  if (await addDetails.isVisible().catch(() => false)) await addDetails.click();
  await page.getByLabel("Line item 1 title").first().fill("Mobile scope item");
  await page.getByLabel("Line item 1 unit price").first().fill("1250");
  await page.getByRole("button", { name: "Schedule Payment" }).scrollIntoViewIfNeeded();

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const scrollRoot = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    return {
      rootOverflow: root.scrollWidth - root.clientWidth,
      rootScrollLeft: root.scrollLeft,
      appOverflow: scrollRoot ? scrollRoot.scrollWidth - scrollRoot.clientWidth : 0,
      appScrollLeft: scrollRoot?.scrollLeft ?? 0,
    };
  });
  expect(overflow).toEqual({
    rootOverflow: 0,
    rootScrollLeft: 0,
    appOverflow: 0,
    appScrollLeft: 0,
  });
});

test("mobile number fields and saved Edit actions remain touch-safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addBlankSection(page);
  const addDetails = page.getByRole("button", { name: /^Edit line item \d+:/ }).first();
  if (await addDetails.isVisible().catch(() => false)) await addDetails.click();

  const quantity = page.getByLabel("Line item 1 quantity").first();
  const unitPrice = page.getByLabel("Line item 1 unit price").first();
  await expect(quantity).toHaveAttribute("inputmode", "decimal");
  await expect(unitPrice).toHaveAttribute("inputmode", "decimal");
  for (const input of [quantity, unitPrice]) {
    const box = await input.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const sectionTitle = page
    .getByLabel("Section name for Section 1")
    .locator("visible=true")
    .first();
  await expect(sectionTitle).toBeVisible();
  const sectionTitleBox = await sectionTitle.boundingBox();
  expect(sectionTitleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await expect(edit).toBeVisible({ timeout: 30_000 });
  await edit.click();
  const editActions = page.getByLabel("Estimate edit actions");
  await expect(editActions).toBeVisible();
  await expect(editActions.getByText("Total", { exact: true })).toBeVisible();
  await expect(editActions.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  const headerActions = page.getByTestId("estimate-detail-header-actions");
  await expect(headerActions.getByRole("button", { name: "Save", exact: true })).toBeHidden();
  await expect(headerActions.getByRole("button", { name: "Done", exact: true })).toBeHidden();
  const actionBox = await editActions.boundingBox();
  expect(actionBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844 - 56);
  await editActions.getByRole("button", { name: "Save", exact: true }).click();
});

test("iPad portrait keeps saved Edit total and actions persistently reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const editActions = page.getByLabel("Estimate edit actions");
  await expect(editActions).toBeVisible({ timeout: 30_000 });
  await expect(editActions.getByText("Total", { exact: true })).toBeVisible();
  await expect(editActions.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(
    page
      .getByTestId("estimate-detail-header-actions")
      .getByRole("button", { name: "Save", exact: true })
  ).toBeHidden();

  const geometry = await editActions.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(80);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.overflow).toBe(0);

  await editActions.getByRole("button", { name: "Save", exact: true }).click();
});

test("iPad landscape keeps line title readable beside stacked pricing", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await addBlankSection(page);

  const title = page.getByLabel("Line item 1 title").locator("visible=true").first();
  await title.fill("Long contractor scope title remains readable");
  const geometry = await title.evaluate((input) => {
    const grid = input.closest<HTMLElement>(".eb-line-item-grid--pricing");
    const rect = input.getBoundingClientRect();
    return {
      inputWidth: rect.width,
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.inputWidth).toBeGreaterThan(300);
  expect(geometry.gridColumns).toBe(5);
  expect(geometry.overflow).toBe(0);
});

test("saved Estimate pricing inspector remains visible through a long edit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const pricingSummary = page.getByRole("region", { name: "Estimate pricing summary" });
  await expect(pricingSummary).toBeVisible({ timeout: 30_000 });
  const scope = page.locator(".eb-scope-work-panel");
  await scope.evaluate((element) => {
    element.style.minHeight = "1800px";
  });
  await page.locator("[data-app-scroll-root]").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => {
      const box = await pricingSummary.boundingBox();
      return box ? box.y >= 0 && box.y + box.height <= 900 : false;
    })
    .toBe(true);
  await scope.evaluate((element) => {
    element.style.removeProperty("min-height");
  });
});

test("mobile Preview keeps the complete A4 document reachable inside its viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}/preview`);
  await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 30_000 });
  const initialGeometry = await page.evaluate(() => {
    const paper = document.querySelector<HTMLElement>(".estimate-a4-page");
    const viewport = document.querySelector<HTMLElement>(
      "[data-testid='estimate-preview-viewport']"
    );
    const renderedPaper = paper?.getBoundingClientRect();
    const renderedViewport = viewport?.getBoundingClientRect();
    return {
      paperWidth: paper?.offsetWidth ?? 0,
      paperLeft: renderedPaper?.left ?? 0,
      renderedWidth: renderedPaper?.width ?? 0,
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewportClientWidth: viewport?.clientWidth ?? 0,
      viewportLeft: renderedViewport?.left ?? 0,
      viewportOverflowX: viewport ? getComputedStyle(viewport).overflowX : "",
      viewportScrollWidth: viewport?.scrollWidth ?? 0,
    };
  });
  expect(initialGeometry.paperWidth).toBeGreaterThan(700);
  expect(initialGeometry.renderedWidth).toBeGreaterThan(initialGeometry.viewportClientWidth);
  expect(initialGeometry.paperLeft).toBeGreaterThanOrEqual(initialGeometry.viewportLeft - 1);
  expect(initialGeometry.viewportOverflowX).toBe("auto");
  expect(initialGeometry.viewportScrollWidth).toBeGreaterThan(initialGeometry.viewportClientWidth);
  expect(initialGeometry.rootOverflow).toBe(0);

  const endingGeometry = await page
    .getByTestId("estimate-preview-viewport")
    .evaluate(async (viewport) => {
      viewport.scrollLeft = viewport.scrollWidth;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const paper = viewport.querySelector<HTMLElement>(".estimate-a4-page");
      const renderedPaper = paper?.getBoundingClientRect();
      const renderedViewport = viewport.getBoundingClientRect();
      return {
        paperRight: renderedPaper?.right ?? 0,
        rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollLeft: viewport.scrollLeft,
        viewportRight: renderedViewport.right,
      };
    });
  expect(endingGeometry.scrollLeft).toBeGreaterThan(0);
  expect(endingGeometry.paperRight).toBeLessThanOrEqual(endingGeometry.viewportRight + 1);
  expect(endingGeometry.paperRight).toBeGreaterThanOrEqual(endingGeometry.viewportRight - 1);
  expect(endingGeometry.rootOverflow).toBe(0);
});
