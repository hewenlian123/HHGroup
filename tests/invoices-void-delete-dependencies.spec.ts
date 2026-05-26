import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdInvoiceIds = new Set<string>();
const createdEstimateIds = new Set<string>();
const createdProjectIds = new Set<string>();
const createdCustomerIds = new Set<string>();

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function cleanupRows(): Promise<void> {
  const supabase = db();
  if (!supabase) return;

  const invoiceIds = Array.from(createdInvoiceIds);
  const estimateIds = Array.from(createdEstimateIds);
  const projectIds = Array.from(createdProjectIds);
  const customerIds = Array.from(createdCustomerIds);

  if (invoiceIds.length > 0) {
    await supabase
      .from("estimate_payment_schedule_items")
      .update({ invoice_id: null })
      .in("invoice_id", invoiceIds);
    const { data: payments } = await supabase
      .from("payments_received")
      .select("id")
      .in("invoice_id", invoiceIds);
    const paymentIds = (payments ?? []).map((row: { id: string }) => row.id).filter(Boolean);
    if (paymentIds.length > 0) {
      await supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds);
      await supabase.from("deposits").delete().in("payment_id", paymentIds);
    }
    await supabase.from("deposits").delete().in("invoice_id", invoiceIds);
    await supabase.from("payments_received").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoices").delete().in("id", invoiceIds);
  }

  if (estimateIds.length > 0) {
    await supabase.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIds);
    await supabase.from("estimate_meta").delete().in("estimate_id", estimateIds);
    await supabase.from("estimates").delete().in("id", estimateIds);
  }
  if (projectIds.length > 0) await supabase.from("projects").delete().in("id", projectIds);
  if (customerIds.length > 0) await supabase.from("customers").delete().in("id", customerIds);
}

async function createInvoiceFixture(
  supabase: SupabaseClient,
  params: { suffix: number; status?: "Draft" | "Sent" | "Paid"; total?: number }
): Promise<{
  customerId: string;
  projectId: string;
  invoiceId: string;
  invoiceNo: string;
  customerName: string;
  projectName: string;
}> {
  const total = params.total ?? 1200;
  const status = params.status ?? "Draft";
  const suffix = params.suffix;
  const customerName = `PW Void Delete Customer ${suffix}`;
  const projectName = `PW Void Delete Project ${suffix}`;
  const invoiceNo = `PW-VOID-DEL-${suffix}`;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      name: customerName,
      email: `void-delete-${suffix}@example.test`,
      address: "1200 Void Delete Way",
      status: "active",
    })
    .select("id")
    .single();
  expect(customerError).toBeNull();
  const customerId = String(customer!.id);
  createdCustomerIds.add(customerId);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: projectName,
      status: "Active",
      budget: total,
      contract_amount: total,
      client: customerName,
      client_name: customerName,
      customer_id: customerId,
      address: "1200 Void Delete Way",
    })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  const projectId = String(project!.id);
  createdProjectIds.add(projectId);

  const paid = status === "Paid" ? total : 0;
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_no: invoiceNo,
      project_id: projectId,
      customer_id: customerId,
      client_name: customerName,
      issue_date: today(),
      due_date: today(),
      status,
      subtotal: total,
      tax_amount: 0,
      total,
      paid_total: paid,
      balance_due: Math.max(0, total - paid),
      notes: "PW void delete dependency test",
    })
    .select("id")
    .single();
  expect(invoiceError).toBeNull();
  const invoiceId = String(invoice!.id);
  createdInvoiceIds.add(invoiceId);

  const { error: itemError } = await supabase.from("invoice_items").insert({
    invoice_id: invoiceId,
    description: "Dependency check line item",
    qty: 1,
    unit_price: total,
    amount: total,
  });
  expect(itemError).toBeNull();

  return { customerId, projectId, invoiceId, invoiceNo, customerName, projectName };
}

async function addPaymentLinks(
  supabase: SupabaseClient,
  fixture: Awaited<ReturnType<typeof createInvoiceFixture>>,
  amount = 1200
): Promise<void> {
  const { data: payment, error: paymentError } = await supabase
    .from("payments_received")
    .insert({
      invoice_id: fixture.invoiceId,
      project_id: fixture.projectId,
      customer_name: fixture.customerName,
      payment_date: today(),
      amount,
      payment_method: "Check",
      deposit_account: "Operating",
      notes: "PW linked payment blocker",
      status: "completed",
    })
    .select("id")
    .single();
  expect(paymentError).toBeNull();
  const paymentId = String(payment!.id);

  const { error: invoicePaymentError } = await supabase.from("invoice_payments").insert({
    invoice_id: fixture.invoiceId,
    amount,
    paid_at: today(),
    method: "Check",
    memo: "PW linked invoice payment blocker",
    status: "Posted",
    payment_received_id: paymentId,
  });
  expect(invoicePaymentError).toBeNull();

  const { error: depositError } = await supabase.from("deposits").insert({
    payment_id: paymentId,
    invoice_id: fixture.invoiceId,
    project_id: fixture.projectId,
    customer_name: fixture.customerName,
    deposit_account: "Operating",
    amount,
    payment_method: "Check",
    deposit_date: today(),
    status: "posted",
  });
  expect(depositError === null || depositError.code === "23505").toBeTruthy();
}

