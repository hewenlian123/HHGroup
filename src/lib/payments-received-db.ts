/**
 * Payments Received — AR payments linked to invoices.
 * Table: payments_received. Additive only; syncs to invoice_payments so existing invoice balance logic applies.
 * Creates a deposit record automatically for each payment (deposits table).
 */

import { getSupabaseClient } from "@/lib/supabase";
import { createDepositFromPayment } from "@/lib/deposits-db";

export const PAYMENT_METHODS = ["Check", "ACH", "Wire", "Cash", "Credit Card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentReceivedRow = {
  id: string;
  invoice_id: string;
  project_id: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  deposit_account: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
};

export type PaymentReceivedWithMeta = PaymentReceivedRow & {
  invoice_no: string | null;
  project_name: string | null;
};

export type CreatePaymentReceivedPayload = {
  invoice_id: string;
  project_id?: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  deposit_account?: string | null;
  notes?: string | null;
  attachment_url?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /relation.*does not exist|table.*does not exist|could not find/i.test(m);
}

/** List all payments received with invoice_no and project name. */
export async function getPaymentsReceived(): Promise<PaymentReceivedWithMeta[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("payments_received")
    .select("id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, created_at")
    .order("payment_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payments received.");
  }
  const list = (rows ?? []) as PaymentReceivedRow[];
  if (list.length === 0) return [];
  const invoiceIds = Array.from(new Set(list.map((r) => r.invoice_id)));
  const projectIds = Array.from(new Set(list.map((r) => r.project_id).filter(Boolean))) as string[];
  const [invRes, projRes] = await Promise.all([
    c.from("invoices").select("id, invoice_no").in("id", invoiceIds),
    projectIds.length ? c.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  const invoiceNoById = new Map((invRes.data ?? []).map((r: { id: string; invoice_no?: string }) => [r.id, r.invoice_no ?? null]));
  const projectNameById = new Map((projRes.data ?? []).map((r: { id: string; name?: string }) => [r.id, r.name ?? null]));
  return list.map((r) => ({
    ...r,
    invoice_no: invoiceNoById.get(r.invoice_id) ?? null,
    project_name: r.project_id ? projectNameById.get(r.project_id) ?? null : null,
  }));
}

/** Get payments for a single invoice. */
export async function getPaymentsReceivedByInvoiceId(invoiceId: string): Promise<PaymentReceivedRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("payments_received")
    .select("id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, created_at")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load payments.");
  }
  return (rows ?? []) as PaymentReceivedRow[];
}

/** Sum of payments_received.amount for an invoice. */
export async function getSumPaymentsReceivedByInvoiceId(invoiceId: string): Promise<number> {
  const c = client();
  const { data: rows, error } = await c
    .from("payments_received")
    .select("amount")
    .eq("invoice_id", invoiceId);
  if (error || !rows) return 0;
  return (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/**
 * Create a payment received. Inserts into payments_received and into invoice_payments
 * so the existing invoice trigger updates paid_total, balance_due, and status.
 */
function isMissingColumn(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /column .* does not exist|could not find the .* column|schema cache/i.test(m);
}

export async function createPaymentReceived(payload: CreatePaymentReceivedPayload): Promise<PaymentReceivedRow> {
  const c = client();
  const paymentDate = payload.payment_date.slice(0, 10);

  // Full insert with all optional columns. If schema cache lags, retry stripping unknown columns.
  const insertAttempts: Record<string, unknown>[] = [
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      deposit_account: payload.deposit_account ?? null,
      notes: payload.notes ?? null,
      attachment_url: payload.attachment_url ?? null,
    },
    // Without attachment_url
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      deposit_account: payload.deposit_account ?? null,
      notes: payload.notes ?? null,
    },
    // Without deposit_account + attachment_url
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      customer_name: payload.customer_name ?? "",
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
      notes: payload.notes ?? null,
    },
    // Without customer_name (old schema)
    {
      invoice_id: payload.invoice_id,
      project_id: payload.project_id ?? null,
      payment_date: paymentDate,
      amount: payload.amount,
      payment_method: payload.payment_method || null,
    },
    // Minimal
    {
      invoice_id: payload.invoice_id,
      payment_date: paymentDate,
      amount: payload.amount,
    },
  ];

  // Select columns: try full then fallback to minimal
  const selectAttempts = [
    "id, invoice_id, project_id, customer_name, payment_date, amount, payment_method, deposit_account, notes, attachment_url, created_at",
    "id, invoice_id, project_id, payment_date, amount, payment_method, created_at",
    "id, invoice_id, payment_date, amount, created_at",
  ];

  let row: PaymentReceivedRow | null = null;
  let lastError: { message?: string } | null = null;

  for (const insertRow of insertAttempts) {
    for (const selectCols of selectAttempts) {
      const { data, error } = await c
        .from("payments_received")
        .insert(insertRow)
        .select(selectCols)
        .single();
      if (!error) {
        row = data as unknown as PaymentReceivedRow;
        break;
      }
      lastError = error as { message?: string };
      if (!isMissingColumn(lastError)) break;
    }
    if (row) break;
    if (lastError && !isMissingColumn(lastError)) break;
  }

  if (!row) throw new Error(lastError?.message ?? "Failed to create payment.");
  const payment = row;

  // Auto-create deposit record (payment_id, invoice_id, project_id, customer_name, deposit_account, amount, payment_method, deposit_date)
  await createDepositFromPayment({
    id: payment.id,
    project_id: payment.project_id,
    amount: payment.amount,
    payment_date: payment.payment_date,
    deposit_account: payment.deposit_account,
    description: payment.notes ?? payment.customer_name ?? null,
  });

  // Sync to invoice_payments so existing recompute_invoice_totals trigger updates the invoice.
  await c.from("invoice_payments").insert({
    invoice_id: payload.invoice_id,
    paid_at: paymentDate,
    amount: payload.amount,
    method: payload.payment_method || null,
    memo: payload.notes ?? payload.deposit_account ?? null,
    status: "Posted",
  });

  return payment;
}
