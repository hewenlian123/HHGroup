import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates");
});

const CUSTOM_SECTION_NAMES = [
  "Site Preparation",
  "Demolition",
  "Excavation",
  "Foundation",
  "Concrete",
  "Framing",
  "Roofing",
  "Window",
  "Drywall",
  "Insulation",
  "Rough In",
  "Paint",
  "Door",
  "Flooring",
  "Cabinet and Finish Carpentry Closeout",
] as const;

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

async function addCustomSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("textbox", { name: "Custom section title" }).fill(name);
  await menu.getByRole("button", { name: "Add custom section" }).click();
  await expect(menu).toBeHidden({ timeout: 10_000 });
}

async function attemptDuplicateCustomSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("textbox", { name: "Custom section title" }).fill(name);
  await expect(menu.getByText("A section with this name already exists.")).toBeVisible();
  await expect(menu.getByRole("button", { name: "Add custom section" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden({ timeout: 10_000 });
}

async function sectionTexts(page: Page): Promise<string[]> {
  return page
    .locator("[data-estimate-section-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
}

async function expectSectionOrder(page: Page, names: readonly string[]): Promise<void> {
  await expect
    .poll(async () => sectionTexts(page), { timeout: 30_000 })
    .toEqual(expect.arrayContaining(names.map((name) => expect.stringContaining(name))));

  const texts = await sectionTexts(page);
  let lastIndex = -1;
  for (const name of names) {
    const index = texts.findIndex((text) => text.includes(name));
    expect(index, `Expected section "${name}" to appear after previous section`).toBeGreaterThan(
      lastIndex
    );
    lastIndex = index;
  }
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

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("new estimate supports more than thirteen custom proposal sections", async ({ page }) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const clientName = `PW Custom Sections ${suffix}`;
  const projectName = `PW Custom Sections Project ${suffix}`;
  const paymentTitle = `PW Custom Sections Payment ${suffix}`;
  const renamedSection = `Renamed Proposal Section ${suffix}`;
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
  await detailsDialog.getByPlaceholder("Client or company name").fill(clientName);
  await detailsDialog.getByPlaceholder("Project name").fill(projectName);
  await detailsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(detailsDialog).toBeHidden({ timeout: 10_000 });

  await addCustomSection(page, CUSTOM_SECTION_NAMES[0]);
  await attemptDuplicateCustomSection(page, CUSTOM_SECTION_NAMES[0]);
  for (let index = 1; index < CUSTOM_SECTION_NAMES.length; index++) {
    await addCustomSection(page, CUSTOM_SECTION_NAMES[index]);
  }

  await expect(page.locator("[data-estimate-section-id]")).toHaveCount(CUSTOM_SECTION_NAMES.length);
  for (let index = 0; index < CUSTOM_SECTION_NAMES.length; index++) {
    await page
      .getByLabel(`Line item ${index + 1} title`)
      .locator("visible=true")
      .fill(`Custom proposal line ${index + 1}`);
    await page
      .getByLabel(`Line item ${index + 1} quantity`)
      .locator("visible=true")
      .fill("1");
    await page
      .getByLabel(`Line item ${index + 1} unit price`)
      .locator("visible=true")
      .fill("100");
  }

  await page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Payment schedule" }) })
    .first()
    .evaluate((node) => {
      if (node instanceof HTMLDetailsElement) node.open = true;
    });
  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const paymentDialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(paymentDialog).toBeVisible({ timeout: 10_000 });
  await paymentDialog.getByLabel("Payment Name").fill(paymentTitle);
  await paymentDialog.getByLabel("Amount").fill("1500");
  await paymentDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(paymentDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(paymentTitle, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Estimate overview")).toContainText("$1,500.00");

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const detailUrl = page.url().replace(/\?.*$/, "");

  await expectSectionOrder(page, CUSTOM_SECTION_NAMES);
  await expect(page.locator("body")).toContainText(paymentTitle);
  await expect(page.locator("body")).toContainText("$1,500.00");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectSectionOrder(page, CUSTOM_SECTION_NAMES);
  await expect(page.locator("body")).toContainText(paymentTitle);
  await expect(page.locator("body")).toContainText("$1,500.00");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", {
      name: new RegExp(`Section: ${CUSTOM_SECTION_NAMES[0]}\\. Open menu to change or rename\\.`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Rename section…" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename section" });
  await expect(renameDialog).toBeVisible({ timeout: 10_000 });
  await renameDialog.getByLabel("Name").fill(renamedSection);
  await renameDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(renameDialog).toBeHidden({ timeout: 10_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(renamedSection, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(paymentTitle);
  await expect(page.locator("body")).toContainText("$1,500.00");

  await page.goto(`${detailUrl}/preview`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toContainText(renamedSection, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(CUSTOM_SECTION_NAMES[14]);
  await expect(page.locator("main")).toContainText(paymentTitle);
  await expect(page.locator("main")).toContainText("$1,500.00");

  await page.goto(`${detailUrl}/print`, { waitUntil: "domcontentloaded" });
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  await expect(printDocument).toContainText(renamedSection, { timeout: 30_000 });
  await expect(printDocument).toContainText(CUSTOM_SECTION_NAMES[14]);
  await expect(printDocument).toContainText(paymentTitle);
  await expect(printDocument).toContainText("$1,500.00");
});
