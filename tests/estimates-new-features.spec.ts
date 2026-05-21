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

  await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_snapshots").delete().in("estimate_id", ids);
  await supabase.from("estimate_items").delete().in("estimate_id", ids);
  await supabase.from("estimate_categories").delete().in("estimate_id", ids);
  await supabase.from("estimate_meta").delete().in("estimate_id", ids);
  await supabase.from("estimates").delete().in("id", ids);
}

async function fillNewEstimateCustomerFields(
  page: Page,
  params: { clientName: string; projectName: string }
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Edit details/i }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  }
  await dialog.getByPlaceholder("Client or company name").fill(params.clientName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
}

async function fillNewEstimateLine(
  page: Page,
  params: { lineTitle: string; quantity?: string; unitPrice?: string }
): Promise<void> {
  await addBlankEstimateSection(page);

  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill(params.lineTitle);
  await page
    .getByLabel("Line item 1 quantity")
    .locator("visible=true")
    .fill(params.quantity ?? "1");
  await page
    .getByLabel("Line item 1 unit price")
    .locator("visible=true")
    .fill(params.unitPrice ?? "10000");
}

async function addBlankEstimateSection(page: Page): Promise<void> {
  const addSection = page.getByRole("button", { name: /^Add Section$/i }).first();
  await expect(addSection).toBeVisible({ timeout: 30_000 });
  await addSection.click();

  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("Schedule Payment percentage helper calculates amount from estimate total", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const clientName = `PW Estimate Pct ${suffix}`;
  const projectName = `PW Estimate Pct Project ${suffix}`;
  const lineTitle = `PW pct line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await fillNewEstimateLine(page, { lineTitle, quantity: "1", unitPrice: "10000" });

  await page.getByRole("button", { name: "Schedule Payment" }).click();
  await expect(page.getByRole("heading", { name: "Schedule Payment" })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Payment Name").fill("Deposit");
  const percentInput = page.getByLabel("% of estimate");
  await percentInput.fill("20");

  await expect
    .poll(async () => page.getByLabel("Amount").inputValue(), { timeout: 10_000 })
    .not.toBe("");

  const amountValue = Number(await page.getByLabel("Amount").inputValue());
  expect(Number.isFinite(amountValue)).toBe(true);
  expect(amountValue).toBeGreaterThan(0);

  await expect(page.getByText(/20% of \$/)).toBeVisible({ timeout: 10_000 });

  await page
    .getByRole("button", { name: "Save", exact: true })
    .locator("visible=true")
    .last()
    .click();
  await expect(page.getByRole("main").getByText("Deposit", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test("hide amount on PDF persists through preview and print", async ({ page }) => {
  test.setTimeout(150_000);
  const suffix = Date.now();
  const clientName = `PW Estimate HideAmt ${suffix}`;
  const projectName = `PW Estimate HideAmt Project ${suffix}`;
  const lineTitle = `PW hide amt line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await fillNewEstimateLine(page, { lineTitle, quantity: "1", unitPrice: "5000" });

  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  await page.getByRole("menuitem", { name: "Hide amount on PDF" }).click();

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();

  await page.goto(`/estimates/${estimateId}/preview`);
  await page.waitForLoadState("domcontentloaded");

  const previewRow = page.locator("tbody tr").filter({ hasText: lineTitle });
  await expect(previewRow).toBeVisible({ timeout: 30_000 });
  await expect(previewRow.locator("td").nth(3)).toHaveText("—");
  await expect(previewRow.locator("td").nth(4)).toHaveText("—");
  await expect(page.getByText(/^Total:/)).toBeVisible();

  await page.goto(`/estimates/${estimateId}/print`);
  await page.waitForLoadState("domcontentloaded");
  const printRow = page.locator("tbody tr").filter({ hasText: lineTitle });
  await expect(printRow).toBeVisible({ timeout: 30_000 });
  await expect(printRow.locator("td").nth(3)).toHaveText("—");
  await expect(printRow.locator("td").nth(4)).toHaveText("—");

  await page.goto(`/estimates/${estimateId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  await expect(page.getByRole("menuitem", { name: "Show amount on PDF" })).toBeVisible({
    timeout: 10_000,
  });
});

test("line item status and notes persist to customer preview and print", async ({ page }) => {
  test.setTimeout(150_000);
  const suffix = Date.now();
  const clientName = `PW Estimate Notes ${suffix}`;
  const projectName = `PW Estimate Notes Project ${suffix}`;
  const lineTitle = `PW notes status line ${suffix}`;
  const noteText = `Owner to provide appliance selections ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await fillNewEstimateLine(page, { lineTitle, quantity: "1", unitPrice: "2500" });

  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  await page.getByText("Set status", { exact: true }).hover();
  await page.getByRole("menuitem", { name: "Optional" }).click();
  await expect(
    page.locator(".eb-line-item-status-pill:visible", { hasText: "Optional" }).first()
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("menuitem", { name: "Optional" })).toBeHidden({ timeout: 5_000 });

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("menuitem", { name: "Exclusions" }).click();
  await page.getByLabel("Exclusions body").fill(noteText);

  const saveEstimate = page.getByRole("button", { name: "Save Estimate" });
  await expect(saveEstimate).toBeEnabled({ timeout: 15_000 });
  await saveEstimate.click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });

  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Optional", { exact: true }).locator("visible=true")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Note title").locator("visible=true")).toHaveValue("Exclusions", {
    timeout: 30_000,
  });
  await expect(page.getByLabel("Exclusions body").locator("visible=true")).toHaveValue(noteText, {
    timeout: 30_000,
  });

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toContainText("Notes & Clarifications");
  await expect(page.locator("main")).toContainText("Exclusions");
  await expect(page.locator("main")).toContainText(noteText);
  await expect(page.locator("main")).toContainText("Optional");

  await page.goto(`/estimates/${estimateId}/print`, { waitUntil: "domcontentloaded" });
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  await expect(printDocument).toContainText("Notes & Clarifications");
  await expect(printDocument).toContainText(noteText);
  await expect(printDocument).toContainText("Optional");
});
