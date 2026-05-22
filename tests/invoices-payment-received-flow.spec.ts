import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_PROJECT_LABEL,
} from "./e2e-cleanup-db";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const E2E_CUSTOMER_LABEL = "[E2E] Test Customer";
const createdInvoiceNos = new Set<string>();
const createdClientNames = new Set<string>();

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

async function cleanupInvoices(): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  const ids = new Set<string>();

  const invoiceNos = Array.from(createdInvoiceNos);
  if (invoiceNos.length > 0) {
    const { data } = await supabase.from("invoices").select("id").in("invoice_no", invoiceNos);
    for (const row of data ?? []) ids.add((row as { id: string }).id);
  }

  const clientNames = Array.from(createdClientNames);
  if (clientNames.length > 0) {
    const { data } = await supabase.from("invoices").select("id").in("client_name", clientNames);
    for (const row of data ?? []) ids.add((row as { id: string }).id);
  }

  const invoiceIds = Array.from(ids).filter(Boolean);
  if (invoiceIds.length === 0) return;
  const { data: paymentRows } = await supabase
    .from("payments_received")
    .select("id")
    .in("invoice_id", invoiceIds);
  const paymentIds = (paymentRows ?? []).map((row: { id: string }) => row.id).filter(Boolean);
  if (paymentIds.length > 0) {
    await supabase.from("payment_received_attachments").delete().in("payment_id", paymentIds);
  }
  await supabase.from("deposits").delete().in("invoice_id", invoiceIds);
  await supabase.from("payments_received").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoice_payments").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoice_items").delete().in("invoice_id", invoiceIds);
  await supabase.from("invoices").delete().in("id", invoiceIds);
}

async function selectSeedProjectAndCustomer(page: Page): Promise<void> {
  const projectSelect = page.getByTestId("invoice-new-project-select");
  await expect(projectSelect).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    const optionCount = await projectSelect.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
  }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
  await projectSelect.selectOption({ label: E2E_PRESERVED_PROJECT_LABEL });

  const customerSelect = page.locator("select").filter({ hasText: E2E_CUSTOMER_LABEL }).first();
  await expect(customerSelect).toBeVisible({ timeout: 30_000 });
  await customerSelect.selectOption({ label: E2E_CUSTOMER_LABEL });
  await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(E2E_CUSTOMER_LABEL);
}

async function createDraftInvoice(page: Page, invoiceNo: string): Promise<string> {
  await page.goto("/financial/invoices/new");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible({
    timeout: 30_000,
  });

  await selectSeedProjectAndCustomer(page);
  await page.getByTestId("invoice-new-number-input").fill(invoiceNo);
  await page.getByTestId("invoice-new-due-date-input").fill("2026-06-30");
  await page.getByTestId("invoice-new-line-1-item-input").fill(`PW Payment item ${invoiceNo}`);
  await page.getByTestId("invoice-new-line-1-qty-input").fill("1");
  await page.getByTestId("invoice-new-line-1-rate-input").fill("225");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByTestId("invoice-detail")).toBeVisible({ timeout: 30_000 });
  return invoiceIdFromUrl(page.url());
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
  await page.reload();
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Unpaid", {
    timeout: 30_000,
  });
}

async function expectInvoiceDbState(
  supabase: SupabaseClient,
  invoiceId: string,
  expected: {
    status: string;
    paid: number;
    balance: number;
    projectId?: string;
    customerId?: string;
  }
): Promise<void> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, project_id, customer_id, status, total")
    .eq("id", invoiceId)
    .maybeSingle();
  expect(invoiceError).toBeNull();
  expect(invoice).toBeTruthy();
  if (expected.projectId)
    expect((invoice as { project_id: string | null }).project_id).toBe(expected.projectId);
  if (expected.customerId)
    expect((invoice as { customer_id: string | null }).customer_id).toBe(expected.customerId);
  expect((invoice as { status: string }).status).toBe(expected.status);

  const { data: payments } = await supabase
    .from("invoice_payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId);
  const paid = (payments ?? [])
    .filter((row: { status?: string | null }) => String(row.status ?? "Posted") !== "Voided")
    .reduce((sum, row: { amount?: number | string | null }) => sum + Number(row.amount ?? 0), 0);
  const total = Number((invoice as { total?: number | string | null }).total ?? 0);
  expect(Math.round(paid * 100) / 100).toBe(expected.paid);
  expect(Math.round(Math.max(0, total - paid) * 100) / 100).toBe(expected.balance);
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
  await cleanupInvoices();
  createdInvoiceNos.clear();
  createdClientNames.clear();
});

