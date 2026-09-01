import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import {
  cleanupPopulatedEditableEstimateFixture,
  POPULATED_EDITABLE_ESTIMATE_ID,
  seedPopulatedEditableEstimateFixture,
} from "./estimate-populated-editable-fixture";

test.beforeAll(async () => {
  await seedPopulatedEditableEstimateFixture();
});

test.afterAll(async () => {
  await cleanupPopulatedEditableEstimateFixture();
});

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

function collectRuntimeErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
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
  const sectionJump = scopeTools.getByLabel("Jump to section");
  await expect(sectionJump).toBeHidden();
  await expect(sectionJump.locator("option")).toHaveCount(2);
  await expect(scopeTools.getByRole("button", { name: "Collapse all" })).toBeVisible();
  await expect(scopeTools.getByRole("button", { name: "Expand all" })).toBeVisible();
  await expect(scopeTools.getByRole("button", { name: "Add Section" })).toBeVisible();

  const firstSection = page.locator("[data-estimate-section-id]").first();
  await expect(firstSection.getByRole("button", { name: "Add line to Section 1" })).toBeVisible();

  const gridHeader = page.getByTestId("estimate-line-item-grid-header").first();
  await expect(gridHeader.locator(":scope > *")).toHaveCount(8);
  await expect(gridHeader).toContainText("Item Name");
  await expect(gridHeader).toContainText("Description");
  await expect(gridHeader).toContainText("Qty");
  await expect(gridHeader).toContainText("Unit");
  await expect(gridHeader).toContainText("Unit price");
  await expect(gridHeader).toContainText("Line total");
  await expect(gridHeader).toContainText("More");

  const title = page.getByLabel("Line item 1 title").locator("visible=true");
  const descriptionSummary = page
    .getByRole("button", { name: "Line item 1 description" })
    .locator("visible=true");
  const quantity = page.getByLabel("Line item 1 quantity").locator("visible=true");
  const unit = page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true");
  const unitPrice = page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true");
  const firstLine = firstSection.locator("[data-estimate-line-item-id]").first();

  const qtyUnitGroup = firstLine.locator(".eb-line-qty-unit-group");
  await expect(qtyUnitGroup).toHaveCount(1);
  await expect(qtyUnitGroup.getByLabel("Line item 1 quantity")).toHaveCount(1);
  await expect(qtyUnitGroup.getByLabel("Line item 1 unit", { exact: true })).toHaveCount(1);
  await expect
    .poll(() =>
      firstLine.evaluate((line) => {
        const titleInput = line.querySelector<HTMLInputElement>('input[aria-label$=" title"]');
        const descriptionButton = line.querySelector<HTMLButtonElement>(
          'button[aria-label$=" description"]'
        );
        if (!titleInput || !descriptionButton) return false;
        const titleRect = titleInput.getBoundingClientRect();
        const descriptionRect = descriptionButton.getBoundingClientRect();
        return descriptionRect.left >= titleRect.right - 1;
      })
    )
    .toBe(true);
  await expect
    .poll(() => firstLine.evaluate((line) => line.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(52);

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

  await firstLine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate line item" }).click();
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toHaveValue(
    "Excavation (copy)"
  );
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();

  const duplicatedLine = firstSection.locator("[data-estimate-line-item-id]").nth(1);
  await duplicatedLine.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Remove line item" }).click();
  await page
    .getByRole("dialog", { name: "Delete line item?" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toHaveValue("");
  await expect(page.getByLabel("Line item 2 title").locator("visible=true")).toBeFocused();

  const excavationLineItemId = await firstLine.getAttribute("data-estimate-line-item-id");
  expect(excavationLineItemId).not.toBeNull();
  const excavationRow = firstSection.locator(
    `[data-estimate-line-item-id="${excavationLineItemId}"]:visible`
  );
  await expect(excavationRow).toHaveCount(1);
  await expect(excavationRow.locator('input[aria-label$=" title"]')).toHaveValue("Excavation");
  await excavationRow.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Move line item up" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Move line item down" }).click();
  const firstSectionTitles = firstSection.locator('input[aria-label$=" title"]');
  await expect(firstSectionTitles.nth(0)).toHaveValue("");
  await expect(firstSectionTitles.nth(1)).toHaveValue("Excavation");
  await excavationRow.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Move line item up" }).click();
  await expect(firstSectionTitles.nth(0)).toHaveValue("Excavation");
  await expect(firstSectionTitles.nth(1)).toHaveValue("");

  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Duplicate line item" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save as reusable item" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Move to section" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /amount on PDF/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove line item" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Move to section" }).hover();
  await page.getByRole("menuitem", { name: "Section 2", exact: true }).press("Enter");
  const scopeSearch = scopeTools.getByRole("combobox", { name: "Search scope" });
  await scopeSearch.fill("Section 2");
  await page.getByRole("option", { name: /Section 2.*2 items/i }).click();
  await expect(page.locator("[data-estimate-section-id]").nth(1)).toBeFocused();
  await scopeSearch.fill("Section 1");
  await page.getByRole("option", { name: /Section 1.*1 item/i }).click();

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

test("central Builder exposes V2 contrast and forced-colors focus states at runtime", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const firstLine = page.locator("[data-estimate-section-id] [data-estimate-line-item-id]").first();
  const moreActions = firstLine.getByRole("button", { name: "More actions" });
  const actionStyle = await moreActions.evaluate((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return {
      color: style.color,
      opacity: style.opacity,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(actionStyle).toEqual({
    color: "rgb(107, 114, 128)",
    opacity: "1",
    width: 36,
    height: 36,
  });

  const currentSection = page.locator("[data-estimate-section-id]").first();
  await expect(currentSection).toHaveClass(/eb-scope-section-current/);
  const currentSectionCount = currentSection.locator(".eb-scope-section-item-count");
  await expect(currentSectionCount).toBeVisible();
  await expect
    .poll(() => currentSectionCount.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(75, 82, 92)");

  await page.emulateMedia({ forcedColors: "active" });
  const quantity = page.getByLabel("Line item 1 quantity").locator("visible=true");
  await page.keyboard.press("Tab");
  await quantity.focus();
  await expect(quantity).toBeFocused();
  await expect
    .poll(() =>
      quantity.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          forcedColors: window.matchMedia("(forced-colors: active)").matches,
          focusVisible: element.matches(":focus-visible"),
          editorRootAncestor: Boolean(element.closest("[data-estimate-editor-mode]")),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      })
    )
    .toEqual({
      forcedColors: true,
      focusVisible: true,
      editorRootAncestor: true,
      outlineStyle: "solid",
      outlineWidth: "2px",
    });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSummary = page.getByRole("button", { name: "Edit line item 1: Untitled" });
  await page.keyboard.press("Tab");
  await mobileSummary.focus();
  await expect(mobileSummary).toBeFocused();
  await expect
    .poll(() =>
      mobileSummary.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          forcedColors: window.matchMedia("(forced-colors: active)").matches,
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      })
    )
    .toEqual({
      forcedColors: true,
      focusVisible: true,
      outlineStyle: "solid",
      outlineWidth: "2px",
    });
});

test("P2 desktop polish keeps line entry compact, hierarchical, and visually clustered", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const firstLine = page.locator("[data-estimate-section-id] [data-estimate-line-item-id]").first();
  await expect
    .poll(() => firstLine.evaluate((line) => line.getBoundingClientRect().height))
    .toBeLessThanOrEqual(76);

  const title = page.getByLabel("Line item 1 title").locator("visible=true");
  const description = page
    .getByRole("button", { name: "Line item 1 description" })
    .locator("visible=true");
  await expect
    .poll(() =>
      title.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      })
    )
    .toEqual({
      color: "rgb(24, 26, 30)",
      fontSize: "14px",
      fontWeight: "500",
      lineHeight: "20px",
    });
  await expect
    .poll(() =>
      description.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      })
    )
    .toEqual({
      color: "rgb(107, 114, 128)",
      fontSize: "13px",
      fontWeight: "400",
      lineHeight: "18px",
    });

  const qtyInput = firstLine.getByLabel("Line item 1 quantity", { exact: true });
  const unitInput = firstLine.getByLabel("Line item 1 unit", { exact: true });
  const unitPrice = firstLine.getByLabel("Line item 1 unit price", { exact: true });
  for (const control of [qtyInput, unitInput, unitPrice]) {
    await expect
      .poll(() =>
        control.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            borderColor: style.borderTopColor,
            borderRadius: style.borderTopLeftRadius,
            height: element.getBoundingClientRect().height,
          };
        })
      )
      .toEqual({
        background: "rgb(255, 255, 255)",
        borderColor: "rgb(139, 146, 155)",
        borderRadius: "6px",
        height: 36,
      });
  }

  await qtyInput.focus();
  await expect
    .poll(() => qtyInput.evaluate((element) => getComputedStyle(element).boxShadow !== "none"))
    .toBe(true);

  const addLine = page.locator("[data-estimate-section-id] .eb-add-line").first();
  await expect
    .poll(() =>
      addLine.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderColor: style.borderTopColor,
          color: style.color,
          height: element.getBoundingClientRect().height,
        };
      })
    )
    .toEqual({
      background: "rgba(0, 0, 0, 0)",
      borderColor: "rgba(0, 0, 0, 0)",
      color: "rgb(107, 114, 128)",
      height: 32,
    });
  await addLine.focus();
  await expect
    .poll(() =>
      addLine.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      })
    )
    .toEqual({ outlineStyle: "solid", outlineWidth: "2px" });
});

