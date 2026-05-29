import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";
import type { EstimateDocumentStyle } from "../src/lib/estimate-document-style";

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
  params: { clientName: string; projectName: string; documentStyle?: EstimateDocumentStyle }
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Edit details/i }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  }
  await dialog.getByPlaceholder("Client or company name").fill(params.clientName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByPlaceholder("Site or client address").fill("123 Proposal Style Lane");
  if (params.documentStyle) {
    await dialog
      .getByRole("radio", { name: params.documentStyle === "itemized" ? "Itemized" : "Proposal" })
      .check();
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
}

async function addPaymentMilestone(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Payment Name").fill(title);
  await dialog.getByLabel("% of estimate").fill("25");
  await expect
    .poll(async () => dialog.getByLabel("Amount").inputValue(), { timeout: 10_000 })
    .not.toBe("");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function enterEstimateEditMode(page: Page): Promise<void> {
  const editButton = page.getByRole("button", { name: "Edit", exact: true });
  if (await editButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await editButton.click();
  }
}

async function setEstimateDocumentStyle(page: Page, style: EstimateDocumentStyle): Promise<void> {
  await enterEstimateEditMode(page);
  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("radio", { name: style === "itemized" ? "Itemized" : "Proposal" }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
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

async function createBasicEstimate(
  page: Page,
  params: {
    clientName: string;
    projectName: string;
    lineTitle: string;
    documentStyle?: EstimateDocumentStyle;
  }
): Promise<string> {
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillNewEstimateCustomerFields(page, {
    clientName: params.clientName,
    projectName: params.projectName,
    documentStyle: params.documentStyle,
  });
  await addBlankEstimateSection(page);
  await page.getByLabel("Line item 1 title").locator("visible=true").fill(params.lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("2");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("1500");
  await addPaymentMilestone(page, "Deposit");

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();
  return estimateId as string;
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("proposal preview and print hide line-item pricing", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const clientName = `PW Style Proposal ${suffix}`;
  const projectName = `PW Style Proposal Project ${suffix}`;
  const lineTitle = `PW proposal scope line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  const estimateId = await createBasicEstimate(page, {
    clientName,
    projectName,
    lineTitle,
    documentStyle: "proposal",
  });

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const document = page.getByTestId("estimate-document");
  await expect(document).toHaveAttribute("data-estimate-document-style", "proposal");
  await expect(document).toContainText("Project Proposal");
  await expect(document).toContainText("Contract Price");
  await expect(document).toContainText(lineTitle);
  await expect(document).toContainText("Payment Schedule");
  await expect(document).toContainText("Client Acceptance");
  await expect(document).not.toContainText(/Qty\s+\d/i);
  await expect(document).not.toContainText(/Unit Price/i);
  await expect(document.getByTestId("estimate-line-item-unit-price")).toHaveCount(0);
  await expect(document.getByTestId("estimate-line-item-total")).toHaveCount(0);
  await expect(document).not.toContainText(/markup|overhead|profit/i);
  const summary = page.getByTestId("estimate-preview-summary");
  await expect(summary).toContainText("Contract Price");
  await expect(summary).not.toContainText("Discount");
  await expect(summary).not.toContainText(/Tax \(/);

  await page.goto(`/estimates/${estimateId}/print`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("estimate-document")).toHaveAttribute(
    "data-estimate-document-style",
    "proposal"
  );
  const printDocument = page.getByRole("document", { name: "Estimate print view" });
  await expect(printDocument).not.toContainText(/Qty\s+\d/i);
  await expect(printDocument.getByTestId("estimate-line-item-unit-price")).toHaveCount(0);
});

test("itemized preview and print show qty, unit price, and line totals", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const clientName = `PW Style Itemized ${suffix}`;
  const projectName = `PW Style Itemized Project ${suffix}`;
  const lineTitle = `PW itemized scope line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  const estimateId = await createBasicEstimate(page, {
    clientName,
    projectName,
    lineTitle,
    documentStyle: "itemized",
  });

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const document = page.getByTestId("estimate-document");
  await expect(document).toHaveAttribute("data-estimate-document-style", "itemized");
  await expect(document).toContainText("Grand Total");
  const summary = page.getByTestId("estimate-preview-summary");
  await expect(summary).toContainText("Grand Total");
  await expect(summary).not.toContainText("Discount");
  await expect(summary).not.toContainText(/Tax \(/);
  const row = page.getByTestId("estimate-line-item-output").filter({ hasText: lineTitle });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("estimate-line-item-unit-price")).toContainText("Unit $");
  await expect(row.getByTestId("estimate-line-item-total")).toContainText("$");
  await expect(row).toContainText("Qty 2");

  await page.goto(`/estimates/${estimateId}/print`, { waitUntil: "domcontentloaded" });
  const printRow = page.getByTestId("estimate-line-item-output").filter({ hasText: lineTitle });
  await expect(printRow.getByTestId("estimate-line-item-unit-price")).toContainText("Unit $");
  await expect(printRow).toContainText("Qty 2");
});

test("estimate style persists after reload and updates preview output", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const clientName = `PW Style Persist ${suffix}`;
  const projectName = `PW Style Persist Project ${suffix}`;
  const lineTitle = `PW persist scope line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  const estimateId = await createBasicEstimate(page, {
    clientName,
    projectName,
    lineTitle,
    documentStyle: "proposal",
  });

  await setEstimateDocumentStyle(page, "itemized");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Itemized")).toBeVisible({ timeout: 30_000 });

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("estimate-document")).toHaveAttribute(
    "data-estimate-document-style",
    "itemized"
  );
  await expect(page.getByTestId("estimate-line-item-unit-price").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("legacy estimate without stored style defaults to proposal preview", async ({ page }) => {
  test.setTimeout(60_000);
  const seededEstimateId = "44444444-4444-4444-4444-444444444449";

  await page.goto(`/estimates/${seededEstimateId}/preview`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("estimate-document")).toHaveAttribute(
    "data-estimate-document-style",
    "proposal"
  );
  await expect(page.getByTestId("estimate-document")).not.toContainText(/Qty\s+\d/i);
});

test("preview summary shows matched tax preset label", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const clientName = `PW Style Tax Label ${suffix}`;
  const projectName = `PW Style Tax Label Project ${suffix}`;
  const lineTitle = `PW tax label scope line ${suffix}`;
  createdClientNames.add(clientName);
  createdProjectNames.add(projectName);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await fillNewEstimateCustomerFields(page, {
    clientName,
    projectName,
    documentStyle: "itemized",
  });
  await addBlankEstimateSection(page);
  await page.getByLabel("Line item 1 title").locator("visible=true").fill(lineTitle);
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("10000");

  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tax presets" }).click();
  await page.getByRole("menuitem", { name: /Hawaii GET/i }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const summary = page.getByTestId("estimate-preview-summary");
  await expect(summary.getByText(/Tax \(Hawaii GET 4\.712%\)/)).toBeVisible({ timeout: 30_000 });
  await expect(summary).toContainText("$471.20");
  await expect(summary).not.toContainText("Discount");
  await expect(summary).toContainText("Grand Total");
});
