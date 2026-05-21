import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

async function deleteRowsByEstimateIds(
  supabase: SupabaseClient,
  table: string,
  estimateIds: string[]
): Promise<void> {
  if (estimateIds.length === 0) return;
  const { error } = await supabase.from(table).delete().in("estimate_id", estimateIds);
  if (
    error &&
    !/schema cache|relation .* does not exist|could not find the table/i.test(error.message)
  ) {
    throw error;
  }
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

  await deleteRowsByEstimateIds(supabase, "estimate_payment_schedule_items", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_snapshots", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_items", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_categories", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_meta", ids);
  await supabase.from("estimates").delete().in("id", ids);
}

function getLocalSupabaseForEstimateAssertions(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key);
}

async function expectEstimateRowsDeleted(estimateId: string): Promise<void> {
  const supabase = getLocalSupabaseForEstimateAssertions();
  if (!supabase) return;

  const estimate = await supabase.from("estimates").select("id").eq("id", estimateId);
  expect(estimate.error).toBeNull();
  expect(estimate.data ?? []).toHaveLength(0);

  for (const table of [
    "estimate_payment_schedule_items",
    "estimate_items",
    "estimate_categories",
    "estimate_meta",
  ]) {
    const related = await supabase.from(table).select("estimate_id").eq("estimate_id", estimateId);
    expect(related.error).toBeNull();
    expect(related.data ?? [], `${table} rows should be deleted`).toHaveLength(0);
  }
}

async function fillBaseEstimate(page: Page, params: { client: string; project: string }) {
  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Client or company name").fill(params.client);
  await dialog.getByPlaceholder("Project name").fill(params.project);
  await dialog.getByPlaceholder("Site or client address").fill("123 Local Payment QA Lane");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill("Payment schedule QA scope");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("15500");
}

async function addPaymentMilestone(
  page: Page,
  milestone: { title: string; description: string; amount: string; dueDate?: string }
) {
  const scheduleSection = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: "Payment schedule" }) })
    .first();
  await scheduleSection.evaluate((node) => {
    if (node instanceof HTMLDetailsElement) node.open = true;
  });
  await scheduleSection.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Payment Name").fill(milestone.title);
  await dialog.getByLabel("Description").fill(milestone.description);
  await dialog.getByLabel("Amount").fill(milestone.amount);
  if (milestone.dueDate) {
    await dialog.getByLabel("Due Date").fill(milestone.dueDate);
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(milestone.title, { exact: true })).toBeVisible({ timeout: 10_000 });
  if (milestone.dueDate === "2026-06-01") {
    await expect(page.getByText("Due 6/1/26")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Due 5/31/26");
  }
}

test.afterEach(async () => {
  await cleanupEstimateTestData(createdClientNames, createdProjectNames);
  createdClientNames.clear();
  createdProjectNames.clear();
});

test("estimate payment schedule persists and has customer-facing payment preview", async ({
  page,
}) => {
  test.setTimeout(150_000);

  const suffix = Date.now();
  const client = `PW Estimate Payment ${suffix}`;
  const project = `PW Estimate Payment Project ${suffix}`;
  createdClientNames.add(client);
  createdProjectNames.add(project);

  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillBaseEstimate(page, { client, project });
  await addPaymentMilestone(page, {
    title: "1st Payment",
    description: "Deposit before work starts",
    amount: "5000",
    dueDate: "2026-06-01",
  });
  await addPaymentMilestone(page, {
    title: "2nd Payment",
    description: "After demolition completed",
    amount: "7500",
  });
  await addPaymentMilestone(page, {
    title: "Final Payment",
    description: "Due upon completion",
    amount: "3000",
  });

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const detailUrl = page.url().replace(/\?.*$/, "");
  const estimateId = new URL(detailUrl).pathname.split("/").filter(Boolean).pop();
  expect(estimateId).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("1st Payment", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("$5,000.00").first()).toBeVisible();
  await expect(page.getByText("Deposit before work starts")).toBeVisible();
  await expect(page.getByText("Due 6/1/26")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Due 5/31/26");

  await page.getByRole("link", { name: "Preview", exact: true }).click();
  await expect(page).toHaveURL(/\/preview/, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText("Payment schedule");
  await expect(page.locator("main")).toContainText("1st Payment");
  await expect(page.locator("main")).toContainText("Deposit before work starts");
  const previewMainText = await page.locator("main").evaluate((el) => el.textContent ?? "");
  expect(previewMainText).not.toContain("\t");
  expect(previewMainText).not.toContain("\u2028");
  await expect(page.locator("main")).toContainText("$7,500.00");
  await expect(page.locator("main")).not.toContainText(/internal markup|internal only/i);

  await page.goto(`${detailUrl}/print`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("document", { name: "Estimate print view" })).toContainText(
    "Final Payment"
  );
  await expect(page.getByRole("document", { name: "Estimate print view" })).toContainText(
    "Due upon completion"
  );
  const printText = await page
    .getByRole("document", { name: "Estimate print view" })
    .evaluate((el) => el.textContent ?? "");
  expect(printText).not.toContain("\t");
  expect(printText).not.toContain("\u2028");

  await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /Preview 1st Payment/i }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+\/payments\/[^/]+\/preview/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("document", { name: "Payment request preview" })).toContainText(
    client
  );
  await expect(page.getByRole("document", { name: "Payment request preview" })).toContainText(
    project
  );
  await expect(page.getByRole("document", { name: "Payment request preview" })).toContainText(
    "$5,000.00"
  );
  const paymentPreviewText = await page
    .getByRole("document", { name: "Payment request preview" })
    .evaluate((el) => el.textContent ?? "");
  expect(paymentPreviewText).not.toContain("\t");
  expect(paymentPreviewText).not.toContain("\u2028");

  await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: /Delete 2nd Payment/i }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("2nd Payment", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1st Payment", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Delete estimate" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete estimate?" });
  await expect(deleteDialog).toBeVisible({ timeout: 10_000 });
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/estimates\/?$/, { timeout: 30_000 });

  await page.goto(`${detailUrl}?deleted_check=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/estimates\/?$/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(client);
  await page.goto(`${detailUrl}/preview?deleted_check=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/estimates\/?$/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(client);
  await page.goto(`${detailUrl}/print?deleted_check=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/estimates\/?$/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(client);
  await expectEstimateRowsDeleted(estimateId!);
});
