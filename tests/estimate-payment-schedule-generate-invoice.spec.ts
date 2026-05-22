import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdCustomerNames = new Set<string>();
const createdProjectNames = new Set<string>();

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
    for (const row of invoices ?? []) invoiceIds.add((row as { id: string }).id);

    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("client", customerNames);
    for (const row of estimates ?? []) estimateIds.add((row as { id: string }).id);

    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .in("name", customerNames);
    for (const row of customers ?? []) customerIds.add((row as { id: string }).id);
  }

  if (projectNames.length > 0) {
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("project", projectNames);
    for (const row of estimates ?? []) estimateIds.add((row as { id: string }).id);

    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .in("name", projectNames);
    for (const row of projects ?? []) projectIds.add((row as { id: string }).id);
  }

  const ids = Array.from(invoiceIds);
  if (ids.length > 0) {
    const { data: payments } = await supabase
      .from("payments_received")
      .select("id")
      .in("invoice_id", ids);
    const paymentIds = (payments ?? []).map((row: { id: string }) => row.id).filter(Boolean);
    if (paymentIds.length > 0) {
      await supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds);
    }
    await supabase.from("deposits").delete().in("invoice_id", ids);
    await supabase.from("payments_received").delete().in("invoice_id", ids);
    await supabase.from("invoice_payments").delete().in("invoice_id", ids);
    await supabase.from("invoice_items").delete().in("invoice_id", ids);
    await supabase.from("invoices").delete().in("id", ids);
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
      address: "1200 Payment Schedule Test Way",
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
      budget: 4000,
      contract_amount: 4000,
      client: params.customerName,
      client_name: params.customerName,
      customer_id: customer!.id,
      address: "1200 Payment Schedule Test Way",
    })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  expect(project?.id).toBeTruthy();

  return { customerId: String(customer!.id), projectId: String(project!.id) };
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

async function addBlankEstimateLine(page: Page): Promise<void> {
  const addLine = page.getByRole("button", { name: /^Add line$/i }).first();
  await expect(addLine).toBeVisible({ timeout: 10_000 });
  await addLine.click();
  const blankLine = page.getByRole("menuitem", { name: /^Blank line$/i }).first();
  if (await blankLine.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankLine.click();
  }
}

