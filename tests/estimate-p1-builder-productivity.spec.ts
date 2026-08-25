import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";

async function addBlankSection(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /^Blank section$/i }).click();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
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
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test("dense Builder preserves fast keyboard entry and visible lifecycle actions", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);
  await addBlankSection(page);

  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  await expect(scopeTools).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  await expect(scopeTools.getByRole("combobox", { name: "Search scope" })).toBeVisible();
  await expect(scopeTools.getByLabel("Jump to section")).toBeVisible();
  await expect(scopeTools.getByRole("button", { name: "Collapse all" })).toBeVisible();
  await expect(scopeTools.getByRole("button", { name: "Expand all" })).toBeVisible();
  await expect(scopeTools.getByRole("button", { name: "Add Section" })).toBeVisible();

  const firstSection = page.locator("[data-estimate-section-id]").first();
  await expect(firstSection.getByRole("button", { name: "Add line to Section 1" })).toBeVisible();

  const gridHeader = page.getByTestId("estimate-line-item-grid-header").first();
  await expect(gridHeader.locator(":scope > *")).toHaveCount(8);
  await expect(gridHeader.locator(":scope > *").first()).toHaveText("#");
  await expect(gridHeader).toContainText("Item");
  await expect(gridHeader).toContainText("Description");
  await expect(gridHeader).toContainText("Qty");
  await expect(gridHeader).toContainText("Unit");
  await expect(gridHeader).toContainText("Unit price");
  await expect(gridHeader).toContainText("Line total");
  await expect(gridHeader).toContainText("Actions");

  const title = page.getByLabel("Line item 1 title").locator("visible=true");
  const descriptionSummary = page
    .getByRole("button", { name: "Line item 1 description" })
    .locator("visible=true");
  const quantity = page.getByLabel("Line item 1 quantity").locator("visible=true");
  const unit = page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true");
  const unitPrice = page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true");

  await title.focus();
  await page.keyboard.press("Tab");
  await expect(descriptionSummary).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(quantity).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unitPrice).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(unit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(unitPrice).toBeFocused();

  await title.fill("Excavation");
  await descriptionSummary.click();
  await page
    .getByRole("textbox", { name: "Line item 1 description" })
    .locator("visible=true")
    .fill("Excavate footing trenches");
  await page.getByTestId("estimate-description-done").click();
  await quantity.fill("4");
  await unit.fill("CY");
  await unitPrice.fill("125");
  await expect(page.getByText("$500.00").locator("visible=true").first()).toBeVisible();

  await unitPrice.press("Enter");
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();

  const firstLine = firstSection.locator("[data-estimate-line-item-id]").first();
  await firstLine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate line item" }).click();
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toHaveValue(
    "Excavation (copy)"
  );
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();

  const duplicatedLine = firstSection.locator("[data-estimate-line-item-id]").nth(1);
  await duplicatedLine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Remove line item" }).click();
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toHaveValue("");
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();

  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Duplicate line item" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save as reusable item" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Move to section" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /amount on PDF/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove line item" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Move to section" }).hover();
  await page.getByRole("menuitem", { name: "Section 2", exact: true }).press("Enter");
  const jumpToSection = scopeTools.getByLabel("Jump to section");
  await expect(jumpToSection.locator("option")).toHaveCount(2);
  await jumpToSection.selectOption({ label: "Section 2 · 2 items" });
  await expect(page.locator("[data-estimate-section-id]").nth(1)).toBeFocused();
  await jumpToSection.selectOption({ label: "Section 1 · 1 item" });

  const scopeSearch = scopeTools.getByRole("combobox", { name: "Search scope" });
  await scopeSearch.fill("Excavation");
  const searchResult = page.getByRole("option", { name: /Excavation.*Section 2/i });
  await expect(searchResult).toBeVisible();
  await searchResult.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement instanceof HTMLInputElement ? document.activeElement.value : null
      )
    )
    .toBe("Excavation");

  await scopeTools.getByRole("button", { name: "Collapse all" }).click();
  await expect(
    page.getByRole("button", { name: "Expand section" }).locator("visible=true")
  ).toHaveCount(2);
  await scopeTools.getByRole("button", { name: "Expand all" }).click();
  await expect(
    page.getByRole("button", { name: "Collapse section" }).locator("visible=true")
  ).toHaveCount(2);

  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "estimate-p1-desktop-dense-builder");
});

test("section-header Add line keeps long-estimate entry anchored in context", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const firstSection = page.locator("[data-estimate-section-id]").first();
  const headerAddLine = firstSection.getByRole("button", { name: "Add line to Section 1" });
  await expect(headerAddLine).toBeEnabled();
  await page.mouse.move(0, 0);
  await expect
    .poll(() => headerAddLine.evaluate((button) => getComputedStyle(button).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  await headerAddLine.hover();
  await expect
    .poll(() =>
      headerAddLine.evaluate((button) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--hh-l3-hover)";
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(button).backgroundColor === expected;
      })
    )
    .toBe(true);
  await headerAddLine.click();

  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();
  await expect(firstSection.locator("[data-estimate-line-item-id]")).toHaveCount(2);
});

