import { expect, test, type Page } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
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

type SupabaseCleanupResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

async function runSupabaseCleanupOperation<T>(
  operation: string,
  request: PromiseLike<SupabaseCleanupResult<T>>
): Promise<T | null> {
  const { data, error } = await request;
  if (error) {
    throw new Error(`Estimate invoice-linkage cleanup failed to ${operation}: ${error.message}`);
  }
  return data;
}

async function cleanupCreatedRows(): Promise<void> {
  const supabase = db();
  if (!supabase) {
    if (createdCustomerNames.size > 0 || createdProjectNames.size > 0) {
      throw new Error("Estimate invoice-linkage cleanup requires the local Supabase environment.");
    }
    return;
  }

  const customerNames = Array.from(createdCustomerNames);
  const projectNames = Array.from(createdProjectNames);
  const invoiceIds = new Set<string>();
  const estimateIds = new Set<string>();
  const projectIds = new Set<string>();
  const customerIds = new Set<string>();

  if (customerNames.length > 0) {
    const invoices = await runSupabaseCleanupOperation(
      "discover invoices by customer",
      supabase.from("invoices").select("id").in("client_name", customerNames)
    );
    for (const row of invoices ?? []) invoiceIds.add(String(row.id));

    const estimates = await runSupabaseCleanupOperation(
      "discover estimates by customer",
      supabase.from("estimates").select("id").in("client", customerNames)
    );
    for (const row of estimates ?? []) estimateIds.add(String(row.id));

    const customers = await runSupabaseCleanupOperation(
      "discover customers",
      supabase.from("customers").select("id").in("name", customerNames)
    );
    for (const row of customers ?? []) customerIds.add(String(row.id));
  }

  if (projectNames.length > 0) {
    const estimates = await runSupabaseCleanupOperation(
      "discover estimates by project",
      supabase.from("estimates").select("id").in("project", projectNames)
    );
    for (const row of estimates ?? []) estimateIds.add(String(row.id));

    const projects = await runSupabaseCleanupOperation(
      "discover projects",
      supabase.from("projects").select("id").in("name", projectNames)
    );
    for (const row of projects ?? []) projectIds.add(String(row.id));
  }

  const invoiceIdList = Array.from(invoiceIds);
  if (invoiceIdList.length > 0) {
    const payments = await runSupabaseCleanupOperation(
      "discover received payments",
      supabase.from("payments_received").select("id").in("invoice_id", invoiceIdList)
    );
    const paymentIds = (payments ?? []).map((row: { id: string }) => row.id).filter(Boolean);
    if (paymentIds.length > 0) {
      await runSupabaseCleanupOperation(
        "delete received-payment attachments",
        supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds)
      );
    }
    await runSupabaseCleanupOperation(
      "delete deposits",
      supabase.from("deposits").delete().in("invoice_id", invoiceIdList)
    );
    await runSupabaseCleanupOperation(
      "delete received payments",
      supabase.from("payments_received").delete().in("invoice_id", invoiceIdList)
    );
    await runSupabaseCleanupOperation(
      "delete invoice payments",
      supabase.from("invoice_payments").delete().in("invoice_id", invoiceIdList)
    );
    await runSupabaseCleanupOperation(
      "delete invoice items",
      supabase.from("invoice_items").delete().in("invoice_id", invoiceIdList)
    );
    await runSupabaseCleanupOperation(
      "delete invoices",
      supabase.from("invoices").delete().in("id", invoiceIdList)
    );
  }

  const estimateIdList = Array.from(estimateIds);
  if (estimateIdList.length > 0) {
    await runSupabaseCleanupOperation(
      "delete estimate payment schedule items",
      supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIdList)
    );
    await runSupabaseCleanupOperation(
      "delete estimate items",
      supabase.from("estimate_items").delete().in("estimate_id", estimateIdList)
    );
    await runSupabaseCleanupOperation(
      "delete estimate categories",
      supabase.from("estimate_categories").delete().in("estimate_id", estimateIdList)
    );
    await runSupabaseCleanupOperation(
      "delete estimate metadata",
      supabase.from("estimate_meta").delete().in("estimate_id", estimateIdList)
    );
    await deleteLocalEstimateFixtureGraphs(estimateIdList);
  }

  const projectIdList = Array.from(projectIds);
  if (projectIdList.length > 0) {
    await runSupabaseCleanupOperation(
      "delete projects",
      supabase.from("projects").delete().in("id", projectIdList)
    );
  }

  const customerIdList = Array.from(customerIds);
  if (customerIdList.length > 0) {
    await runSupabaseCleanupOperation(
      "delete customers",
      supabase.from("customers").delete().in("id", customerIdList)
    );
  }

  await expectCreatedRowsGone(supabase, { customerNames, projectNames });
}