test("P2 mobile polish compresses chrome without shrinking touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);

  const mobileBar = page.getByLabel("Estimate total");
  await expect(mobileBar).toBeVisible();
  await expect
    .poll(() => mobileBar.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThanOrEqual(116);

  const mobileSummary = mobileBar.locator(".eb-mobile-summary > summary");
  await expect(mobileSummary).toBeVisible();
  const mobileSummaryHeight = await mobileSummary.evaluate(
    (element) => element.getBoundingClientRect().height
  );
  expect(mobileSummaryHeight).toBeGreaterThanOrEqual(44);
  for (const action of [
    mobileBar.getByRole("link", { name: "Cancel" }),
    mobileBar.getByRole("button", { name: "Save Estimate", exact: true }),
    mobileBar.getByRole("button", { name: "Save & Preview" }),
  ]) {
    await expect
      .poll(() => action.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(44);
  }

  const scopePanel = page.locator(".eb-scope-work-panel").first();
  const notesPanel = page.locator(".eb-notes-clarifications-panel").first();
  await expect(notesPanel).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const flow = document.querySelector<HTMLElement>(".eb-v3-worksheet-flow");
        const scope = flow?.querySelector<HTMLElement>(".eb-scope-work-panel")?.closest("section");
        const payment = flow?.querySelector<HTMLElement>("#estimate-payment-schedule");
        const notes = flow
          ?.querySelector<HTMLElement>(".eb-notes-clarifications-panel")
          ?.closest("section");
        if (!scope || !payment || !notes) return null;
        const scopeBox = scope.getBoundingClientRect();
        const paymentBox = payment.getBoundingClientRect();
        const notesBox = notes.getBoundingClientRect();
        return {
          scopeBeforePayment: scopeBox.bottom <= paymentBox.top,
          paymentBeforeNotes: paymentBox.bottom <= notesBox.top,
          scopePaymentGap: paymentBox.top - scopeBox.bottom,
          paymentNotesGap: notesBox.top - paymentBox.bottom,
        };
      })
    )
    .toEqual({
      scopeBeforePayment: true,
      paymentBeforeNotes: true,
      scopePaymentGap: 16,
      paymentNotesGap: 16,
    });
  await expect(scopePanel).toBeVisible();
});

