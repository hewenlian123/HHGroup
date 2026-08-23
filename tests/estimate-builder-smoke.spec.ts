import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates");
});

async function cleanupEstimateTestData(
  clientNames: Iterable<string>,
  projectNames: Iterable<string>
): Promise<void> {
  const clients = Array.from(clientNames);
  const projects = Array.from(projectNames);
  if (clients.length === 0 && projects.length === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const estimateIds = new Set<string>();

  if (clients.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("client", clients);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }
  if (projects.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("project", projects);
    for (const row of data ?? []) {
      if (row.id) estimateIds.add(String(row.id));
    }
  }

  const ids = Array.from(estimateIds);
  if (ids.length === 0) return;

  await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_snapshots").delete().in("estimate_id", ids);
  await supabase.from("estimate_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_categories").delete().in("estimate_id", ids);
  await supabase.from("estimate_meta").delete().in("estimate_id", ids);
  await supabase.from("estimates").delete().in("id", ids);
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

async function addBlankEstimateSection(page: import("@playwright/test").Page): Promise<void> {
  const addSection = page.getByRole("button", { name: /^Add Section$/i }).first();
  await expect(addSection).toBeVisible({ timeout: 30_000 });
  await addSection.click();

  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }
}

function captureUnexpectedBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|ResizeObserver loop/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectVisibleSectionName(page: Page, name: string): Promise<void> {
  const input = page
    .getByLabel(new RegExp(`^Section name for ${escapeRegExp(name)}$`, "i"))
    .locator("visible=true")
    .first();
  if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await expect(input).toHaveValue(name, { timeout: 15_000 });
    return;
  }
  await expect(
    page
      .getByRole("button", {
        name: new RegExp(`^Section: ${escapeRegExp(name)}\\. Open menu`, "i"),
      })
      .first()
  ).toBeVisible({ timeout: 15_000 });
}