async function expectCreatedRowsGone(
  supabase: SupabaseClient,
  params: { customerNames: string[]; projectNames: string[] }
): Promise<void> {
  if (params.customerNames.length > 0) {
    const invoices = await runSupabaseCleanupOperation(
      "verify invoices are gone",
      supabase.from("invoices").select("id").in("client_name", params.customerNames)
    );
    const estimates = await runSupabaseCleanupOperation(
      "verify customer estimates are gone",
      supabase.from("estimates").select("id").in("client", params.customerNames)
    );
    const customers = await runSupabaseCleanupOperation(
      "verify customers are gone",
      supabase.from("customers").select("id").in("name", params.customerNames)
    );
    expect(invoices ?? []).toHaveLength(0);
    expect(estimates ?? []).toHaveLength(0);
    expect(customers ?? []).toHaveLength(0);
  }

  if (params.projectNames.length > 0) {
    const estimates = await runSupabaseCleanupOperation(
      "verify project estimates are gone",
      supabase.from("estimates").select("id").in("project", params.projectNames)
    );
    const projects = await runSupabaseCleanupOperation(
      "verify projects are gone",
      supabase.from("projects").select("id").in("name", params.projectNames)
    );
    expect(estimates ?? []).toHaveLength(0);
    expect(projects ?? []).toHaveLength(0);
  }
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
  await gotoWithE2EAuth(page, "/estimates/new");
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

async function approveSavedEstimate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Mark as Sent", exact: true }).click();
  await expect(page.getByText("Sent", { exact: true }).locator("visible=true")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Mark accepted", exact: true }).click();
  await expect(page.getByText("Approved", { exact: true }).locator("visible=true")).toBeVisible({
    timeout: 15_000,
  });
}

async function openPaymentSchedule(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Estimate actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Payment Schedule", exact: true }).click();
  await expect(page.getByTestId("estimate-payment-schedule-sheet")).toBeVisible();
}

test.afterEach(async ({ page }) => {
  const teardownErrors: unknown[] = [];
  const hasCreatedRows = createdCustomerNames.size > 0 || createdProjectNames.size > 0;

  if (hasCreatedRows) {
    try {
      await gotoWithE2EAuth(page, "/estimates");
    } catch (error) {
      teardownErrors.push(error);
    }
  }

  try {
    await cleanupCreatedRows();
  } catch (error) {
    teardownErrors.push(error);
  } finally {
    createdCustomerNames.clear();
    createdProjectNames.clear();
  }

  if (teardownErrors.length === 1) throw teardownErrors[0];
  if (teardownErrors.length > 1) {
    throw new AggregateError(teardownErrors, "Estimate invoice-linkage teardown failed.");
  }
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
  await approveSavedEstimate(page);
  await openPaymentSchedule(page);
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

test("tax-inclusive milestone generates an invoice whose final total remains the milestone", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for payment schedule invoice E2E.");
    return;
  }

  const suffix = Date.now();
  const customerName = `PW Tax Inclusive Estimate Customer ${suffix}`;
  const projectName = `PW Tax Inclusive Estimate Project ${suffix}`;
  createdCustomerNames.add(customerName);
  createdProjectNames.add(projectName);
  const { customerId, projectId } = await createCustomerAndProject(supabase, {
    customerName,
    projectName,
  });

  const estimateUrl = await createEstimateWithDeposit(page, { customerName, projectName });
  const estimateId = estimateUrl.match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();
  const { error: metaUpdateError } = await supabase
    .from("estimate_meta")
    .update({ tax: 125, discount: 250 })
    .eq("estimate_id", estimateId!);
  expect(metaUpdateError).toBeNull();

  await reloadWithE2EAuth(page);
  await approveSavedEstimate(page);
  await openPaymentSchedule(page);
  await page.getByRole("link", { name: /^Create Draft Invoice$/i }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/new\?/, { timeout: 30_000 });
  await expect(page.getByTestId("invoice-new-project-select")).toHaveValue(projectId);
  await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(customerName);
  await expect(page.getByTestId("invoice-new-line-1-rate-input")).toHaveValue("476.19");
  await expect(page.getByTestId("invoice-new-tax-input")).toHaveValue("5");
  await expect(page.getByText("$500.00", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/[^/?#]+\/preview/, { timeout: 30_000 });
  const invoiceId = invoiceIdFromUrl(page.url());

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id, customer_id, status, subtotal, tax_pct, tax_amount, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(invoice).toMatchObject({
    id: invoiceId,
    project_id: projectId,
    customer_id: customerId,
    status: "Draft",
  });
  expect(Number(invoice?.subtotal ?? 0)).toBe(476.19);
  expect(Number(invoice?.tax_pct ?? 0)).toBe(5);
  expect(Number(invoice?.tax_amount ?? 0)).toBe(23.81);
  expect(Number(invoice?.total ?? 0)).toBe(500);

  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("amount")
    .eq("invoice_id", invoiceId);
  expect(invoiceItems ?? []).toHaveLength(1);
  expect(Number(invoiceItems![0].amount)).toBe(476.19);
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
  await approveSavedEstimate(page);
  await openPaymentSchedule(page);
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
