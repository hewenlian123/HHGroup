import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

function ensureScreenshotDir(): void {
  mkdirSync("test-results", { recursive: true });
}

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
  await dialog.getByPlaceholder("Site or client address").fill("123 Proposal Polish Lane");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

async function addPaymentMilestone(page: Page, title: string, description: string): Promise<void> {
  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Payment Name").fill(title);
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByLabel("% of estimate").fill("25");
  await expect
    .poll(async () => dialog.getByLabel("Amount").inputValue(), { timeout: 10_000 })
    .not.toBe("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function prepareCustomerDocumentScreenshot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page
    .getByText("System issue detected")
    .waitFor({ state: "hidden", timeout: 12_000 })
    .catch(() => undefined);
  await page.getByTestId("estimate-document").scrollIntoViewIfNeeded();
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("customer estimate preview and print use polished proposal output", async ({ page }) => {
  test.setTimeout(180_000);
  ensureScreenshotDir();

  const suffix = Date.now();
  const clientName = `PW Estimate Polish ${suffix}`;
  const projectName = `PW Estimate Polish Project ${suffix}`;
  const lineTitle = `PW hidden proposal line ${suffix}`;
  const noteText = `Owner to confirm finish selections before procurement ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, { clientName, projectName });
  await addBlankEstimateSection(page);
  await page.getByLabel("Line item 1 title").locator("visible=true").fill(lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("5000");

  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  await page.getByText("Set status", { exact: true }).hover();
  await page.getByRole("menuitem", { name: "Optional" }).click();
  await page.getByRole("button", { name: "More actions" }).locator("visible=true").first().click();
  await page.getByRole("menuitem", { name: "Hide amount on PDF" }).click();

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByRole("menuitem", { name: "Assumptions" }).click();
  await page.getByLabel("Assumptions body").fill(noteText);

  await addPaymentMilestone(page, "Deposit", "Due before work starts");

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const previewMain = page.locator("main");
  await expect(previewMain).toContainText("Bill To");
  await expect(previewMain).toContainText("Project / Job");
  await expect(previewMain).toContainText("Job Address");
  await expect(previewMain).toContainText(clientName);
  await expect(previewMain).toContainText(projectName);
  await expect(previewMain).toContainText("Optional");
  await expect(previewMain).toContainText("Notes & Clarifications");
  await expect(previewMain).toContainText(noteText);
  await expect(previewMain).toContainText("Payment Schedule");
  await expect(previewMain).toContainText("Deposit");
  await expect(previewMain).toContainText("Grand Total");
  await expect(previewMain).not.toContainText(/undefined|null/i);
  await expect(previewMain).not.toContainText(/markup|overhead|profit/i);

  const previewRow = page.locator("tbody tr").filter({ hasText: lineTitle });
  await expect(previewRow).toBeVisible({ timeout: 30_000 });
  await expect(previewRow.locator("td").nth(3)).toHaveText("—");
  await expect(previewRow.locator("td").nth(4)).toHaveText("—");
  await prepareCustomerDocumentScreenshot(page);
  await page.getByTestId("estimate-document").screenshot({
    path: "test-results/estimate-preview-polished.png",
  });
  await page.getByTestId("estimate-pdf-export").screenshot({
    path: "test-results/estimate-pdf-polished.png",
  });

  await page.goto(`/estimates/${estimateId}/print`, { waitUntil: "domcontentloaded" });
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  await expect(printDocument).toContainText("Bill To");
  await expect(printDocument).toContainText("Project / Job");
  await expect(printDocument).toContainText("Job Address");
  await expect(printDocument).toContainText("Optional");
  await expect(printDocument).toContainText("Notes & Clarifications");
  await expect(printDocument).toContainText(noteText);
  await expect(printDocument).toContainText("Payment Schedule");
  await expect(printDocument).toContainText("Grand Total");
  await expect(printDocument).not.toContainText(/undefined|null/i);
  await expect(printDocument).not.toContainText(/markup|overhead|profit/i);
  const printRow = page.locator("tbody tr").filter({ hasText: lineTitle });
  await expect(printRow).toBeVisible({ timeout: 30_000 });
  await expect(printRow.locator("td").nth(3)).toHaveText("—");
  await expect(printRow.locator("td").nth(4)).toHaveText("—");
  await prepareCustomerDocumentScreenshot(page);
  await page.getByTestId("estimate-document").screenshot({
    path: "test-results/estimate-print-polished.png",
  });
});
