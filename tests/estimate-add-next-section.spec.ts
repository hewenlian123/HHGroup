import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates/new");
});

test.afterEach(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const ids = new Set<string>();
  for (const client of createdClientNames) {
    const { data } = await supabase.from("estimates").select("id").eq("client", client);
    for (const row of data ?? []) ids.add(String(row.id));
  }
  for (const project of createdProjectNames) {
    const { data } = await supabase.from("estimates").select("id").eq("project", project);
    for (const row of data ?? []) ids.add(String(row.id));
  }
  const estimateIds = Array.from(ids);
  if (estimateIds.length > 0) {
    await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_snapshots").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_items").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_categories").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_meta").delete().in("estimate_id", estimateIds);
    await supabase.from("estimates").delete().in("id", estimateIds);
  }
  createdClientNames.clear();
  createdProjectNames.clear();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function visibleSection(page: Page, name: string): Locator {
  return page
    .locator("[data-estimate-section-id]:visible, [data-estimate-section-mobile-id]:visible")
    .filter({ hasText: name })
    .first();
}

async function sectionOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-estimate-section-id]:visible, [data-estimate-section-mobile-id]:visible")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const title = node.querySelector<HTMLElement>(
          '[aria-label^="Section:"], input[aria-label^="Section name for "]'
        );
        if (title instanceof HTMLInputElement) return title.value.trim();
        return title?.textContent?.trim() || node.textContent?.trim() || "";
      })
    );
}

async function expectSectionOrder(page: Page, expectedNames: string[]): Promise<void> {
  await expect.poll(async () => sectionOrder(page), { timeout: 30_000 }).toEqual(expectedNames);
}

async function addTemplateSection(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^Add Section$/i }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${escapeRegExp(name)}$`, "i") }).click();
  await expect(
    page
      .getByLabel(new RegExp(`^Section name for ${escapeRegExp(name)}$`, "i"))
      .locator("visible=true")
      .first()
  ).toBeVisible({ timeout: 15_000 });
}

async function insertCustomSectionAfter(
  page: Page,
  afterName: string,
  insertedName: string
): Promise<void> {
  const trigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after ${escapeRegExp(afterName)}$`, "i"),
  });
  await trigger.scrollIntoViewIfNeeded();
  const workspace = page.locator("main.estimate-builder-active");
  const scrollTopBeforeOpen = await workspace.evaluate((element) => element.scrollTop);

  await trigger.click();
  const contextualSearch = page.getByRole("textbox", {
    name: new RegExp(`^Search section after ${escapeRegExp(afterName)}$`, "i"),
  });
  await expect(contextualSearch).toBeVisible();
  await expect(contextualSearch).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await expect
    .poll(async () => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThanOrEqual(Math.max(0, scrollTopBeforeOpen - 2));
  await contextualSearch.fill(insertedName);
  await page
    .getByRole("option", { name: new RegExp(`^Create "${escapeRegExp(insertedName)}"$`, "i") })
    .click();

  const inserted = visibleSection(page, insertedName);
  await expect(inserted).toBeVisible({ timeout: 30_000 });
  await expect(inserted.locator('input[aria-label="Line item title"]').first()).toBeFocused({
    timeout: 30_000,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const scrollWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          );
          return scrollWidth - window.innerWidth;
        }),
      { timeout: 10_000 }
    )
    .toBeLessThanOrEqual(1);
}

async function expectMenuInsideViewportWithoutLineOverlap(
  page: Page,
  menu: Locator
): Promise<void> {
  await expect
    .poll(async () => {
      return menu.evaluate((element) => {
        const menuRect = element.getBoundingClientRect();
        const intersectsLine = Array.from(
          document.querySelectorAll<HTMLElement>(".eb-line-item-card")
        ).some((candidate) => {
          const lineRect = candidate.getBoundingClientRect();
          if (lineRect.width <= 0 || lineRect.height <= 0) return false;
          return (
            menuRect.left < lineRect.right &&
            menuRect.right > lineRect.left &&
            menuRect.top < lineRect.bottom &&
            menuRect.bottom > lineRect.top
          );
        });
        return (
          menuRect.left >= 0 &&
          menuRect.top >= 0 &&
          menuRect.right <= window.innerWidth &&
          menuRect.bottom <= window.innerHeight &&
          !intersectsLine
        );
      });
    })
    .toBe(true);
}