async function addTemplateSectionFromNewComposer(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}$`, "i") }).click();
  await expectVisibleSectionName(page, name);
}

async function expectSavedSectionMenuLayout(page: Page): Promise<void> {
  const visibleAddSectionActions = page
    .getByRole("button", { name: /^Add Section$/i })
    .locator("visible=true");
  await expect(visibleAddSectionActions).toHaveCount(1);

  let search = page
    .getByRole("textbox", { name: /^Search or add section(?: from outline)?$/i })
    .locator("visible=true")
    .first();
  if (!(await search.isVisible().catch(() => false))) {
    await visibleAddSectionActions.click();
    search = page
      .getByRole("textbox", { name: /^Search or add section(?: from outline)?$/i })
      .locator("visible=true")
      .first();
  }
  await expect(search).toBeVisible();
  await search.scrollIntoViewIfNeeded();
  await search.click();

  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible({ timeout: 10_000 });
  const layout = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const firstVisibleLine = Array.from(
      document.querySelectorAll<HTMLElement>(".eb-line-item-card")
    ).find((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return candidateRect.width > 0 && candidateRect.height > 0;
    });
    const lineRect = firstVisibleLine?.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      Math.min(rect.right - 2, rect.left + rect.width / 2),
      Math.min(rect.bottom - 2, rect.top + rect.height / 2)
    );

    return {
      backgroundColor: style.backgroundColor,
      overflowY: style.overflowY,
      zIndex: Number(style.zIndex || 0),
      menu: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      line: lineRect
        ? { top: lineRect.top, right: lineRect.right, bottom: lineRect.bottom, left: lineRect.left }
        : null,
      menuOwnsTopmostPoint: Boolean(topmost && element.contains(topmost)),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  const rgbaMatch = layout.backgroundColor.match(/rgba?\(([^)]+)\)/);
  const colorParts = rgbaMatch?.[1]?.split(",").map((part) => Number(part.trim())) ?? [];
  const backgroundAlpha = colorParts.length === 4 ? colorParts[3] : colorParts.length === 3 ? 1 : 0;
  expect(backgroundAlpha).toBeGreaterThanOrEqual(0.95);
  expect(layout.zIndex).toBeGreaterThanOrEqual(200);
  expect(layout.overflowY).toBe("auto");
  expect(layout.menuOwnsTopmostPoint).toBe(true);
  expect(layout.menu.left).toBeGreaterThanOrEqual(0);
  expect(layout.menu.top).toBeGreaterThanOrEqual(0);
  expect(layout.menu.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.menu.bottom).toBeLessThanOrEqual(layout.viewport.height);
  if (layout.line) {
    const intersectsLine =
      layout.menu.left < layout.line.right &&
      layout.menu.right > layout.line.left &&
      layout.menu.top < layout.line.bottom &&
      layout.menu.bottom > layout.line.top;
    expect(intersectsLine).toBe(false);
  }

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  if (await search.isVisible().catch(() => false)) {
    await expect(search).toBeFocused();
  } else {
    await expect(visibleAddSectionActions).toBeVisible();
    await expect(visibleAddSectionActions).toBeFocused();
    await visibleAddSectionActions.click();
    search = page
      .getByRole("textbox", { name: /^Search or add section(?: from outline)?$/i })
      .locator("visible=true")
      .first();
    await expect(search).toBeFocused();
  }

  await search.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Scope of work" }).click();
  await expect(menu).toBeHidden();
}

test("estimate builder smoke: create, edit totals, preview, open existing edit", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const suffix = Date.now();
  const clientName = `PW Estimate Smoke ${suffix}`;
  const projectName = `PW Estimate Smoke Project ${suffix}`;
  const lineTitle = `PW smoke line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /Edit details/i }).click();
  const detailsDialog = page.getByRole("dialog", {
    name: /Customer \/ project \/ pricing details/i,
  });
  await expect(detailsDialog).toBeVisible({ timeout: 10_000 });
  await expect(detailsDialog).not.toContainText(/markup|overhead|profit/i);
  await page.getByPlaceholder("Client or company name").fill(clientName);
  await page.getByPlaceholder("Project name").fill(projectName);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();

  await addBlankEstimateSection(page);

  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill(lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  const unitInput = page.getByLabel("Line item 1 unit", { exact: true }).locator("visible=true");
  await expect(unitInput).toBeVisible();
  await unitInput.fill("LF");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("110");

  await expect(page.getByText("$110.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("2");
  await expect(page.getByText("$220.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("3");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("100");
  await expect(page.getByText("$300.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByLabel("Estimate pricing summary")).not.toContainText(
    /markup|overhead|profit/i
  );

  await page.getByRole("button", { name: /Schedule Payment/i }).click();
  const scheduleDialog = page.getByRole("dialog", { name: /Schedule Payment/i });
  await expect(scheduleDialog).toBeVisible({ timeout: 10_000 });
  await scheduleDialog.getByLabel("Amount").fill("600");
  await expect(scheduleDialog.getByText("Exceeds estimate total.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(scheduleDialog.locator("#pm-percent-helper")).not.toContainText(/^100%/);
  await scheduleDialog.getByRole("button", { name: "Cancel", exact: true }).click();

  const unitPriceInput = page.getByLabel("Line item 1 unit price").locator("visible=true");
  await unitPriceInput.fill("1367896.16");
  await expect(page.getByText("$4,103,688.48").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });
  const unitPriceBox = await unitPriceInput.boundingBox();
  expect(unitPriceBox?.width ?? 0).toBeGreaterThanOrEqual(56);
  await unitPriceInput.fill("100");
  await expect(page.getByText("$300.00").locator("visible=true").first()).toBeVisible({
    timeout: 10_000,
  });

  const saveAndPreview = page.getByRole("button", { name: "Save & Preview" }).first();
  await expect(saveAndPreview).toBeEnabled({ timeout: 15_000 });
  await saveAndPreview.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+\/preview/, {
    timeout: 30_000,
  });

  const detailUrl = page.url().replace(/\/preview(?:\?.*)?$/, "");

  await expect(page.locator("body")).not.toContainText("Something went wrong");
  const previewMainText = await page.locator("main").evaluate((el) => el.textContent ?? "");
  expect(previewMainText).not.toContain("\u2028");

  await page.goto(detailUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("main")).toContainText(lineTitle, { timeout: 15_000 });
  await expect(
    page.getByLabel("Line item unit", { exact: true }).locator("visible=true").first()
  ).toHaveValue("LF");
  await expect(
    page.getByRole("button", { name: /Drag to reorder line item/ }).first()
  ).toBeVisible();

  const secondLineTitle = `PW second line ${suffix}`;
  await page.getByRole("button", { name: "Add line" }).first().click();
  await page.waitForLoadState("networkidle");
  const secondDesc = page.getByLabel("Line item description").locator("visible=true").nth(1);
  await expect(secondDesc).toBeVisible({ timeout: 30_000 });
  await secondDesc.fill(secondLineTitle);
  await secondDesc.blur();
  await page.getByLabel("Line item quantity").locator("visible=true").nth(1).fill("1");
  await page.getByLabel("Line item quantity").locator("visible=true").nth(1).blur();
  await page.getByLabel("Line item unit price").locator("visible=true").nth(1).fill("50");
  await page.getByLabel("Line item unit price").locator("visible=true").nth(1).blur();
  await expect(page.locator("main")).toContainText(secondLineTitle, { timeout: 15_000 });

  const sectionName = `PW Section ${suffix}`;
  await page
    .getByRole("button", { name: /^Section: .*Open menu to change or rename\.$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "+ Add section", exact: true }).click();
  const addSectionDialog = page.getByRole("dialog", { name: "Add section" });
  await expect(addSectionDialog).toBeVisible();
  await addSectionDialog.getByLabel("Section name").fill(sectionName);
  await addSectionDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Section created").or(page.getByText("Section added")).first()
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("main")).toContainText(secondLineTitle, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(sectionName, { timeout: 30_000 });
});

test("estimate section dropdowns add templates without crashing in new and edit mode", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const browserErrors = captureUnexpectedBrowserErrors(page);
  const suffix = Date.now();
  const clientName = `PW Estimate Section Dropdown ${suffix}`;
  const projectName = `PW Estimate Section Dropdown Project ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /Edit details/i }).click();
  await page.getByPlaceholder("Client or company name").fill(clientName);
  await page.getByPlaceholder("Project name").fill(projectName);
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();

  await addTemplateSectionFromNewComposer(page, "Demolition");
  await addTemplateSectionFromNewComposer(page, "Concrete");

  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const duplicateDemolition = page
    .getByRole("menuitem", { name: /^Demolition Already added$/i })
    .first();
  await expect(duplicateDemolition).toBeVisible({ timeout: 10_000 });
  await duplicateDemolition.click();
  await expectVisibleSectionName(page, "Demolition");

  const customSection = `PW Custom Section ${suffix}`;
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByLabel("Custom section title").fill(customSection);
  await page.getByRole("button", { name: /^Add custom section$/i }).click();
  await expectVisibleSectionName(page, customSection);

  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Dropdown QA line");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("100");
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectSavedSectionMenuLayout(page);
  }
  const addSection = page.getByRole("button", { name: /^Add Section$/i });
  await expect(addSection).toHaveCount(1);
  await addSection.click();
  const contextualSectionSearch = page.getByRole("textbox", {
    name: "Search or add section",
  });
  await expect(contextualSectionSearch).toBeFocused();
  const contextualSectionOptions = page.getByRole("listbox");
  await expect(contextualSectionOptions).toBeVisible();
  await contextualSectionOptions.getByRole("option", { name: /^Electrical$/i }).click();
  await expectVisibleSectionName(page, "Electrical");

  await addSection.click();
  await expect(contextualSectionSearch).toBeFocused();
  const duplicateElectrical = contextualSectionOptions.getByRole("option", {
    name: /^Electrical\s+Already added$/i,
  });
  await expect(duplicateElectrical).toBeVisible();
  await duplicateElectrical.click();
  await expectVisibleSectionName(page, "Electrical");

  expect(browserErrors).toEqual([]);
});
