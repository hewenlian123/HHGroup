/**
 * Worker payments: records payout events (admin pays worker).
 * Table: worker_payments.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export type WorkerPayment = {
  id: string;
  workerId: string;
  /** Legacy UI field; DB has no project scope on worker_payments — always null. */
  projectId: string | null;
  /** Calendar date for display / receipt sequencing (from created_at). */
  paymentDate: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  /** Denormalized labor_entries.id[] settled by this payment (audit / receipt). */
  laborEntryIds: string[] | null;
};

export type CreateWorkerPaymentInput = {
  workerId: string;
  /** Ignored at insert — column removed from worker_payments. */
  projectId?: string | null;
  /** Ignored at insert — use server created_at; kept for API compatibility. */
  paymentDate?: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /schema cache|relation.*does not exist|could not find the table|table.*does not exist|pgrst205/i.test(m) || err?.code === "PGRST205";
}

const COLS_BASE = "id, worker_id, total_amount, payment_method, note, created_at";
const COLS = `${COLS_BASE}, labor_entry_ids`;

function parseLaborEntryIds(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
    return ids.length ? ids : null;
  }
  return null;
}

function fromRow(r: Record<string, unknown>): WorkerPayment {
  const createdAt = (r.created_at as string) ?? "";
  return {
    id: (r.id as string) ?? "",
    workerId: (r.worker_id as string) ?? "",
    projectId: null,
    paymentDate: createdAt.slice(0, 10),
    amount: Number(r.total_amount ?? r.amount) || 0,
    paymentMethod: (r.payment_method as string | null) ?? null,
    notes: ((r.note ?? r.notes) as string | null) ?? null,
    createdAt,
    laborEntryIds: parseLaborEntryIds(r.labor_entry_ids),
  };
}

/**
 * Insert worker_payments using an explicit Supabase client (e.g. service role in API routes).
 */
export async function createWorkerPaymentWithClient(
  c: SupabaseClient,
  input: CreateWorkerPaymentInput
): Promise<WorkerPayment> {
  const amt = Number(input.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be greater than 0.");
  const method = input.paymentMethod?.trim();
  if (!method) throw new Error("Payment method is required.");

  const payload = {
    worker_id: input.workerId,
    total_amount: amt,
    payment_method: method,
    note: input.notes?.trim() || null,
  };

  const { data, error } = await c.from("worker_payments").insert(payload).select(COLS_BASE).single();
  if (error) {
    if (isMissingTable(error)) throw new Error("未找到 worker_payments 表。请先创建该表后再记录付款。");
    throw new Error(error.message ?? "Failed to create worker payment.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function createWorkerPayment(input: CreateWorkerPaymentInput): Promise<WorkerPayment> {
  return createWorkerPaymentWithClient(client(), input);
}

export async function getWorkerPayments(filters?: {
  workerId?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<WorkerPayment[]> {
  const c = client();
  async function runSelect(cols: string) {
    let q = c.from("worker_payments").select(cols).order("created_at", { ascending: false });
    if (filters?.workerId) q = q.eq("worker_id", filters.workerId);
    // worker_payments has no project_id — ignore projectId filter.
    if (filters?.fromDate) q = q.gte("created_at", `${filters.fromDate}T00:00:00.000Z`);
    if (filters?.toDate) q = q.lte("created_at", `${filters.toDate}T23:59:59.999Z`);
    if (filters?.limit) q = q.limit(Math.max(1, Math.min(filters.limit, 500)));
    return q;
  }
  let res = await runSelect(COLS);
  if (res.error && /labor_entry_ids|schema cache/i.test(res.error.message ?? "")) {
    res = await runSelect(COLS_BASE);
  }
  const { data, error } = res;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load worker payments.");
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerPaymentById(id: string): Promise<WorkerPayment | null> {
  const c = client();
  let { data, error } = await c.from("worker_payments").select(COLS).eq("id", id).maybeSingle();
  if (error && /labor_entry_ids|schema cache/i.test(error.message ?? "")) {
    ({ data, error } = await c.from("worker_payments").select(COLS_BASE).eq("id", id).maybeSingle());
  }
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load worker payment.");
  }
  return data ? fromRow(data as Record<string, unknown>) : null;
}