test("Add Next Section inserts in context, preserves order, and remains responsive", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const browserErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/favicon|ResizeObserver loop/i.test(message.text())) return;
    browserErrors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "unknown";
    if (/ERR_ABORTED/i.test(reason)) return;
    failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
  });
  const suffix = Date.now();
  const clientName = `PW Add Next Section ${suffix}`;
  const projectName = `PW Add Next Section Project ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.getByRole("button", { name: /Edit details/i }).click();
  const details = page.getByRole("dialog");
  await details.getByPlaceholder("Client or company name").fill(clientName);
  await details.getByPlaceholder("Project name").fill(projectName);
  await details.getByRole("button", { name: "Save", exact: true }).click();

  for (const sectionName of ["Demolition", "Concrete", "Electrical"]) {
    await addTemplateSection(page, sectionName);
  }
  await expect(page.getByRole("button", { name: /^Add Section$/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Add Next Section after /i })).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Add Final Section$/i })).toHaveCount(1);

  const newContextSection = `New Context ${suffix}`;
  const newContextTrigger = page.getByRole("button", {
    name: /^Add Next Section after Demolition$/i,
  });
  await newContextTrigger.click();
  const newContextMenu = page.getByRole("menu");
  await expect(newContextMenu).toHaveCount(1);
  await expectMenuInsideViewportWithoutLineOverlap(page, newContextMenu);
  await newContextMenu
    .getByRole("textbox", { name: "Custom section title" })
    .fill(newContextSection);
  await newContextMenu.getByRole("button", { name: "Add custom section" }).click();
  await expectSectionOrder(page, ["Demolition", newContextSection, "Concrete", "Electrical"]);

  const titles = page.getByLabel(/Line item \d+ title/i);
  for (let index = 0; index < (await titles.count()); index += 1) {
    await titles.nth(index).fill(`Add Next QA line ${index + 1}`);
  }
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add Section$/i })).toHaveCount(1);
  await expectSectionOrder(page, ["Demolition", newContextSection, "Concrete", "Electrical"]);

  await insertCustomSectionAfter(page, "Demolition", `After First ${suffix}`);
  await insertCustomSectionAfter(page, "Concrete", `After Middle ${suffix}`);
  await insertCustomSectionAfter(page, "Electrical", `After Last ${suffix}`);

  const finalTrigger = page.getByRole("button", { name: /^Add Final Section$/i });
  await finalTrigger.scrollIntoViewIfNeeded();
  await finalTrigger.click();
  const finalSearch = page.getByRole("textbox", { name: /^Search final section$/i });
  await expect(finalSearch).toBeFocused();
  await finalSearch.fill(`Final Section ${suffix}`);
  await page
    .getByRole("option", { name: new RegExp(`^Create "Final Section ${suffix}"$`, "i") })
    .click();

  const expectedOrder = [
    "Demolition",
    `After First ${suffix}`,
    newContextSection,
    "Concrete",
    `After Middle ${suffix}`,
    "Electrical",
    `After Last ${suffix}`,
    `Final Section ${suffix}`,
  ];
  await expectSectionOrder(page, expectedOrder);

  const duplicateTrigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after After First ${suffix}$`, "i"),
  });
  await duplicateTrigger.click();
  await page.getByRole("option", { name: /^Concrete Already added$/i }).click();
  await expectSectionOrder(page, expectedOrder);
  await expect(
    visibleSection(page, "Concrete").locator('input[aria-label="Line item title"]').first()
  ).toBeFocused();

  const middleTrigger = page.getByRole("button", {
    name: new RegExp(`^Add Next Section after After Middle ${suffix}$`, "i"),
  });
  await middleTrigger.click();
  await expect(page.getByRole("listbox")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(middleTrigger).toBeFocused();

  await middleTrigger.click();
  await page.getByRole("heading", { name: "Scope of work" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(middleTrigger).toBeFocused();

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expectSectionOrder(page, expectedOrder);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const visibleNextActions = page
      .getByRole("button", { name: /^Add Next Section after /i })
      .locator("visible=true");
    await expect(visibleNextActions).toHaveCount(expectedOrder.length);
    const firstAction = visibleNextActions.first();
    const actionBox = await firstAction.boundingBox();
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await firstAction.scrollIntoViewIfNeeded();
    await firstAction.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toHaveCount(1);
    await expectMenuInsideViewportWithoutLineOverlap(page, menu);
    await page.keyboard.press("Escape");
  }

  expect(browserErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
