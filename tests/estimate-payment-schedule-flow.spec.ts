import { expect, test, type Page } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdClientNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates");
});

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
  await deleteRowsByEstimateIds(supabase, "estimate_items", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_categories", ids);
  await deleteRowsByEstimateIds(supabase, "estimate_meta", ids);
  await deleteLocalEstimateFixtureGraphs(ids);
}

async function fillBaseEstimate(page: Page, params: { client: string; project: string }) {
  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Client or company name").fill(params.client);
  await dialog.getByPlaceholder("Project name").fill(params.project);
  await dialog.getByPlaceholder("Site or client address").fill("123 Local Payment QA Lane");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await addBlankEstimateSection(page);
  const lineTitleInput = page.getByLabel("Line item 1 title").locator("visible=true");
  await expect(lineTitleInput).toBeVisible({ timeout: 15_000 });
  await lineTitleInput.fill("Payment schedule QA scope");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("15500");
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
    await expect(page.getByText("Due: Jun 1, 2026")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Due: May 31, 2026");
  }
}

async function openDetailPaymentSchedule(page: Page) {
  const section = page.locator("#estimate-payment-schedule");
  await expect(section).toBeVisible({ timeout: 10_000 });
  await section.scrollIntoViewIfNeeded();
  const details = section.locator("details");
  const expanded = await details.evaluate(
    (node) => node instanceof HTMLDetailsElement && node.open
  );
  if (!expanded) {
    await details.locator("summary").click();
  }
  await expect(section.locator('[data-estimate-payment-schedule="true"]')).toBeVisible({
    timeout: 10_000,
  });
  return section;
}

async function openEstimatePreview(page: Page) {
  const previewLink = page.getByRole("link", { name: "Preview", exact: true });
  if (await previewLink.isVisible().catch(() => false)) {
    await previewLink.click();
    return;
  }
  await page.getByRole("button", { name: "Save & Preview", exact: true }).click();
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

  await gotoWithE2EAuth(page, "/estimates/new");
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

  await reloadWithE2EAuth(page);
  const paymentSheet = await openDetailPaymentSchedule(page);
  await expect(paymentSheet.getByText("1st Payment", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(paymentSheet.getByText("$5,000.00").first()).toBeVisible();
  await expect(paymentSheet.getByText("Deposit before work starts")).toBeVisible();
  await expect(paymentSheet.getByText("Due: Jun 1, 2026")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Due: May 31, 2026");
  await page.keyboard.press("Escape");
  await expect(paymentSheet).toBeVisible();

  await openEstimatePreview(page);
  await expect(page).toHaveURL(/\/preview/, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText("Payment schedule");
  await expect(page.locator("main")).toContainText("1st Payment");
  await expect(page.locator("main")).toContainText("Deposit before work starts");
  await expect(page.locator("main")).toContainText("Due: Jun 1, 2026");
  const previewMainText = await page.locator("main").evaluate((el) => el.textContent ?? "");
  expect(previewMainText).not.toContain("\t");
  expect(previewMainText).not.toContain("\u2028");
  await expect(page.locator("main")).toContainText("$7,500.00");
  await expect(page.locator("main")).not.toContainText(/internal only/i);

  await gotoWithE2EAuth(page, `${detailUrl}/print`);
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

  await gotoWithE2EAuth(page, detailUrl);
  await expect(page.locator("body")).not.toContainText("Payment Request");
  await openDetailPaymentSchedule(page);
  await expect(page.getByRole("link", { name: /^Create Draft Invoice$/i })).toHaveCount(0);

  await gotoWithE2EAuth(page, detailUrl);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editablePaymentSheet = await openDetailPaymentSchedule(page);
  await page.getByRole("button", { name: /Delete 2nd Payment/i }).click();
  await expect(editablePaymentSheet.getByText("2nd Payment", { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
  await reloadWithE2EAuth(page);
  const paymentSheetAfterDelete = await openDetailPaymentSchedule(page);
  await expect(paymentSheetAfterDelete.getByText("2nd Payment", { exact: true })).toHaveCount(0);
  await expect(paymentSheetAfterDelete.getByText("1st Payment", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
