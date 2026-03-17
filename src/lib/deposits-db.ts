/**
 * Deposits — table: deposits.
 * Columns (per DB): id, payment_id, amount, account, date, description, project_id, created_at.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type DepositRow = {
  id: string;
  payment_id: string;
  amount: number;
  account: string | null;
  date: string;
  description: string | null;
  project_id: string | null;
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

/** List all deposits. Newest first. Uses columns: id, payment_id, amount, account, date, description, project_id, created_at. */
export async function getDeposits(): Promise<DepositWithMeta[]> {
  const c = client();
  const { data: rows, error } = await c
    .from("deposits")
    .select("id, payment_id, amount, account, date, description, project_id, created_at")
    .order("date", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load deposits.");
  }
  const list = (rows ?? []) as DepositRow[];
  if (list.length === 0) return list.map((r) => ({ ...r, invoice_no: null, project_name: null }));
  const projectIds = Array.from(new Set(list.map((r) => r.project_id).filter(Boolean))) as string[];
  const projRes = projectIds.length ? await c.from("projects").select("id, name").in("id", projectIds) : { data: [] };
  const projectNameById = new Map((projRes.data ?? []).map((r: { id: string; name?: string }) => [r.id, r.name ?? null]));
  return list.map((r) => ({
    ...r,
    invoice_no: null,
    project_name: r.project_id ? projectNameById.get(r.project_id) ?? null : null,
  }));
}

/** Get deposits for a single invoice. deposits table has no invoice_id; returns [] unless schema has it. */
export async function getDepositsByInvoiceId(_invoiceId: string): Promise<DepositRow[]> {
  return [];
}

/** Sum of deposits.amount (Cash In for dashboard). */
export async function getTotalDepositsAmount(): Promise<number> {
  const c = client();
  const { data: rows, error } = await c.from("deposits").select("amount");
  if (error || !rows) return 0;
  return (rows as { amount: number }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/**
 * Create a deposit record. Table columns: payment_id, amount, account, date, description, project_id.
 */
export async function createDepositFromPayment(payment: {
  id: string;
  project_id?: string | null;
  amount: number;
  payment_date?: string;
  deposit_account?: string | null;
  description?: string | null;
}): Promise<DepositRow | null> {
  const c = client();
  const date = payment.payment_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const { data: row, error } = await c
    .from("deposits")
    .insert({
      payment_id: payment.id,
      amount: payment.amount,
      account: payment.deposit_account ?? null,
      date,
      description: payment.description ?? null,
      project_id: payment.project_id ?? null,
    })
    .select("id, payment_id, amount, account, date, description, project_id, created_at")
    .single();
  if (error) return null;
  return row as DepositRow;
}