test("invoice project linkage, mark sent, and payment received flow stay in sync", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const supabase = db();
  if (!supabase) {
    test.skip(true, "Supabase env is required for invoice payment flow E2E.");
    return;
  }

  const suffix = Date.now();
  const invoiceNo = `PW-PAY-${suffix}`;
  createdInvoiceNos.add(invoiceNo);
  createdClientNames.add(E2E_CUSTOMER_LABEL);

  const invoiceId = await createDraftInvoice(page, invoiceNo);
  await expectInvoiceDbState(supabase, invoiceId, {
    status: "Draft",
    paid: 0,
    balance: 225,
    projectId: E2E_PRESERVED_PROJECT_ID,
    customerId: E2E_PRESERVED_CUSTOMER_ID,
  });

  await markInvoiceSent(page, invoiceId);
  await expectInvoiceDbState(supabase, invoiceId, {
    status: "Sent",
    paid: 0,
    balance: 225,
  });
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(225);

  await page.getByRole("link", { name: "Receive Payment" }).click();
  await expect(page).toHaveURL(/\/financial\/payments\?/, { timeout: 30_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get("invoiceId")).toBe(invoiceId);
  expect(url.searchParams.get("customerId")).toBe(E2E_PRESERVED_CUSTOMER_ID);
  expect(url.searchParams.get("projectId")).toBe(E2E_PRESERVED_PROJECT_ID);
  expect(url.searchParams.get("amountDue")).toBe("225");

  const dialog = page.getByRole("dialog", { name: "Receive Payment" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator("select").first()).toHaveValue(invoiceId);
  await expect(dialog.locator("input[readonly]").first()).toHaveValue(E2E_PRESERVED_PROJECT_LABEL);
  await expect(dialog.locator("input[readonly]").first()).not.toHaveValue(E2E_PRESERVED_PROJECT_ID);
  await expect(dialog.getByPlaceholder("Customer name")).toHaveValue(E2E_CUSTOMER_LABEL);
  await expect(dialog.getByPlaceholder("0")).toHaveValue("225");
  await dialog.getByPlaceholder("0").fill("100");
  await dialog.getByRole("button", { name: "Receive Payment" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await page.goto(`/financial/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Partial", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$125.00");
  await expectInvoiceDbState(supabase, invoiceId, {
    status: "Partially Paid",
    paid: 100,
    balance: 125,
  });
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(125);

  await page.getByRole("link", { name: "Receive Payment" }).click();
  await expect(page).toHaveURL(/\/financial\/payments\?/, { timeout: 30_000 });
  const secondDialog = page.getByRole("dialog", { name: "Receive Payment" });
  await expect(secondDialog).toBeVisible({ timeout: 30_000 });
  await expect(secondDialog.locator("input[readonly]").first()).toHaveValue(
    E2E_PRESERVED_PROJECT_LABEL
  );
  await expect(secondDialog.locator("input[readonly]").first()).not.toHaveValue(
    E2E_PRESERVED_PROJECT_ID
  );
  await expect(secondDialog.getByPlaceholder("0")).toHaveValue("125");
  await secondDialog.getByRole("button", { name: "Receive Payment" }).click();
  await expect(secondDialog).toBeHidden({ timeout: 30_000 });

  await page.goto(`/financial/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Paid", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$0.00");
  await expectInvoiceDbState(supabase, invoiceId, {
    status: "Paid",
    paid: 225,
    balance: 0,
  });
  expect(await projectOutstandingForInvoice(supabase, invoiceId)).toBe(0);
});
