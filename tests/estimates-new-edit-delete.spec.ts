import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

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

  await supabase.from("estimate_payment_schedule").delete().in("estimate_id", ids);
  await supabase.from("estimate_snapshots").delete().in("estimate_id", ids);
  await supabase.from("estimate_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_categories").delete().in("estimate_id", ids);
  await supabase.from("estimate_meta").delete().in("estimate_id", ids);
  await supabase.from("estimates").delete().in("id", ids);
}

async function fillNewEstimate(
  page: Page,
  params: {
    clientName: string;
    projectName: string;
    lineTitle: string;
    quantity?: string;
    unitPrice?: string;
  }
): Promise<void> {
  await page.getByPlaceholder("Client or company name").fill(params.clientName);
  await page.getByPlaceholder("Project name").fill(params.projectName);

  const addCategory = page.getByRole("button", { name: /^Add Category$/i }).first();
  await expect(addCategory).toBeVisible({ timeout: 30_000 });
  await addCategory.click();

  await expect(page.getByLabel("Line item 1 title")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Line item 1 title").fill(params.lineTitle);
  await page.getByLabel("Line item 1 quantity").fill(params.quantity ?? "2");
  await page.getByLabel("Line item 1 unit price").fill(params.unitPrice ?? "125.5");
}

async function createEstimate(
  page: Page,
  params: {
    clientName: string;
    projectName: string;
    lineTitle: string;
  }
): Promise<string> {
  createdClientNames.add(params.clientName);
  createdProjectNames.add(params.projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimate(page, params);
  const saveButton = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(params.clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(params.lineTitle, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page.url();
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("creates, edits, cancels, saves, and deletes a draft estimate", async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const clientName = `PW Estimate E2E ${suffix}`;
  const canceledClientName = `${clientName} CANCELLED`;
  const savedClientName = `${clientName} SAVED`;
  const projectName = `PW Estimate Project ${suffix}`;
  const lineTitle = `PW estimate line ${suffix}`;
  createdClientNames.add(clientName);
  createdClientNames.add(canceledClientName);
  createdClientNames.add(savedClientName);
  createdProjectNames.add(projectName);

  await page.goto("/finance");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  const estimatesLink = page.locator('main a[href="/financial/estimates"]').first();
  await expect(estimatesLink).toBeVisible({ timeout: 30_000 });
  await estimatesLink.click();
  await expect(page).toHaveURL(/\/estimates(?:[/?#]|$)/, { timeout: 30_000 });

  await page.locator('main a[href="/estimates/new"]:visible').first().click();
  await expect(page).toHaveURL(/\/estimates\/new(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page.getByText("Client name is required.").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Project name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();

  await fillNewEstimate(page, { clientName, projectName, lineTitle });
  await page.getByRole("button", { name: /Add Line Item/i }).click();
  await expect(page.getByLabel("Line item 2 title")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Remove line item" }).last().click();
  await expect(page.getByLabel("Line item 2 title")).toHaveCount(0);

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(lineTitle, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  const detailUrl = page.url();
  await page.goto("/estimates");
  await page.waitForLoadState("domcontentloaded");
  const listSearch = page.locator('input[placeholder="Search estimates…"]:visible').first();
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(clientName);
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(detailUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByPlaceholder("Client or company name").fill(canceledClientName);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(canceledClientName, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByPlaceholder("Client or company name").fill(savedClientName);
  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeEnabled({ timeout: 10_000 });
  await saveButton.click();
  await expect(page.getByText(savedClientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Delete" }).click();
  let deleteDialog = page.getByRole("dialog", { name: "Delete estimate?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(savedClientName, { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Delete" }).click();
  deleteDialog = page.getByRole("dialog", { name: "Delete estimate?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/estimates(?:[/?#]|$)/, { timeout: 30_000 }),
    deleteDialog.getByRole("button", { name: "Delete" }).click({ force: true }),
  ]);
  await expect(page.locator("body")).not.toContainText("Something went wrong");

  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(savedClientName);
  await expect(page.getByText(savedClientName, { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
});

test("opens approved estimate conversion without creating a project", async ({ page }) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const clientName = `PW Estimate Convert ${suffix}`;
  const projectName = `PW Estimate Convert Project ${suffix}`;
  const lineTitle = `PW estimate convert line ${suffix}`;

  await createEstimate(page, { clientName, projectName, lineTitle });

  const statusButton = page.getByRole("button", { name: /^Status/i });
  await expect(statusButton).toBeEnabled({ timeout: 15_000 });
  await statusButton.click();
  await page.getByRole("menuitem", { name: "Send" }).click();
  await expect(page.locator("header").getByText("Sent")).toBeVisible({ timeout: 30_000 });

  await expect(statusButton).toBeEnabled({ timeout: 15_000 });
  await statusButton.click();
  await page.getByRole("menuitem", { name: "Mark accepted" }).click();
  await expect(page.locator("header").getByText("Approved")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Convert to Project" }).click();
  await expect(page.getByText("Set up project")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Create project" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Set up project")).toHaveCount(0, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/estimates\/[^/?#]+/, { timeout: 10_000 });
});

test("formats fractional-cent estimate amounts as standard currency", async ({ page }) => {
  test.setTimeout(120_000);

  const rawFractionalCurrency = /\$0\.(?:011|012|014)(?!\d)/;
  const suffix = Date.now();
  const clientName = `PW Estimate Precision ${suffix}`;
  const projectName = `PW Estimate Precision Project ${suffix}`;
  const lineTitle = `PW fractional-cent line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimate(page, {
    clientName,
    projectName,
    lineTitle,
    quantity: "1",
    unitPrice: "0.011",
  });

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  const detailUrl = page.url();
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/estimates");
  await page.waitForLoadState("domcontentloaded");
  const listSearch = page.locator('input[placeholder="Search estimates…"]:visible').first();
  await expect(listSearch).toBeVisible({ timeout: 30_000 });
  await listSearch.fill(clientName);
  await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").first()).toBeVisible({ timeout: 30_000 });

  await page.goto(`${detailUrl}/preview`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText(rawFractionalCurrency);
  await expect(page.getByText("$0.01").first()).toBeVisible({ timeout: 30_000 });
});

test("keeps estimate actions usable on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/financial/estimates");
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/estimates(?:[/?#]|$)/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("Something went wrong");
  await expect(page.getByRole("heading", { name: "Estimates" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("New estimate")).toBeVisible({ timeout: 30_000 });

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /^Add Category$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Estimate" })).toBeVisible();

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page.getByText("Client name is required.").first()).toBeVisible();
  await expect(page.getByText("Project name is required.").first()).toBeVisible();
  await expect(page.getByText("At least one line item is required.").first()).toBeVisible();
});
