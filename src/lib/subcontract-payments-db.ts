/**
 * Subcontract payments — Supabase only. No mock data.
 * Table: subcontract_payments.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type SubcontractPaymentRow = {
  id: string;
  subcontract_id: string;
  bill_id: string | null;
  payment_date: string;
  amount: number;
  method: string | null;
  note: string | null;
  created_at: string;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

/** Fetch all payments for summary: subcontract_id, amount. */
export async function getPaymentsSummaryAll(): Promise<
  { subcontract_id: string; amount: number }[]
> {
  const c = client();
  const { data: rows, error } = await c
    .from("subcontract_payments")
    .select("subcontract_id, amount");
  if (error) throw new Error(error.message ?? "Failed to load payments.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    subcontract_id: (r.subcontract_id as string) ?? "",
    amount: Number(r.amount) || 0,
  }));
}

/** Fetch all payments with bill_id and amount (for cashflow expected outflow). */
export async function getPaymentsAll(): Promise<{ bill_id: string | null; amount: number }[]> {
  const c = client();
  const { data: rows, error } = await c.from("subcontract_payments").select("bill_id, amount");
  if (error) throw new Error(error.message ?? "Failed to load payments.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    bill_id: (r.bill_id as string | null) ?? null,
    amount: Number(r.amount) || 0,
  }));
}

/** Fetch all payment rows for the given subcontract ids (e.g. for one subcontractor). */
export async function getPaymentsBySubcontractIds(
  subcontractIds: string[]
): Promise<SubcontractPaymentRow[]> {
  if (subcontractIds.length === 0) return [];
  const c = client();
  const { data: rows, error } = await c
    .from("subcontract_payments")
    .select("id, subcontract_id, bill_id, payment_date, amount, method, note, created_at")
    .in("subcontract_id", subcontractIds)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load payments.");
  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: (r.id as string) ?? "",
    subcontract_id: (r.subcontract_id as string) ?? "",
    bill_id: (r.bill_id as string | null) ?? null,
    payment_date: ((r.payment_date as string) ?? "").slice(0, 10),
    amount: Number(r.amount) || 0,
    method: (r.method as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
  }));
}

function isMissingFunction(err: { message?: string } | null): boolean {
  const m = err?.message ?? "";
  return /could not find the function|schema cache/i.test(m);
}

export async function recordSubcontractPayment(input: {
  subcontract_id: string;
  bill_id: string;
  payment_date: string;
  amount: number;
  method?: string | null;
  note?: string | null;
}): Promise<void> {
  const c = client();
  const { error } = await c.rpc("record_subcontract_payment", {
    p_subcontract_id: input.subcontract_id,
    p_bill_id: input.bill_id,
    p_payment_date: input.payment_date.slice(0, 10),
    p_amount: Number(input.amount) || 0,
    p_method: input.method ?? null,
    p_note: input.note ?? null,
  });
  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message ?? "Failed to record payment.");
    // Fallback: insert payment row directly, then update bill status based on totals.
    const paidAmount = Number(input.amount) || 0;
    const { error: insErr } = await c.from("subcontract_payments").insert({
      subcontract_id: input.subcontract_id,
      bill_id: input.bill_id,
      payment_date: input.payment_date.slice(0, 10),
      amount: paidAmount,
      method: input.method ?? null,
      note: input.note ?? null,
    });
    if (insErr) throw new Error(insErr.message ?? "Failed to record payment.");

    // Recalculate bill status: fetch bill amount + all payments for this bill.
    const [{ data: billRow }, { data: payRows }] = await Promise.all([
      c.from("subcontract_bills").select("amount").eq("id", input.bill_id).maybeSingle(),
      c.from("subcontract_payments").select("amount").eq("bill_id", input.bill_id),
    ]);
    const billTotal = Number((billRow as { amount?: number } | null)?.amount) || 0;
    const paidTotal = ((payRows ?? []) as Array<{ amount?: number }>).reduce(
      (s, r) => s + (Number(r.amount) || 0),
      0
    );
    const newStatus = paidTotal >= billTotal ? "Paid" : "Partial";
    await c.from("subcontract_bills").update({ status: newStatus }).eq("id", input.bill_id);
  }
}