async function addScheduleLink(
  supabase: SupabaseClient,
  fixture: Awaited<ReturnType<typeof createInvoiceFixture>>
): Promise<string> {
  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .insert({
      number: `PW-EST-VOID-${Date.now()}`,
      client: fixture.customerName,
      project: fixture.projectName,
      status: "Draft",
      customer_id: fixture.customerId,
    })
    .select("id")
    .single();
  expect(estimateError).toBeNull();
  const estimateId = String(estimate!.id);
  createdEstimateIds.add(estimateId);

  await supabase.from("estimate_meta").insert({
    estimate_id: estimateId,
    client_name: fixture.customerName,
    project_name: fixture.projectName,
    estimate_date: today(),
  });

  const { error: scheduleError } = await supabase.from("estimate_payment_schedule_items").insert({
    estimate_id: estimateId,
    title: "Deposit / Start Work",
    description: "Linked schedule blocker",
    amount: 1200,
    due_date: today(),
    status: "invoiced",
    invoice_id: fixture.invoiceId,
    sort_order: 0,
  });
  expect(scheduleError).toBeNull();
  return estimateId;
}

async function voidInvoiceFromDetail(page: Page, invoiceId: string): Promise<void> {
  await page.goto(`/financial/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail-status")).not.toContainText("Void", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Void Invoice" }).click();
  const dialog = page.getByRole("dialog", { name: "Void invoice?" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Void" }).click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText(/void/i, {
    timeout: 30_000,
  });
}

async function requestDeleteFromDetail(page: Page): Promise<void> {
  const openDeleteItem = page.getByRole("menuitem", { name: "Delete Invoice" });
  try {
    await openDeleteItem.click({ timeout: 2_000 });
    return;
  } catch {
    // The void confirmation can leave the More menu either open or closed,
    // depending on timing. Fall through and open it explicitly when needed.
  }
  await page.getByRole("button", { name: /More/i }).click();
  await page.getByRole("menuitem", { name: "Delete Invoice" }).click();
}

test.afterEach(async () => {
  await cleanupRows();
  createdInvoiceIds.clear();
  createdEstimateIds.clear();
  createdProjectIds.clear();
  createdCustomerIds.clear();
});

test("void invoice with no linked payments can be permanently deleted", async ({ page }) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Draft" });

  await voidInvoiceFromDetail(page, fixture.invoiceId);
  await requestDeleteFromDetail(page);

  const confirm = page.getByRole("dialog", { name: "Delete voided invoice?" });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await expect(confirm).toContainText("no active payment links");
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices(?:[?#]|$)/, { timeout: 30_000 });

  const { data: invoice } = await supabase!
    .from("invoices")
    .select("id")
    .eq("id", fixture.invoiceId)
    .maybeSingle();
  expect(invoice).toBeNull();
  const { count } = await supabase!
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", fixture.invoiceId);
  expect(count ?? 0).toBe(0);
});

test("void invoice with payment, payment received, and deposit links is blocked", async ({
  page,
}) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Paid" });
  await addPaymentLinks(supabase!, fixture);

  await voidInvoiceFromDetail(page, fixture.invoiceId);
  await requestDeleteFromDetail(page);

  const blocked = page.getByRole("dialog", { name: "Cannot delete yet" });
  await expect(blocked).toBeVisible({ timeout: 30_000 });
  await expect(blocked).toContainText("Payment Received linked to this invoice");
  await expect(blocked).toContainText("Payment record linked to this invoice");
  await expect(blocked).toContainText("Deposit linked to this invoice/payment");
  await expect(blocked.getByRole("link", { name: "Open" }).first()).toBeVisible();
  await expect(blocked.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);

  const { data: invoice } = await supabase!
    .from("invoices")
    .select("id")
    .eq("id", fixture.invoiceId)
    .maybeSingle();
  expect(invoice?.id).toBe(fixture.invoiceId);
});

test("payment schedule linked invoice is blocked, can be unlinked, then deleted", async ({
  page,
}) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Draft" });
  const estimateId = await addScheduleLink(supabase!, fixture);

  await voidInvoiceFromDetail(page, fixture.invoiceId);
  await requestDeleteFromDetail(page);

  const blocked = page.getByRole("dialog", { name: "Cannot delete yet" });
  await expect(blocked).toBeVisible({ timeout: 30_000 });
  await expect(blocked).toContainText("Estimate payment schedule item linked to this invoice");
  await expect(blocked.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    `/estimates/${estimateId}`
  );
  await blocked.getByRole("button", { name: "Unlink" }).click();
  await expect(blocked).toBeHidden({ timeout: 30_000 });

  await requestDeleteFromDetail(page);
  const confirm = page.getByRole("dialog", { name: "Delete voided invoice?" });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices(?:[?#]|$)/, { timeout: 30_000 });

  await page.goto(`/estimates/${estimateId}`);
  await expect(page.getByRole("link", { name: /^View Invoice$/i })).toHaveCount(0);
});

test("non-void invoice cannot be hard deleted from detail actions", async ({ page }) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Draft" });

  await page.goto(`/financial/invoices/${fixture.invoiceId}`);
  await requestDeleteFromDetail(page);
  const blocked = page.getByRole("dialog", { name: "Cannot delete invoice" });
  await expect(blocked).toBeVisible({ timeout: 30_000 });
  await expect(blocked).toContainText("Only voided invoices can be permanently deleted");
  await expect(page.getByRole("dialog", { name: "Delete voided invoice?" })).toHaveCount(0);

  const { data: invoice } = await supabase!
    .from("invoices")
    .select("id")
    .eq("id", fixture.invoiceId)
    .maybeSingle();
  expect(invoice?.id).toBe(fixture.invoiceId);
});
