import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_PROJECT_LABEL,
} from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const OPEN_SECTIONS = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  REPORTS: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

const TEST_PREFIX = "[E2E] Material Selection";
const E2E_PRESERVED_CUSTOMER_LABEL = "[E2E] Test Customer";
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    test.skip(true, "Material selection tests require local Supabase env.");
  }
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url!, key!);
}

async function cleanupMaterialSelections(db: SupabaseClient) {
  const { data } = await db
    .from("material_selections")
    .select("id")
    .ilike("title", `${TEST_PREFIX}%`);
  const ids = (data ?? []).map((row) => (row as { id: string }).id).filter(Boolean);
  if (ids.length === 0) return;
  await db.from("material_selection_items").delete().in("selection_id", ids);
  await db.from("material_selections").delete().in("id", ids);
}

async function openSidebarForDesktop(page: Page) {
  await page.addInitScript((sections) => {
    window.localStorage.setItem("hh.sidebarCollapsed", "0");
    window.localStorage.setItem("hh.sidebarSections", JSON.stringify(sections));
  }, OPEN_SECTIONS);
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(Math.max(metrics.documentWidth, metrics.bodyWidth)).toBeLessThanOrEqual(
    metrics.viewportWidth + 2
  );
}

async function createSelection(page: Page, title: string) {
  await page.goto("/materials/new");
  await expect(page.getByRole("heading", { name: "New Material Selection" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByLabel("Title").fill(title);
  await chooseSearchableComboboxOption(page, "Customer", E2E_PRESERVED_CUSTOMER_LABEL);
  await chooseSearchableComboboxOption(page, "Project", E2E_PRESERVED_PROJECT_LABEL);
  await expect(page.getByLabel("Status")).toHaveValue("draft");
  await page.getByLabel("Notes").fill("Selection notes for customer approval.");
  await page.getByRole("button", { name: "Create Selection" }).click();

  await expect(page).toHaveURL(/\/materials\/[0-9a-f-]+$/i, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
}

async function chooseSearchableComboboxOption(page: Page, field: string, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("searchbox", { name: `Search ${field.toLowerCase()}s` }).fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addMaterialItem(
  page: Page,
  item: {
    area: string;
    category: string;
    name: string;
    brand?: string;
    sku?: string;
    size?: string;
    color?: string;
    finish?: string;
    imageUrl?: string;
    notes?: string;
    status?: string;
  }
) {
  await page.getByRole("button", { name: "Add Item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Material Item" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Area").fill(item.area);
  await dialog.getByLabel("Category").fill(item.category);
  await dialog.getByLabel("Material name").fill(item.name);
  if (item.brand) await dialog.getByLabel("Brand").fill(item.brand);
  if (item.sku) await dialog.getByLabel("SKU / Model").fill(item.sku);
  if (item.size) await dialog.getByLabel("Size").fill(item.size);
  if (item.color) await dialog.getByLabel("Color").fill(item.color);
  if (item.finish) await dialog.getByLabel("Finish").fill(item.finish);
  if (item.imageUrl) await dialog.getByLabel("Image URL").fill(item.imageUrl);
  if (item.notes) await dialog.getByLabel("Item notes").fill(item.notes);
  if (item.status) await dialog.getByLabel("Item status").selectOption(item.status);
  await dialog.getByRole("button", { name: "Save Item" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
}

test.describe("Material Selections", () => {
  test.beforeEach(async ({ page }) => {
    await openSidebarForDesktop(page);
  });

  test.beforeAll(async () => {
    await cleanupMaterialSelections(adminClient());
  });

  test.afterAll(async () => {
    await cleanupMaterialSelections(adminClient());
  });

  test("sidebar and list page use Material Selections instead of Material Catalog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await expect(page.locator("[data-app-sidebar]:visible").first()).toContainText(
      "Material Selections",
      { timeout: 30_000 }
    );
    await expect(page.locator("[data-app-sidebar]:visible").first()).not.toContainText(
      "Material Catalog"
    );

    await page.getByRole("link", { name: /^Material Selections$/ }).click();
    await expect(page).toHaveURL(/\/materials$/);
    await expect(page.getByRole("heading", { name: "Material Selections" })).toBeVisible();
    await expect(page.getByText("Customer/project material approval sheets.")).toBeVisible();
    await expect(page.getByRole("link", { name: "New Selection" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Material Catalog");
  });

  test("creates a selection, allows duplicate categories per area, and renders preview", async ({
    page,
  }) => {
    const title = `${TEST_PREFIX} ${Date.now()}`;
    await createSelection(page, title);

    await addMaterialItem(page, {
      area: "Master Bathroom",
      category: "Tile",
      name: "White Porcelain 24x48",
      brand: "Daltile",
      sku: "WP-2448",
      size: "24x48",
      color: "White",
      finish: "Matte",
      imageUrl: TINY_PNG_DATA_URL,
      notes: "Primary shower wall tile.",
      status: "selected",
    });
    await addMaterialItem(page, {
      area: "Master Bathroom",
      category: "Tile",
      name: "Blue Mosaic",
      finish: "Gloss",
      status: "approved",
    });
    await addMaterialItem(page, {
      area: "Kitchen",
      category: "Countertop",
      name: "Quartz Slab Calacatta",
      status: "installed",
    });

    const masterArea = page.getByTestId("material-area-Master Bathroom");
    await expect(masterArea).toContainText("Master Bathroom");
    await expect(masterArea.getByText(/^Tile$/)).toHaveCount(2);
    await expect(masterArea).toContainText("White Porcelain 24x48");
    await expect(masterArea).toContainText("Blue Mosaic");
    await expect(page.getByTestId("material-area-Kitchen")).toContainText("Quartz Slab Calacatta");

    await page.getByRole("link", { name: "Preview" }).click();
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]+\/preview$/i);
    const document = page.getByRole("document", { name: "Material selection preview" });
    await expect(document).toContainText(title, { timeout: 30_000 });
    await expect(document).toContainText(E2E_PRESERVED_CUSTOMER_LABEL);
    await expect(document).toContainText(E2E_PRESERVED_PROJECT_LABEL);
    await expect(document).toContainText("Master Bathroom");
    await expect(document).toContainText("White Porcelain 24x48");
    await expect(document).toContainText("Blue Mosaic");
    await expect(document.getByRole("img", { name: "White Porcelain 24x48" })).toBeVisible();
    await expect(document).toContainText("Customer Signature / Date");
    await expect(document).toContainText("Contractor Signature / Date");
    await expect(document).toContainText(
      "Material colors, availability, and lead times are subject to final supplier confirmation."
    );
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      /\/api\/materials\/[0-9a-f-]+\/pdf$/i
    );
  });

  test("uses searchable comboboxes for optional customer and project fields", async ({ page }) => {
    await page.goto("/materials/new");
    await expect(page.getByRole("heading", { name: "New Material Selection" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.locator('select[name="customerId"]')).toHaveCount(0);
    await expect(page.locator('select[name="projectId"]')).toHaveCount(0);

    await expect(page.getByRole("combobox", { name: "Customer" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Project" })).toBeVisible();

    await page.getByRole("combobox", { name: "Customer" }).click();
    await expect(page.getByRole("searchbox", { name: "Search customers" })).toBeVisible();
    await expect(page.getByRole("option", { name: "No customer" })).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search customers" })
      .fill(E2E_PRESERVED_CUSTOMER_LABEL);
    await page.getByRole("option", { name: E2E_PRESERVED_CUSTOMER_LABEL, exact: true }).click();
    await expect(page.locator('input[name="customerId"]')).toHaveValue(E2E_PRESERVED_CUSTOMER_ID);

    await page.getByRole("combobox", { name: "Project" }).click();
    await expect(page.getByRole("searchbox", { name: "Search projects" })).toBeVisible();
    await expect(page.getByRole("option", { name: "No project" })).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search projects" })
      .fill(E2E_PRESERVED_PROJECT_LABEL);
    await page.getByRole("option", { name: E2E_PRESERVED_PROJECT_LABEL, exact: true }).click();
    await expect(page.locator('input[name="projectId"]')).toHaveValue(E2E_PRESERVED_PROJECT_ID);
  });

  test("deletes a selection from the list after confirmation", async ({ page }) => {
    const title = `${TEST_PREFIX} Delete ${Date.now()}`;
    await createSelection(page, title);

    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/materials$/);
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: `Delete ${title}` }).click();

    const dialog = page.getByRole("dialog", { name: "Delete material selection?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(title);
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("row").filter({ hasText: title })).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test("materials list and detail do not horizontally overflow on mobile", async ({ page }) => {
    const title = `${TEST_PREFIX} Mobile ${Date.now()}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await createSelection(page, title);
    await expectNoHorizontalOverflow(page);

    await page.goto("/materials");
    await expect(page.getByRole("heading", { name: "Material Selections" })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoHorizontalOverflow(page);
  });
});