test("descriptions stay compact until the focused rich editor is opened", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const descriptionSummary = page
    .getByRole("button", { name: "Line item 1 description" })
    .locator("visible=true");
  await expect(descriptionSummary).toHaveAttribute("aria-expanded", "false");
  await expect(descriptionSummary).toContainText("Add description");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveCount(0);

  await descriptionSummary.click();
  const description = page
    .getByRole("textbox", { name: "Line item 1 description" })
    .locator("visible=true");
  await expect(description).toBeFocused();
  await description.fill(
    "Protect adjacent occupied finishes, coordinate daily access with the owner, maintain dust control and safe egress, and include all temporary protection, cleanup, adjustments, and closeout documentation required for a complete scope."
  );
  await expect(page.getByRole("button", { name: "Bold" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Italic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bullet list" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Numbered list" })).toBeVisible();
  await expect(page.getByTestId("estimate-description-done")).toBeVisible();
  await expect
    .poll(() =>
      description.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))
    )
    .toMatchObject({ overflowY: "hidden" });

  await description.focus();
  await expect(description).toBeFocused();
  await expect
    .poll(() =>
      description.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))
    )
    .toMatchObject({ height: expect.any(Number) });
  const editorMetrics = await description.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(editorMetrics.height).toBeGreaterThanOrEqual(104);
  expect(editorMetrics.scrollHeight).toBeLessThanOrEqual(editorMetrics.clientHeight);

  await page.keyboard.press("Escape");
  await expect(description).toHaveCount(0);
  await expect(descriptionSummary).toBeFocused();
  await expect(descriptionSummary).toContainText("Protect adjacent occupied finishes");

  const topOffsets = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".eb-line-item-grid--pricing");
    if (!row) throw new Error("Estimate line-item grid is required");
    const selectors = [
      'input[aria-label="Line item 1 title"]',
      'input[aria-label="Line item 1 quantity"]',
      'input[aria-label="Line item 1 unit"]',
      'input[aria-label="Line item 1 unit price"]',
      ".eb-line-total-block",
      'button[aria-label="More actions"]',
    ];
    const rowTop = row.getBoundingClientRect().top;
    return selectors.map((selector) => {
      const node = row.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing line-item control: ${selector}`);
      return Math.round(node.getBoundingClientRect().top - rowTop);
    });
  });
  expect(Math.max(...topOffsets) - Math.min(...topOffsets)).toBeLessThanOrEqual(4);

  await descriptionSummary.click();
  const richDescription = "Formatted estimate description";
  await description.fill(richDescription);
  await description.focus();
  await page.keyboard.press("Meta+a");
  await expect
    .poll(() => description.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe(richDescription);
  await page.getByRole("button", { name: "Numbered list" }).click();
  await expect.poll(() => description.evaluate((element) => element.innerHTML)).toMatch(/<ol>/i);
  await page.getByTestId("estimate-description-done").click();

  await page.getByLabel("Line item 1 title").locator("visible=true").fill("PW Rich description");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("100");
  await page.getByRole("button", { name: /Edit details/i }).click();
  const detailsDialog = page.getByRole("dialog", {
    name: /Customer \/ project \/ pricing details/i,
  });
  await detailsDialog.getByPlaceholder("Client or company name").fill("PW Rich description client");
  await detailsDialog.getByPlaceholder("Project name").fill("PW Rich description project");
  await detailsDialog.getByPlaceholder("Site or client address").fill("100 QA Test Lane");
  await detailsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(detailsDialog).toBeHidden();
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const detailUrl = page.url().replace(/\?.*$/, "");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const savedDescriptionSummary = page
    .getByRole("button", { name: "Line item description" })
    .locator("visible=true");
  await expect(savedDescriptionSummary).toContainText(richDescription);
  await savedDescriptionSummary.click();
  const savedDescription = page
    .getByRole("textbox", { name: "Line item description" })
    .locator("visible=true");
  await expect
    .poll(() => savedDescription.evaluate((element) => element.innerHTML))
    .toMatch(/<ol>/i);
  await expect(savedDescription.locator("ol > li")).toHaveCount(1);
  await expect(savedDescription.locator(":scope > p")).toHaveCount(0);
  await expect
    .poll(() => savedDescription.evaluate((element) => element.innerHTML))
    .not.toMatch(/<li(?:\s[^>]*)?>\s*(?:<p>\s*<\/p>\s*)?<\/li>/i);
  await page.getByTestId("estimate-description-done").click();

  await page.goto(`${detailUrl}/preview`, { waitUntil: "domcontentloaded" });
  const preview = page.getByTestId("estimate-document");
  await expect(preview).toContainText(richDescription, { timeout: 30_000 });
  await expect(preview.locator("ol")).toHaveCount(1);
  await expect(preview.locator("ol > li")).toHaveCount(1);

  await page.goto(`${detailUrl}/print`, { waitUntil: "domcontentloaded" });
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  await expect(printDocument).toContainText(richDescription, { timeout: 30_000 });
  await expect(printDocument.locator("ol")).toHaveCount(1);

  const estimateId = new URL(detailUrl).pathname.split("/").at(-1);
  expect(estimateId).toBeTruthy();
  const pdfResponse = await page.request.get(`/api/estimates/${estimateId}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  const pdf = await pdfResponse.body();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});

