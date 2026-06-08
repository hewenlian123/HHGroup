import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();
const createdTemplateNames = new Set<string>();

async function getSupabaseForCleanup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

async function cleanupEstimateTemplates(names: Iterable<string>): Promise<void> {
  const supabase = await getSupabaseForCleanup();
  if (!supabase) return;
  const values = Array.from(names);
  if (values.length === 0) return;
  await supabase.from("estimate_templates").delete().in("name", values);
}

async function cleanupEstimateTestData(
  clientNames: Iterable<string>,
  projectNames: Iterable<string>
): Promise<void> {
  const supabase = await getSupabaseForCleanup();
  if (!supabase) return;
  const clients = Array.from(clientNames);
  const projects = Array.from(projectNames);
  if (clients.length === 0 && projects.length === 0) return;

  const estimateIds = new Set<string>();
  if (clients.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("client", clients);
    for (const row of data ?? []) if (row.id) estimateIds.add(String(row.id));
  }
  if (projects.length > 0) {
    const { data } = await supabase.from("estimates").select("id").in("project", projects);
    for (const row of data ?? []) if (row.id) estimateIds.add(String(row.id));
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

function templateRow(page: Page, name: string) {
  return page.getByTestId("estimate-template-row").filter({ hasText: name }).first();
}

async function openTemplateActions(page: Page, name: string): Promise<void> {
  await templateRow(page, name)
    .getByRole("button", { name: `Actions for ${name}` })
    .click();
}

async function fillTemplateDialog(
  page: Page,
  params: {
    name: string;
    description: string;
    category: string;
    section: string;
    item: string;
    itemDescription: string;
    qty: string;
    unitPrice: string;
  }
): Promise<void> {
  const dialog = page.getByTestId("estimate-template-dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.locator(".eb-scope-section-header")).toBeVisible();
  await expect(dialog.locator(".eb-line-item-grid--pricing")).toBeVisible();
  await expect(dialog.locator(".eb-scope-editor-surface")).toBeVisible();
  await dialog.getByTestId("estimate-template-name").fill(params.name);
  await dialog
    .getByPlaceholder("Reusable scope for recurring estimate types…")
    .fill(params.description);
  await dialog.getByLabel("Category").fill(params.category);
  await dialog.getByLabel("Template section 1 title").fill(params.section);
  await dialog.getByLabel("Template item 1 title").fill(params.item);
  await dialog.getByLabel("Template item 1 quantity").fill(params.qty);
  await dialog.getByLabel("Template item 1 unit price").fill(params.unitPrice);
  await dialog.getByLabel("Template item 1 description").fill(params.itemDescription);
}

async function fillNewEstimateCustomerFields(
  page: Page,
  params: { clientName: string; projectName: string }
): Promise<void> {
  await page.getByRole("button", { name: /Edit details/i }).click();
  const detailsDialog = page.getByRole("dialog", {
    name: /Customer \/ project \/ pricing details/i,
  });
  await expect(detailsDialog).toBeVisible({ timeout: 10_000 });
  await detailsDialog.getByPlaceholder("Client or company name").fill(params.clientName);
  await detailsDialog.getByPlaceholder("Project name").fill(params.projectName);
  await detailsDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(detailsDialog).toBeHidden({ timeout: 10_000 });
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  await cleanupEstimateTemplates(createdTemplateNames);
  createdClientNames.clear();
  createdProjectNames.clear();
  createdTemplateNames.clear();
});

test("estimate templates CRUD, save-as-template, and create estimate from template", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const suffix = Date.now();
  const templateName = `PW Estimate Template ${suffix}`;
  const duplicateName = `${templateName} copy`;
  const savedTemplateName = `PW Saved Estimate Template ${suffix}`;
  const clientName = `PW Template Estimate Customer ${suffix}`;
  const projectName = `PW Template Estimate Project ${suffix}`;
  const sectionName = `Template Demolition ${suffix}`;
  const lineTitle = `Template Living Room Demo ${suffix}`;
  createdTemplateNames.add(templateName);
  createdTemplateNames.add(duplicateName);
  createdTemplateNames.add(savedTemplateName);
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimate-templates");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "Estimate Templates" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId("estimate-template-create").click();
  await fillTemplateDialog(page, {
    name: templateName,
    description: "Reusable QA template",
    category: "QA Templates",
    section: sectionName,
    item: lineTitle,
    itemDescription: "Remove existing flooring and prepare area.",
    qty: "2",
    unitPrice: "1250",
  });
  await page.getByTestId("estimate-template-save").click();
  await expect(page.getByTestId("estimate-template-dialog")).toBeHidden({ timeout: 15_000 });
  await expect(templateRow(page, templateName)).toBeVisible({ timeout: 30_000 });

  await openTemplateActions(page, templateName);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editDialog = page.getByTestId("estimate-template-dialog");
  await expect(editDialog).toBeVisible({ timeout: 10_000 });
  await editDialog
    .getByPlaceholder("Reusable scope for recurring estimate types…")
    .fill("Edited QA template");
  await page.getByTestId("estimate-template-save").click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(templateRow(page, templateName)).toContainText("Edited QA template", {
    timeout: 30_000,
  });

  await openTemplateActions(page, templateName);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(templateRow(page, duplicateName)).toBeVisible({ timeout: 30_000 });

  await openTemplateActions(page, duplicateName);
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(templateRow(page, duplicateName)).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show archived" }).click();
  await expect(templateRow(page, duplicateName)).toContainText("Archived", { timeout: 30_000 });

  await openTemplateActions(page, duplicateName);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(templateRow(page, duplicateName)).toBeHidden({ timeout: 30_000 });

  await templateRow(page, templateName).getByRole("link", { name: "Use" }).click();
  await expect(page).toHaveURL(/\/estimates\/new\?templateId=/, { timeout: 30_000 });
  await expect(page.getByTestId("estimate-template-selector")).toContainText("Estimate template");
  await expect(page.getByLabel("Line item 1 title").locator("visible=true")).toHaveValue(
    lineTitle,
    { timeout: 30_000 }
  );
  await expect(page.getByText("$2,500.00").locator("visible=true").first()).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(sectionName, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(lineTitle);
  await expect(page.locator("body")).toContainText("$2,500.00");

  await page.getByLabel("Estimate actions").click();
  await page.getByTestId("save-estimate-as-template-action").click();
  const saveAsDialog = page.getByTestId("save-estimate-as-template-dialog");
  await expect(saveAsDialog).toBeVisible({ timeout: 10_000 });
  await saveAsDialog.getByTestId("save-template-name").fill(savedTemplateName);
  await saveAsDialog.getByTestId("save-estimate-as-template-submit").click();
  await expect(saveAsDialog).toBeHidden({ timeout: 15_000 });

  await page.goto("/estimate-templates", { waitUntil: "domcontentloaded" });
  await expect(templateRow(page, savedTemplateName)).toBeVisible({ timeout: 30_000 });
  await expect(templateRow(page, savedTemplateName)).toContainText("1 sections · 1 items");
});
