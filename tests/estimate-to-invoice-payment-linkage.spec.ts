import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdCustomerNames = new Set<string>();
const createdProjectNames = new Set<string>();

test.beforeEach(async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates");
});

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function invoiceIdFromUrl(url: string): string {
  const match = url.match(/\/financial\/invoices\/([^/?#]+)/);
  if (!match?.[1] || match[1] === "new") {
    throw new Error(`Could not determine invoice id from URL: ${url}`);
  }
  return match[1];
}

async function cleanupCreatedRows(): Promise<void> {
  const supabase = db();
  if (!supabase) return;

  const customerNames = Array.from(createdCustomerNames);
  const projectNames = Array.from(createdProjectNames);
  const invoiceIds = new Set<string>();
  const estimateIds = new Set<string>();
  const projectIds = new Set<string>();
  const customerIds = new Set<string>();

  if (customerNames.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id")
      .in("client_name", customerNames);
    for (const row of invoices ?? []) invoiceIds.add(String(row.id));

    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("client", customerNames);
    for (const row of estimates ?? []) estimateIds.add(String(row.id));

    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .in("name", customerNames);
    for (const row of customers ?? []) customerIds.add(String(row.id));
  }

  if (projectNames.length > 0) {
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("project", projectNames);
    for (const row of estimates ?? []) estimateIds.add(String(row.id));

    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .in("name", projectNames);
    for (const row of projects ?? []) projectIds.add(String(row.id));
  }

  const invoiceIdList = Array.from(invoiceIds);
  if (invoiceIdList.length > 0) {
    const { data: payments } = await supabase
      .from("payments_received")
      .select("id")
      .in("invoice_id", invoiceIdList);
    const paymentIds = (payments ?? []).map((row: { id: string }) => row.id).filter(Boolean);
    if (paymentIds.length > 0) {
      await supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds);
    }
    await supabase.from("deposits").delete().in("invoice_id", invoiceIdList);
    await supabase.from("payments_received").delete().in("invoice_id", invoiceIdList);
    await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIdList);
    await supabase.from("invoice_items").delete().in("invoice_id", invoiceIdList);
    await supabase.from("invoices").delete().in("id", invoiceIdList);
  }

  const estimateIdList = Array.from(estimateIds);
  if (estimateIdList.length > 0) {
    await supabase
      .from("estimate_payment_schedule_items")
      .delete()
      .in("estimate_id", estimateIdList);
    await supabase.from("estimate_snapshots").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_items").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_categories").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimate_meta").delete().in("estimate_id", estimateIdList);
    await supabase.from("estimates").delete().in("id", estimateIdList);
  }

  const projectIdList = Array.from(projectIds);
  if (projectIdList.length > 0) await supabase.from("projects").delete().in("id", projectIdList);

  const customerIdList = Array.from(customerIds);
  if (customerIdList.length > 0) await supabase.from("customers").delete().in("id", customerIdList);
}

async function createCustomerAndProject(
  supabase: SupabaseClient,
  params: { customerName: string; projectName: string }
): Promise<{ customerId: string; projectId: string }> {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      name: params.customerName,
      email: `${params.customerName.replace(/[^a-z0-9]/gi, "").toLowerCase()}@example.test`,
      address: "918 Linked Project Way",
      status: "active",
    })
    .select("id")
    .single();
  expect(customerError).toBeNull();
  expect(customer?.id).toBeTruthy();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: params.projectName,
      status: "Active",
      budget: 2500,
      contract_amount: 2500,
      client: params.customerName,
      client_name: params.customerName,
      customer_id: customer!.id,
      address: "918 Linked Project Way",
    })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  expect(project?.id).toBeTruthy();

  return { customerId: String(customer!.id), projectId: String(project!.id) };
}

async function fillEstimateBase(
  page: Page,
  params: { customerName: string; projectName: string }
): Promise<void> {
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Client or company name").fill(params.customerName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByPlaceholder("Site or client address").fill("918 Linked Project Way");
  await expect(dialog.getByText(/Milestone invoices require/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }

  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Deposit scope");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("2500");
}

async function addDepositPayment(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Amount")).toHaveValue("");
  await expect(dialog.getByLabel("% of estimate")).toHaveValue("");
  await dialog.getByLabel("Payment Name").fill("Deposit");
  await dialog.getByLabel("Amount").fill("500");
  await expect(dialog.getByText("20% of $2,500.00")).toBeVisible();
  await dialog.getByLabel("Description").fill("Deposit before work starts");
  await dialog.getByLabel("Due Date").fill("2026-06-01");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Deposit", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Due: Jun 1, 2026")).toBeVisible({ timeout: 10_000 });
}

async function createEstimateWithDeposit(
  page: Page,
  params: { customerName: string; projectName: string }
): Promise<string> {
  await fillEstimateBase(page, params);
  await addDepositPayment(page);
  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  return page.url().replace(/\?.*$/, "");
}

test.afterEach(async () => {
  await cleanupCreatedRows();
  createdCustomerNames.clear();
  createdProjectNames.clear();
});

test("linked project payment milestone generates an invoice for the milestone amount", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for payment schedule invoice E2E.");
    return;
  }

  const suffix = Date.now();
  const customerName = `PW Linked Estimate Customer ${suffix}`;
  const projectName = `PW Linked Estimate Project ${suffix}`;
  createdCustomerNames.add(customerName);
  createdProjectNames.add(projectName);
  const { customerId, projectId } = await createCustomerAndProject(supabase, {
    customerName,
    projectName,
  });

  await createEstimateWithDeposit(page, { customerName, projectName });
  await page.getByRole("link", { name: /^Create Draft Invoice$/i }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/new\?/, { timeout: 30_000 });
  await expect(page.getByTestId("invoice-new-project-select")).toHaveValue(projectId);
  await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(customerName);
  await expect(page.getByTestId("invoice-new-line-1-item-input")).toHaveValue("Deposit");
  await expect(page.getByTestId("invoice-new-line-1-rate-input")).toHaveValue("500");
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/[^/?#]+\/preview/, { timeout: 30_000 });
  const invoiceId = invoiceIdFromUrl(page.url());

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id, customer_id, client_name, status, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(invoice).toMatchObject({
    id: invoiceId,
    project_id: projectId,
    customer_id: customerId,
    client_name: customerName,
    status: "Draft",
  });
  expect(Number((invoice as { total: string | number }).total)).toBe(500);
});

test("missing linked project shows a clear blocker and does not create an invoice", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for payment schedule invoice E2E.");
    return;
  }

  const suffix = Date.now();
  const customerName = `PW Unlinked Estimate Customer ${suffix}`;
  const projectName = `PW Unlinked Free Text Project ${suffix}`;
  createdCustomerNames.add(customerName);
  createdProjectNames.add(projectName);

  await createEstimateWithDeposit(page, { customerName, projectName });
  await expect(page.getByText(/Invoice generation requires a linked project/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /^Create Draft Invoice$/i })).toBeDisabled();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("client_name", customerName);
  expect(invoices ?? []).toHaveLength(0);
});
