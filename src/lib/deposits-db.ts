/**
 * Deposits — auto-created from payments_received. Used for Cash In on dashboard.
 * Table: deposits.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type DepositRow = {
  id: string;
  payment_id: string;
  invoice_id: string;
  project_id: string | null;
  customer_name: string;
  deposit_account: string | null;
  amount: number;
  payment_method: string | null;
  deposit_date: string;
  created_at: string;
};

export type DepositWithMeta = DepositRow & {
  invoice_no: string | null;
  project_name: string | null;
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

/** List all deposits with invoice_no and project name. Newest first. */
export async function getDeposits(): Promise<DepositWithMeta[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("deposits")
    .select("id, payment_id, invoice_id, project_id, customer_name, deposit_account, amount, payment_method, deposit_date, created_at")
    .order("deposit_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load deposits.");
  }
  const list = (rows ?? []) as DepositRow[];
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

/** Get deposits for a single invoice. */
export async function getDepositsByInvoiceId(invoiceId: string): Promise<DepositRow[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("deposits")
    .select("id, payment_id, invoice_id, project_id, customer_name, deposit_account, amount, payment_method, deposit_date, created_at")
    .eq("invoice_id", invoiceId)
    .order("deposit_date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load deposits.");
  }
  return (rows ?? []) as DepositRow[];
}

/** Sum of deposits.amount (Cash In for dashboard). */
export async function getTotalDepositsAmount(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c.from("deposits").select("amount");
  if (error || !rows) return 0;
  return (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/**
 * Create a deposit record from a payment received row. Called by createPaymentReceived.
 */
export async function createDepositFromPayment(payment: {
  id: string;
  invoice_id: string;
  project_id: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  deposit_account: string | null;
}): Promise<DepositRow | null> {
  const c = client();
  const depositDate = payment.payment_date.slice(0, 10);
  const { data: row, error } = await c
    .from("deposits")
    .insert({
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      project_id: payment.project_id ?? null,
      customer_name: payment.customer_name ?? "",
      deposit_account: payment.deposit_account ?? null,
      amount: payment.amount,
      payment_method: payment.payment_method ?? null,
      deposit_date: depositDate,
    })
    .select("id, payment_id, invoice_id, project_id, customer_name, deposit_account, amount, payment_method, deposit_date, created_at")
    .single();
  if (error) return null;
  return row as DepositRow;
}