async function fillEstimateDetails(
  page: Page,
  params: { customerName: string; projectName: string }
): Promise<void> {
  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Client or company name").fill(params.customerName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByPlaceholder("Site or client address").fill("1200 Payment Schedule Test Way");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function createEstimateWithThirtyPercentSchedule(
  page: Page,
  params: { customerName: string; projectName: string }
): Promise<string> {
  await page.goto("/estimates/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });

  await fillEstimateDetails(page, params);
  await addBlankEstimateSection(page);

  await page
    .getByLabel("Line item 1 title")
    .locator("visible=true")
    .fill("Start Work / Mobilization");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("500");

  await addBlankEstimateLine(page);
  await page
    .getByLabel("Line item 2 title")
    .locator("visible=true")
    .fill("Demolition / Grading / Excavation");
  await page.getByLabel("Line item 2 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 2 unit price").locator("visible=true").fill("1500");

  await addBlankEstimateLine(page);
  await page.getByLabel("Line item 3 title").locator("visible=true").fill("Foundation Preparation");
  await page.getByLabel("Line item 3 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 3 unit price").locator("visible=true").fill("2000");

  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(scheduleDialog).toBeVisible({ timeout: 10_000 });
  await scheduleDialog.getByLabel("Payment Name").fill("Deposit / Start Work");
  await scheduleDialog.getByLabel("% of estimate").fill("30");
  await expect(scheduleDialog.getByLabel("Amount")).toHaveValue("1200");
  await scheduleDialog
    .getByLabel("Description")
    .fill("30% deposit generated from payment schedule");
  await scheduleDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(scheduleDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Deposit / Start Work", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("$1,200.00").first()).toBeVisible();

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  return page.url().replace(/\?.*$/, "");
}

async function markInvoiceSent(page: Page, invoiceId: string): Promise<void> {
  await page.goto(`/financial/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Draft", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Mark as sent" }).click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Unpaid", {
    timeout: 30_000,
  });
}

async function projectOutstandingForInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<number> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id, status, total")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return 0;
  const status = String((invoice as { status?: string | null }).status ?? "").toLowerCase();
  if (status === "draft" || status === "void" || status === "voided" || status === "cancelled") {
    return 0;
  }
  const { data: payments } = await supabase
    .from("invoice_payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId);
  const paid = (payments ?? [])
    .filter((row: { status?: string | null }) => String(row.status ?? "Posted") !== "Voided")
    .reduce((sum, row: { amount?: number | string | null }) => sum + Number(row.amount ?? 0), 0);
  return (
    Math.round(
      Math.max(0, Number((invoice as { total?: number | string | null }).total ?? 0) - paid) * 100
    ) / 100
  );
}

test.afterEach(async () => {
  await cleanupCreatedRows();
  createdCustomerNames.clear();
  createdProjectNames.clear();
});

test("creates one draft invoice from an estimate payment schedule item and syncs payment flow", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for payment schedule invoice E2E.");
    return;
  }

  const suffix = Date.now();
  const customerName = `PW Schedule Invoice Customer ${suffix}`;
  const projectName = `PW Schedule Invoice Project ${suffix}`;
  createdCustomerNames.add(customerName);
  createdProjectNames.add(projectName);
  const { customerId, projectId } = await createCustomerAndProject(supabase, {
    customerName,
    projectName,
  });

  const estimateUrl = await createEstimateWithThirtyPercentSchedule(page, {
    customerName,
    projectName,
  });

  await page.getByRole("button", { name: /Create invoice for Deposit \/ Start Work/i }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/[^/?#]+/, { timeout: 30_000 });
  const invoiceId = invoiceIdFromUrl(page.url());

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, project_id, customer_id, client_name, status, notes, subtotal, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(invoice).toMatchObject({
    id: invoiceId,
    project_id: projectId,
    customer_id: customerId,
    client_name: customerName,
    status: "Draft",
  });
  expect(Number((invoice as { total: string | number }).total)).toBe(1200);
  expect(String((invoice as { notes?: string | null }).notes ?? "")).toContain(
    "Deposit / Start Work"
  );

  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("description, qty, unit_price, amount")
    .eq("invoice_id", invoiceId);
  expect(invoiceItems ?? []).toHaveLength(1);
  expect(String(invoiceItems![0].description)).toContain("Payment Schedule - Deposit / Start Work");
  expect(Number(invoiceItems![0].amount)).toBe(1200);

  const { data: scheduleItem } = await supabase
    .from("estimate_payment_schedule_items")
    .select("invoice_id, status")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  expect(scheduleItem).toMatchObject({ invoice_id: invoiceId, status: "invoiced" });
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(0);

  await page.goto(estimateUrl, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: /View invoice for Deposit \/ Start Work/i })
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: /Create invoice for Deposit \/ Start Work/i })
  ).toHaveCount(0);
  await page.getByRole("link", { name: /View invoice for Deposit \/ Start Work/i }).click();
  await expect(page).toHaveURL(new RegExp(`/financial/invoices/${invoiceId}`), {
    timeout: 30_000,
  });

  const { data: duplicateCheck } = await supabase
    .from("invoices")
    .select("id")
    .eq("client_name", customerName)
    .ilike("notes", "%Deposit / Start Work%");
  expect((duplicateCheck ?? []).map((row: { id: string }) => row.id)).toEqual([invoiceId]);

  await markInvoiceSent(page, invoiceId);
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(1200);

  const receivePaymentLink = page
    .locator(`a[href^="/financial/payments?invoiceId=${invoiceId}"]`)
    .filter({ hasText: "Receive Payment" })
    .first();
  await expect(receivePaymentLink).toBeVisible({ timeout: 30_000 });
  const paymentHref = await receivePaymentLink.getAttribute("href");
  expect(paymentHref).toBeTruthy();
  await page.goto(paymentHref!);
  await expect(page).toHaveURL(/\/financial\/payments\?/, { timeout: 30_000 });
  const paymentUrl = new URL(page.url());
  expect(paymentUrl.searchParams.get("invoiceId")).toBe(invoiceId);
  expect(paymentUrl.searchParams.get("customerId")).toBe(customerId);
  expect(paymentUrl.searchParams.get("projectId")).toBe(projectId);
  expect(paymentUrl.searchParams.get("amountDue")).toBe("1200");

  const dialog = page.getByRole("dialog", { name: "Receive Payment" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator("select").first()).toHaveValue(invoiceId);
  await expect(dialog.locator("input[readonly]").first()).toHaveValue(projectName);
  await expect(dialog.locator("input[readonly]").first()).not.toHaveValue(projectId);
  await expect(dialog.getByPlaceholder("Customer name")).toHaveValue(customerName);
  await expect(dialog.getByPlaceholder("0")).toHaveValue("1200");
  await dialog.getByRole("button", { name: "Receive Payment" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await page.goto(`/financial/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Paid", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$0.00");
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(0);
});
