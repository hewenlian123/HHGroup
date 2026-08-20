import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const ESTIMATE_TOTAL = 2500;
const DEPOSIT_AMOUNT = 500;
const TEST_EMAIL = "test+estimate-receipt-flow@hhprojectgroup.com";

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

function idFromUrl(url: string, segment: "estimates" | "invoices"): string {
  const match = url.match(new RegExp(`/${segment}/([^/?#]+)`));
  if (!match?.[1] || match[1] === "new") {
    throw new Error(`Could not determine ${segment} id from URL: ${url}`);
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

  const estimateIdList = Array.from(estimateIds);
  if (estimateIdList.length > 0) {
    await supabase
      .from("estimate_payment_schedule_items")
      .delete()
      .in("estimate_id", estimateIdList);
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

  if (estimateIdList.length > 0) {
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

  await expectCreatedRowsGone(supabase, { customerNames, projectNames });
}

async function expectCreatedRowsGone(
  supabase: SupabaseClient,
  params: { customerNames: string[]; projectNames: string[] }
): Promise<void> {
  if (params.customerNames.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id")
      .in("client_name", params.customerNames);
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("client", params.customerNames);
    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .in("name", params.customerNames);
    expect(invoices ?? []).toHaveLength(0);
    expect(estimates ?? []).toHaveLength(0);
    expect(customers ?? []).toHaveLength(0);
  }

  if (params.projectNames.length > 0) {
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id")
      .in("project", params.projectNames);
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .in("name", params.projectNames);
    expect(estimates ?? []).toHaveLength(0);
    expect(projects ?? []).toHaveLength(0);
  }
}

async function createLinkedCustomerProject(
  supabase: SupabaseClient,
  params: { customerName: string; projectName: string }
): Promise<{ customerId: string; projectId: string }> {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      name: params.customerName,
      email: TEST_EMAIL,
      phone: "(808) 555-0101",
      address: "100 QA Test Lane",
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
      budget: ESTIMATE_TOTAL,
      contract_amount: ESTIMATE_TOTAL,
      client: params.customerName,
      client_name: params.customerName,
      customer_id: customer!.id,
      address: "100 QA Test Lane",
    })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  expect(project?.id).toBeTruthy();

  return { customerId: String(customer!.id), projectId: String(project!.id) };
}

async function fillEstimateDetails(
  page: Page,
  params: { customerName: string; projectName: string }
): Promise<void> {
  await page.getByRole("button", { name: /Edit details/i }).click();
  const dialog = page.getByRole("dialog", { name: /Customer \/ project \/ pricing details/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByPlaceholder("Client or company name").fill(params.customerName);
  await dialog.getByPlaceholder("Project name").fill(params.projectName);
  await dialog.getByPlaceholder("Site or client address").fill("100 QA Test Lane");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function addScopeAndDeposit(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  const blankSection = page.getByRole("menuitem", { name: /^Blank section$/i }).first();
  if (await blankSection.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await blankSection.click();
  }

  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Receipt flow test work");
  await page
    .getByLabel("Line item 1 description")
    .locator("visible=true")
    .fill("Receipt flow test work");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("2");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("1250");
  await expect(page.locator(":visible", { hasText: "$2,500.00" }).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Schedule Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Amount")).toHaveValue("");
  await expect(dialog.getByLabel("% of estimate")).toHaveValue("");
  await dialog.getByLabel("Payment Name").fill("Deposit");
  await dialog.getByLabel("Amount").fill(String(DEPOSIT_AMOUNT));
  await expect(dialog.getByText("20% of $2,500.00")).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Description").fill("Deposit before work starts");
  await dialog.getByLabel("Due Date").fill("2026-06-01");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText("Deposit", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Due: Jun 1, 2026")).toBeVisible({ timeout: 10_000 });
}

async function markInvoiceSent(page: Page, invoiceId: string): Promise<void> {
  await page.goto(`/financial/invoices/${invoiceId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Draft", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Mark as sent" }).click();
  await expect(page.getByTestId("invoice-detail-status")).toContainText(/Unpaid|Overdue/, {
    timeout: 30_000,
  });
}

async function expectReceiptPreview(
  page: Page,
  params: {
    paymentId: string;
    invoiceNo: string;
    customerName: string;
    projectName: string;
    memo: string;
  }
): Promise<void> {
  await page.goto(`/financial/payments?receipt=${params.paymentId}`, {
    waitUntil: "domcontentloaded",
  });
  const receiptDialog = page.getByRole("dialog", { name: "Payment receipt" });
  await expect(receiptDialog).toBeVisible({ timeout: 30_000 });
  await expect(receiptDialog).toContainText(params.customerName);
  await expect(receiptDialog).toContainText(params.projectName);
  await expect(receiptDialog).toContainText(params.invoiceNo);
  await expect(receiptDialog).toContainText("$500.00");
  await expect(receiptDialog).toContainText("$0.00");
  await expect(receiptDialog).toContainText("Check");
  await expect(receiptDialog).toContainText(params.memo);

  await receiptDialog.getByRole("button", { name: "Send" }).click();
  const sendReceiptDialog = page.getByRole("dialog", { name: "Send payment receipt" });
  await expect(sendReceiptDialog).toBeVisible({ timeout: 30_000 });
  await expect(sendReceiptDialog.getByPlaceholder("customer@email.com")).toHaveValue(TEST_EMAIL);
  await expect(sendReceiptDialog.getByRole("button", { name: /Download PDF/i })).toBeVisible();
}

test.afterEach(async () => {
  await cleanupCreatedRows();
  createdCustomerNames.clear();
  createdProjectNames.clear();
});

test("estimate deposit invoice can be paid and shown on a receipt", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  assertE2EBaseUrlSafeForMutations(baseURL, "estimate invoice payment receipt flow");
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for estimate invoice payment receipt E2E.");
    return;
  }

  const suffix = Date.now();
  const marker = `PW Estimate Receipt Flow ${suffix}`;
  const customerName = `${marker} Customer`;
  const projectName = `${marker} Project`;
  const paymentMemo = `Playwright receipt flow test PW-RECEIPT-FLOW-${suffix}`;
  createdCustomerNames.add(customerName);
  createdProjectNames.add(projectName);

  const { customerId, projectId } = await createLinkedCustomerProject(supabase, {
    customerName,
    projectName,
  });

  await page.goto("/estimates/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
    timeout: 30_000,
  });
  await fillEstimateDetails(page, { customerName, projectName });
  await addScopeAndDeposit(page);

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 30_000 });
  const estimateUrl = page.url().replace(/\?.*$/, "");
  const estimateId = idFromUrl(estimateUrl, "estimates");

  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const previewMain = page.locator("main");
  await expect(previewMain).toContainText("$2,500.00");
  await expect(previewMain).toContainText("Deposit");
  await expect(previewMain).toContainText("Due: Jun 1, 2026");

  await page.goto(estimateUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /^Create Draft Invoice$/i }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/new\?/, { timeout: 30_000 });
  await expect(page.getByTestId("invoice-new-project-select")).toHaveValue(projectId);
  await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(customerName);
  await expect(page.getByTestId("invoice-new-due-date-input")).toHaveValue("2026-06-01");
  await expect(page.getByTestId("invoice-new-line-1-item-input")).toHaveValue("Deposit");
  await expect(page.getByTestId("invoice-new-line-1-description-input")).toHaveValue(
    "Deposit before work starts"
  );
  await expect(page.getByTestId("invoice-new-line-1-qty-input")).toHaveValue("1");
  await expect(page.getByTestId("invoice-new-line-1-rate-input")).toHaveValue("500");
  await page.getByRole("button", { name: "Create draft invoice" }).click();
  await expect(page).toHaveURL(/\/financial\/invoices\/[^/?#]+\/preview/, { timeout: 30_000 });
  const invoiceId = idFromUrl(page.url(), "invoices");
  await expect(page.locator("body")).toContainText(customerName);
  await expect(page.locator("body")).toContainText(projectName);
  await expect(page.locator("body")).toContainText("$500.00");
  await expect(page.locator("body")).not.toContainText("$2,500.00");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_no, project_id, customer_id, client_name, status, subtotal, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(invoice).toMatchObject({
    id: invoiceId,
    project_id: projectId,
    customer_id: customerId,
    client_name: customerName,
    status: "Draft",
  });
  expect(Number((invoice as { subtotal?: number | string | null }).subtotal ?? 0)).toBe(
    DEPOSIT_AMOUNT
  );
  expect(Number((invoice as { total?: number | string | null }).total ?? 0)).toBe(DEPOSIT_AMOUNT);

  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("description, amount")
    .eq("invoice_id", invoiceId);
  expect(invoiceItems ?? []).toHaveLength(1);
  expect(String(invoiceItems![0].description)).toContain("Deposit");
  expect(String(invoiceItems![0].description)).toContain("Deposit before work starts");
  expect(Number(invoiceItems![0].amount)).toBe(DEPOSIT_AMOUNT);

  const { data: linkedSchedule } = await supabase
    .from("estimate_payment_schedule_items")
    .select("title, amount, invoice_id, status")
    .eq("estimate_id", estimateId)
    .maybeSingle();
  expect(linkedSchedule).toMatchObject({
    title: "Deposit",
    invoice_id: invoiceId,
    status: "invoiced",
  });
  expect(Number((linkedSchedule as { amount?: number | string | null }).amount ?? 0)).toBe(
    DEPOSIT_AMOUNT
  );

  if (!/\/financial\/invoices\/[^/?#]+\/preview/.test(page.url())) {
    await page.getByTestId("invoice-detail-preview-link").click();
    await expect(page).toHaveURL(/\/financial\/invoices\/[^/?#]+\/preview/, { timeout: 30_000 });
  }
  await expect(page.locator("body")).toContainText("$500.00");

  await markInvoiceSent(page, invoiceId);
  await page.keyboard.press("Escape");
  await page.locator('a[href^="/financial/payments?invoiceId="]').click();
  await expect(page).toHaveURL(/\/financial\/payments\?/, { timeout: 30_000 });
  const paymentUrl = new URL(page.url());
  expect(paymentUrl.searchParams.get("invoiceId")).toBe(invoiceId);
  expect(paymentUrl.searchParams.get("customerId")).toBe(customerId);
  expect(paymentUrl.searchParams.get("projectId")).toBe(projectId);
  expect(paymentUrl.searchParams.get("amountDue")).toBe(String(DEPOSIT_AMOUNT));

  const paymentDialog = page.getByRole("dialog", { name: "Receive Payment" });
  await expect(paymentDialog).toBeVisible({ timeout: 30_000 });
  await expect(paymentDialog.locator("select").first()).toHaveValue(invoiceId);
  await expect(paymentDialog.locator("input[readonly]").first()).toHaveValue(projectName);
  await expect(paymentDialog.getByPlaceholder("Customer name")).toHaveValue(customerName);
  await expect(paymentDialog.getByPlaceholder("0")).toHaveValue(String(DEPOSIT_AMOUNT));
  await paymentDialog.locator("select").nth(1).selectOption("Check");
  await paymentDialog.getByPlaceholder("Optional").fill(paymentMemo);
  await paymentDialog.getByRole("button", { name: "Receive Payment" }).click();
  await expect(paymentDialog).toBeHidden({ timeout: 30_000 });

  await page.goto(`/financial/invoices/${invoiceId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Paid", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$0.00");

  const { data: payments } = await supabase
    .from("payments_received")
    .select("id, invoice_id, project_id, customer_name, amount, payment_method, notes, status")
    .eq("invoice_id", invoiceId);
  expect(payments ?? []).toHaveLength(1);
  const payment = payments![0] as {
    id: string;
    invoice_id: string;
    project_id: string;
    customer_name: string;
    amount: number | string;
    payment_method: string | null;
    notes: string | null;
    status: string | null;
  };
  expect(payment).toMatchObject({
    invoice_id: invoiceId,
    project_id: projectId,
    customer_name: customerName,
    payment_method: "Check",
  });
  expect(Number(payment.amount)).toBe(DEPOSIT_AMOUNT);
  expect(String(payment.notes ?? "")).toContain(paymentMemo);
  expect(String(payment.status ?? "posted").toLowerCase()).not.toBe("void");

  const { data: invoicePaymentRows } = await supabase
    .from("invoice_payments")
    .select("invoice_id, amount, status, payment_received_id")
    .eq("invoice_id", invoiceId);
  expect(invoicePaymentRows ?? []).toHaveLength(1);
  expect(Number(invoicePaymentRows![0].amount)).toBe(DEPOSIT_AMOUNT);
  expect(invoicePaymentRows![0].payment_received_id).toBe(payment.id);

  const { data: paidInvoice } = await supabase
    .from("invoices")
    .select("status, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(paidInvoice).toMatchObject({ status: "Paid" });
  const paidTotal = (invoicePaymentRows ?? []).reduce(
    (sum, row: { amount?: number | string | null }) => sum + Number(row.amount ?? 0),
    0
  );
  expect(paidTotal).toBe(DEPOSIT_AMOUNT);
  expect(Number((paidInvoice as { total?: number | string | null }).total ?? 0) - paidTotal).toBe(
    0
  );

  await expectReceiptPreview(page, {
    paymentId: payment.id,
    invoiceNo: String((invoice as { invoice_no?: string | null }).invoice_no ?? ""),
    customerName,
    projectName,
    memo: paymentMemo,
  });

  await page.goto(estimateUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /^View Invoice$/i })).toBeVisible({
    timeout: 30_000,
  });
});
