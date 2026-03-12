/**
 * Worker payments: records payout events (admin pays worker).
 * Table: worker_payments.
 */

import { supabase } from "@/lib/supabase";

export type WorkerPayment = {
  id: string;
  workerId: string;
  projectId: string | null;
  paymentDate: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
};

export type CreateWorkerPaymentInput = {
  workerId: string;
  projectId?: string | null;
  paymentDate?: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: string;
  notes?: string | null;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function isMissingTable(err: { message?: string; code?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /schema cache|relation.*does not exist|could not find the table|table.*does not exist|pgrst205/i.test(m) || err?.code === "PGRST205";
}

const COLS = "id, worker_id, project_id, payment_date, amount, payment_method, notes, created_at";

function fromRow(r: Record<string, unknown>): WorkerPayment {
  return {
    id: (r.id as string) ?? "",
    workerId: (r.worker_id as string) ?? "",
    projectId: (r.project_id as string | null) ?? null,
    paymentDate: ((r.payment_date as string) ?? "").slice(0, 10),
    amount: Number(r.amount) || 0,
    paymentMethod: (r.payment_method as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function createWorkerPayment(input: CreateWorkerPaymentInput): Promise<WorkerPayment> {
  const c = client();
  const amt = Number(input.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be greater than 0.");
  const method = input.paymentMethod?.trim();
  if (!method) throw new Error("Payment method is required.");

  const payload = {
    worker_id: input.workerId,
    project_id: input.projectId ?? null,
    payment_date: (input.paymentDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
    amount: amt,
    payment_method: method,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await c.from("worker_payments").insert(payload).select(COLS).single();
  if (error) {
    if (isMissingTable(error)) throw new Error("未找到 worker_payments 表。请先创建该表后再记录付款。");
    throw new Error(error.message ?? "Failed to create worker payment.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function getWorkerPayments(filters?: {
  workerId?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<WorkerPayment[]> {
  const c = client();
  let q = c.from("worker_payments").select(COLS).order("payment_date", { ascending: false }).order("created_at", { ascending: false });
  if (filters?.workerId) q = q.eq("worker_id", filters.workerId);
  if (filters?.projectId) q = q.eq("project_id", filters.projectId);
  if (filters?.fromDate) q = q.gte("payment_date", filters.fromDate);
  if (filters?.toDate) q = q.lte("payment_date", filters.toDate);
  if (filters?.limit) q = q.limit(Math.max(1, Math.min(filters.limit, 500)));
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(error.message ?? "Failed to load worker payments.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerPaymentById(id: string): Promise<WorkerPayment | null> {
  const c = client();
  const { data, error } = await c.from("worker_payments").select(COLS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(error.message ?? "Failed to load worker payment.");
  }
  return data ? fromRow(data as Record<string, unknown>) : null;
}

export async function deleteWorkerPayment(id: string): Promise<void> {
  const c = client();
  const { error } = await c.from("worker_payments").delete().eq("id", id);
  if (error) {
    if (isMissingTable(error)) return;
    throw new Error(error.message ?? "Failed to delete worker payment.");
  }
}