test("desktop Scope rows and section totals share one eight-track grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const row = page.locator(".eb-line-item-grid--pricing").first();
  const sectionHeader = page.locator(".eb-scope-section-header:visible").first();
  const sectionTotal = sectionHeader.locator(".eb-scope-block-total");
  const lineTotal = row.locator(".eb-line-total-block");

  const metrics = await page.evaluate(() => {
    const headerNode = document.querySelector<HTMLElement>(
      '[data-testid="estimate-line-item-grid-header"]'
    );
    const rowNode = document.querySelector<HTMLElement>(".eb-line-item-grid--pricing");
    if (!headerNode || !rowNode) throw new Error("Scope grid is required");
    return {
      headerTracks: getComputedStyle(headerNode).gridTemplateColumns.split(" ").length,
      rowTracks: getComputedStyle(rowNode).gridTemplateColumns.split(" ").length,
      headerColumns: getComputedStyle(headerNode).gridTemplateColumns,
      rowColumns: getComputedStyle(rowNode).gridTemplateColumns,
    };
  });
  expect(metrics.headerTracks).toBe(8);
  expect(metrics.rowTracks).toBe(8);
  expect(metrics.rowColumns).toBe(metrics.headerColumns);

  const sectionTotalBox = await sectionTotal.boundingBox();
  const lineTotalBox = await lineTotal.boundingBox();
  const sectionTotalRight = (sectionTotalBox?.x ?? 0) + (sectionTotalBox?.width ?? 0);
  const lineTotalRight = (lineTotalBox?.x ?? 0) + (lineTotalBox?.width ?? 0);
  expect(Math.abs(sectionTotalRight - lineTotalRight)).toBeLessThanOrEqual(1);
});

test("Ctrl+S uses the visible whole-document save path", async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates/new");
  await expect(page.getByRole("button", { name: "Save Estimate" }).first()).toBeVisible();

  await page.keyboard.press("Control+s");

  const detailsDialog = page.getByRole("dialog");
  await expect(detailsDialog).toBeVisible();
  await expect(detailsDialog).toContainText("Client name is required");
  await expect(detailsDialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();
});

for (const viewport of [
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const) {
  test(`${viewport.name} uses the intended Estimate Builder composition`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, "/estimates/new");
    await addBlankSection(page);

    await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
    const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
    await expect(scopeTools).toBeVisible();
    await expect(scopeTools.getByLabel("Jump to section")).toBeVisible();

    const compactPricing = page.getByRole("region", { name: "Estimate pricing summary" });
    await expect(page.getByLabel("Estimate overview")).toHaveCount(0);
    if (viewport.width >= 1024) await expect(compactPricing).toBeVisible();
    else await expect(compactPricing).toBeHidden();

    if (viewport.width === 390) {
      await expect(page.getByTestId("estimate-line-item-grid-header")).toBeHidden();
      const addDetails = page.getByRole("button", { name: "Add details" });
      await addDetails.scrollIntoViewIfNeeded();
      await expect(addDetails).toBeVisible();
      await addDetails.click();
      const mobileUnit = page
        .getByLabel("Line item 1 unit", { exact: true })
        .locator("visible=true");
      await mobileUnit.scrollIntoViewIfNeeded();
      await expect(mobileUnit).toBeVisible();

      const mobileTitle = page.getByLabel("Line item 1 title").locator("visible=true");
      await mobileTitle.fill("Mobile focus row");
      const mobileRows = page.locator(
        "[data-estimate-section-mobile-id] [data-estimate-line-item-id]"
      );
      await mobileRows.first().getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Duplicate line item" }).click();
      await expect(mobileRows).toHaveCount(2);
      const duplicateSummary = mobileRows.nth(1).locator(".eb-line-item-mobile-summary");
      await expect(duplicateSummary).toBeFocused();

      await duplicateSummary.click();
      await mobileRows.nth(1).getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Remove line item" }).click();
      await expect(mobileRows).toHaveCount(1);
      await expect(mobileRows.first().locator(".eb-line-item-mobile-summary")).toBeFocused();
    } else if (viewport.width < 1280) {
      await page.getByRole("heading", { name: "Scope of work" }).scrollIntoViewIfNeeded();
    }

    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `estimate-p1-${viewport.name}`);
  });
}

test("existing Estimate exposes the same Scope toolbar without changing save or preview semantics", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  await expect(page.getByRole("toolbar", { name: "Scope tools" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Drag to reorder line item/ }).first()
  ).toBeVisible();
  await capture(page, testInfo, "estimate-p1-existing-desktop");
});
