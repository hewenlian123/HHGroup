import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const createdInvoiceIds = new Set<string>();
const createdPaymentIds = new Set<string>();
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

  const paymentIds = Array.from(createdPaymentIds);
  const invoiceIds = Array.from(createdInvoiceIds);
  const projectIds = Array.from(createdProjectIds);
  const customerIds = Array.from(createdCustomerIds);

  if (paymentIds.length > 0) {
    await supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds);
    await supabase.from("deposits").delete().in("payment_id", paymentIds);
    await supabase.from("invoice_payments").delete().in("payment_received_id", paymentIds);
    await supabase.from("payments_received").delete().in("id", paymentIds);
  }
  if (invoiceIds.length > 0) {
    await supabase.from("deposits").delete().in("invoice_id", invoiceIds);
    await supabase.from("payments_received").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
    await supabase.from("invoices").delete().in("id", invoiceIds);
  }
  if (projectIds.length > 0) await supabase.from("projects").delete().in("id", projectIds);
  if (customerIds.length > 0) await supabase.from("customers").delete().in("id", customerIds);
}

async function createInvoiceFixture(
  supabase: SupabaseClient,
  params: { suffix: number; status?: "Draft" | "Sent" | "Paid" | "Void"; total?: number }
): Promise<{
  customerId: string;
  projectId: string;
  invoiceId: string;
  invoiceNo: string;
  customerName: string;
  projectName: string;
  total: number;
}> {
  const total = params.total ?? 1200;
  const status = params.status ?? "Sent";
  const suffix = params.suffix;
  const customerName = `PW Payment Delete Customer ${suffix}`;
  const projectName = `PW Payment Delete Project ${suffix}`;
  const invoiceNo = `PW-PAY-DEL-${suffix}`;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      name: customerName,
      email: `payment-delete-${suffix}@example.test`,
      address: "1200 Payment Delete Way",
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
      address: "1200 Payment Delete Way",
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
      notes: "PW payment delete dependency test",
    })
    .select("id")
    .single();
  expect(invoiceError).toBeNull();
  const invoiceId = String(invoice!.id);
  createdInvoiceIds.add(invoiceId);

  const { error: itemError } = await supabase.from("invoice_items").insert({
    invoice_id: invoiceId,
    description: "Payment delete line item",
    qty: 1,
    unit_price: total,
    amount: total,
  });
  expect(itemError).toBeNull();

  return { customerId, projectId, invoiceId, invoiceNo, customerName, projectName, total };
}

async function addPaymentLinks(
  supabase: SupabaseClient,
  fixture: Awaited<ReturnType<typeof createInvoiceFixture>>,
  params: { amount?: number; paymentStatus?: string | null; invoicePaymentStatus?: string } = {}
): Promise<string> {
  const amount = params.amount ?? fixture.total;
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
      notes: "PW linked payment delete test",
      status: params.paymentStatus ?? "completed",
    })
    .select("id")
    .single();
  expect(paymentError).toBeNull();
  const paymentId = String(payment!.id);
  createdPaymentIds.add(paymentId);

  const { error: invoicePaymentError } = await supabase.from("invoice_payments").insert({
    invoice_id: fixture.invoiceId,
    amount,
    paid_at: today(),
    method: "Check",
    memo: "PW linked payment delete test",
    status: params.invoicePaymentStatus ?? "Posted",
    payment_received_id: paymentId,
  });
  expect(invoicePaymentError).toBeNull();

  const depositRow = {
    invoice_id: fixture.invoiceId,
    project_id: fixture.projectId,
    customer_name: fixture.customerName,
    deposit_account: "Operating",
    amount,
    payment_method: "Check",
    deposit_date: today(),
    status: params.paymentStatus === "void" ? "void" : "posted",
  };
  const { data: existingDeposits, error: existingDepositError } = await supabase
    .from("deposits")
    .select("id")
    .eq("payment_id", paymentId)
    .limit(1);
  expect(existingDepositError).toBeNull();
  const existingDepositId = existingDeposits?.[0]?.id ? String(existingDeposits[0].id) : null;
  const { error: depositError } = existingDepositId
    ? await supabase.from("deposits").update(depositRow).eq("id", existingDepositId)
    : await supabase.from("deposits").insert({ payment_id: paymentId, ...depositRow });
  expect(depositError).toBeNull();
  return paymentId;
}

async function openPaymentActions(page: Page, invoiceNo: string): Promise<void> {
  const button = page.getByRole("button", { name: new RegExp(`Actions for payment ${invoiceNo}`) });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
}