test("keyboard section operations do not animate the operational layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/estimates/new");
  await addBlankSection(page);
  await addBlankSection(page);

  const appScrollRoot = page.locator("[data-app-scroll-root]");
  await expect
    .poll(() => appScrollRoot.evaluate((element) => getComputedStyle(element).scrollBehavior))
    .toBe("auto");

  const firstSection = page.locator("[data-estimate-section-id]").first();
  const collapsibleBody = firstSection.locator(".eb-scope-section-body");
  await expect
    .poll(() => collapsibleBody.evaluate((body) => getComputedStyle(body).transitionDuration))
    .toBe("0s");

  await page.evaluate(() => {
    const targetWindow = window as typeof window & { __estimateScrollBehaviors?: string[] };
    targetWindow.__estimateScrollBehaviors = [];
    Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
      const behavior = typeof options === "object" ? options.behavior : undefined;
      targetWindow.__estimateScrollBehaviors?.push(behavior ?? "auto");
    };
  });
  const scopeSearch = page.getByRole("combobox", { name: "Search scope" });
  await scopeSearch.fill("Section 2");
  await scopeSearch.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const targetWindow = window as typeof window & { __estimateScrollBehaviors?: string[] };
        return targetWindow.__estimateScrollBehaviors?.at(-1);
      })
    )
    .toBe("auto");

  await page.setViewportSize({ width: 1280, height: 900 });
  const jumpToSection = page.getByLabel("Jump to section");
  await expect(jumpToSection).toBeVisible();
  const secondSectionValue = await jumpToSection.locator("option").nth(1).getAttribute("value");
  expect(secondSectionValue).not.toBeNull();
  await jumpToSection.selectOption(secondSectionValue!);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const targetWindow = window as typeof window & { __estimateScrollBehaviors?: string[] };
        return targetWindow.__estimateScrollBehaviors?.at(-1);
      })
    )
    .toBe("auto");

  const dragHandle = firstSection.getByRole("button", { name: "Reorder section" });
  await dragHandle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => firstSection.evaluate((section) => getComputedStyle(section).transitionDuration))
    .toBe("0s");
  await page.keyboard.press("Escape");
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

  const composedRowMetrics = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".eb-line-item-grid--pricing");
    if (!row) throw new Error("Estimate line-item grid is required");
    const requireNode = (selector: string) => {
      const node = row.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing line-item control: ${selector}`);
      return node.getBoundingClientRect();
    };
    const title = requireNode('input[aria-label="Line item 1 title"]');
    const description = requireNode('button[aria-label="Line item 1 description"]');
    const quantity = requireNode('input[aria-label="Line item 1 quantity"]');
    const unitPrice = requireNode('input[aria-label="Line item 1 unit price"]');
    const lineTotal = requireNode(".eb-line-total-block");
    const actions = requireNode('button[aria-label="More actions"]');
    const centers = [quantity, unitPrice, lineTotal, actions].map(
      (rect) => rect.top + rect.height / 2
    );

    return {
      descriptionAfterTitle: description.left >= title.right - 1,
      pricingCenterSpread: Math.max(...centers) - Math.min(...centers),
      controlsWithinRow: [title, description, quantity, unitPrice, lineTotal, actions].every(
        (rect) =>
          rect.top >= row.getBoundingClientRect().top &&
          rect.bottom <= row.getBoundingClientRect().bottom
      ),
    };
  });
  expect(composedRowMetrics.descriptionAfterTitle).toBe(true);
  expect(composedRowMetrics.pricingCenterSpread).toBeLessThanOrEqual(4);
  expect(composedRowMetrics.controlsWithinRow).toBe(true);

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

  await reloadWithE2EAuth(page);
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

  await gotoWithE2EAuth(page, `${detailUrl}/preview`);
  const preview = page.getByTestId("estimate-document");
  await expect(preview).toContainText(richDescription, { timeout: 30_000 });
  await expect(preview.locator("ol")).toHaveCount(1);
  await expect(preview.locator("ol > li")).toHaveCount(1);

  await gotoWithE2EAuth(page, `${detailUrl}/print`);
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

test("desktop Scope uses one composed line-editor grid with aligned totals", async ({ page }) => {
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
    if (viewport.width >= 1200) await expect(compactPricing).toBeVisible();
    else await expect(compactPricing).toBeHidden();

    if (viewport.width === 390) {
      await expect(page.getByTestId("estimate-line-item-grid-header")).toBeHidden();
      const addDetails = page.getByRole("button", { name: "Edit line item 1: Untitled" });
      await addDetails.scrollIntoViewIfNeeded();
      await expect(addDetails).toBeVisible();
      await expect
        .poll(() =>
          addDetails.locator("svg").evaluate((icon) => getComputedStyle(icon).transitionDuration)
        )
        .toBe("0s");
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
      await page
        .getByRole("dialog", { name: "Delete line item?" })
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(mobileRows).toHaveCount(1);
      await expect(mobileRows.first().locator(".eb-line-item-mobile-summary")).toBeFocused();
    } else if (viewport.width < 1280) {
      await scopeTools.scrollIntoViewIfNeeded();
    }

    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `estimate-p1-${viewport.name}`);
  });
}

test("existing Estimate exposes the same Scope toolbar without changing save or preview semantics", async ({
  page,
}, testInfo) => {
  const runtime = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${POPULATED_EDITABLE_ESTIMATE_ID}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();

  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  await expect(scopeTools).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Estimate sections" })).toHaveCount(0);
  await expect(scopeTools.getByLabel("Jump to section")).toBeHidden();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Drag to reorder line item/ }).first()
  ).toBeVisible();
  await capture(page, testInfo, "estimate-p1-existing-desktop");
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});