async function openPaymentPage(page: Page, paymentId: string, invoiceId: string): Promise<void> {
  await page.goto(`/financial/payments?paymentId=${paymentId}&invoiceId=${invoiceId}`);
  await expect(page.getByRole("heading", { name: "Payments Received" })).toBeVisible({
    timeout: 30_000,
  });
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

async function requestInvoiceDeleteFromDetail(page: Page): Promise<void> {
  const openDeleteItem = page.getByRole("menuitem", { name: "Delete Invoice" });
  if (await openDeleteItem.isVisible().catch(() => false)) {
    await openDeleteItem.click();
    return;
  }
  await page.getByRole("button", { name: /More/i }).click();
  await page.getByRole("menuitem", { name: "Delete Invoice" }).click();
}

test.afterEach(async () => {
  await cleanupRows();
  createdPaymentIds.clear();
  createdInvoiceIds.clear();
  createdProjectIds.clear();
  createdCustomerIds.clear();
});

test("active payment cannot be permanently deleted directly", async ({ page }) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Paid" });
  const paymentId = await addPaymentLinks(supabase!, fixture);

  await openPaymentPage(page, paymentId, fixture.invoiceId);
  await expect(page.getByText(fixture.customerName).first()).toBeVisible({ timeout: 30_000 });
  await openPaymentActions(page, fixture.invoiceNo);
  await expect(page.getByRole("menuitem", { name: "Void payment" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete payment" })).toHaveCount(0);
});

test("voided payment linked to an active invoice is blocked from permanent delete", async ({
  page,
}) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Paid" });
  const paymentId = await addPaymentLinks(supabase!, fixture, {
    paymentStatus: "void",
    invoicePaymentStatus: "Voided",
  });

  await openPaymentPage(page, paymentId, fixture.invoiceId);
  await openPaymentActions(page, fixture.invoiceNo);
  await page.getByRole("menuitem", { name: "Delete payment" }).click();
  const blocked = page.getByRole("dialog", { name: "Cannot delete payment yet" });
  await expect(blocked).toBeVisible({ timeout: 30_000 });
  await expect(blocked).toContainText("Payment is linked to an active invoice");
  await expect(blocked.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
});

test("voided payment can be deleted after its invoice is voided", async ({ page }) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Void" });
  const paymentId = await addPaymentLinks(supabase!, fixture, {
    paymentStatus: "void",
    invoicePaymentStatus: "Voided",
  });

  await openPaymentPage(page, paymentId, fixture.invoiceId);
  await openPaymentActions(page, fixture.invoiceNo);
  await page.getByRole("menuitem", { name: "Delete payment" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete voided payment?" });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });

  await expect
    .poll(async () => {
      const { data } = await supabase!
        .from("payments_received")
        .select("id")
        .eq("id", paymentId)
        .maybeSingle();
      return data ? "present" : "deleted";
    })
    .toBe("deleted");
  await expect
    .poll(async () => {
      const { count } = await supabase!
        .from("invoice_payments")
        .select("id", { count: "exact", head: true })
        .eq("payment_received_id", paymentId);
      return count ?? 0;
    })
    .toBe(0);
  await expect
    .poll(async () => {
      const { count } = await supabase!
        .from("deposits")
        .select("id", { count: "exact", head: true })
        .eq("payment_id", paymentId);
      return count ?? 0;
    })
    .toBe(0);
});

test("invoice delete can proceed after linked payment is voided and deleted", async ({ page }) => {
  const supabase = db();
  if (!supabase) test.skip(true, "Supabase env is required.");
  const fixture = await createInvoiceFixture(supabase!, { suffix: Date.now(), status: "Paid" });
  const paymentId = await addPaymentLinks(supabase!, fixture);

  await voidInvoiceFromDetail(page, fixture.invoiceId);
  await requestInvoiceDeleteFromDetail(page);
  const invoiceBlocked = page.getByRole("dialog", { name: "Cannot delete yet" });
  await expect(invoiceBlocked).toBeVisible({ timeout: 30_000 });
  await expect(invoiceBlocked).toContainText("Payment Received linked to this invoice");
  await invoiceBlocked
    .locator("div", { hasText: "Payment Received linked to this invoice" })
    .getByRole("link", { name: "Open" })
    .first()
    .click();

  await expect(page).toHaveURL(new RegExp(`/financial/payments\\?.*paymentId=${paymentId}`), {
    timeout: 30_000,
  });
  await openPaymentActions(page, fixture.invoiceNo);
  await page.getByRole("menuitem", { name: "Void payment" }).click();
  const voidDialog = page.getByRole("dialog", { name: "Void payment?" });
  await expect(voidDialog).toBeVisible({ timeout: 30_000 });
  await voidDialog.getByRole("button", { name: "Void" }).click();
  await expect(page.getByText("Voided").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(300);

  await openPaymentActions(page, fixture.invoiceNo);
  await page.getByRole("menuitem", { name: "Delete payment" }).click();
  const paymentDelete = page.getByRole("dialog", { name: "Delete voided payment?" });
  await expect(paymentDelete).toBeVisible({ timeout: 30_000 });
  await paymentDelete.getByRole("button", { name: "Delete permanently" }).click();
  await expect(paymentDelete).toBeHidden({ timeout: 30_000 });

  await page.goto(`/financial/invoices/${fixture.invoiceId}`);
  await requestInvoiceDeleteFromDetail(page);
  const invoiceDelete = page.getByRole("dialog", { name: "Delete voided invoice?" });
  await expect(invoiceDelete).toBeVisible({ timeout: 30_000 });
  await invoiceDelete.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices(?:[?#]|$)/, { timeout: 30_000 });

  const { data: invoice } = await supabase!
    .from("invoices")
    .select("id")
    .eq("id", fixture.invoiceId)
    .maybeSingle();
  expect(invoice).toBeNull();
});
