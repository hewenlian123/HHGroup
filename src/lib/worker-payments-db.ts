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
  return (
    /schema cache|relation.*does not exist|could not find the table|table.*does not exist|pgrst205/i.test(
      m
    ) || err?.code === "PGRST205"
  );
}

/** PostgREST / schema-cache: unknown or wrong column name on insert. */
function isUnknownColumnError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return /could not find the .* column|column .* does not exist|schema cache|pgrst204/i.test(m);
}

function isRetryableWorkerPaymentsSelectError(err: { message?: string } | null): boolean {
  if (!err || isMissingTable(err)) return false;
  return isUnknownColumnError(err);
}

/**
 * Canonical shape (local / migrations): id, worker_id, total_amount, payment_method, note, created_at [, labor_entry_ids].
 * Extra variants cover legacy or partial schemas without breaking the payments UI.
 */
const WORKER_PAYMENTS_SELECT_VARIANTS = [
  // Start with minimal columns so missing note/notes won't break the page.
  "id, worker_id, total_amount, payment_method, created_at, labor_entry_ids",
  "id, worker_id, total_amount, payment_method, created_at",
  "id, worker_id, amount, payment_method, created_at",
  // Optional note columns (schema variants).
  "id, worker_id, total_amount, payment_method, note, created_at, labor_entry_ids",
  "id, worker_id, total_amount, payment_method, note, created_at",
  "id, worker_id, amount, payment_method, note, created_at",
  "id, worker_id, total_amount, payment_method, notes, created_at",
  "id, worker_id, amount, payment_method, notes, created_at",
] as const;

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

  const trimmedNote = input.notes?.trim() || null;

  type Row = Record<string, unknown>;
  const attempts: Row[] = [];
  for (const totalField of ["total_amount", "amount"] as const) {
    const base: Row = { worker_id: input.workerId, payment_method: method, [totalField]: amt };
    if (trimmedNote) {
      attempts.push({ ...base, note: trimmedNote });
      attempts.push({ ...base, notes: trimmedNote });
    }
    attempts.push(base);
  }

  let lastError: { message?: string } | null = null;
  for (const payload of attempts) {
    const { data, error } = await c.from("worker_payments").insert(payload).select("*").single();
    if (!error && data) return fromRow(data as Record<string, unknown>);
    lastError = error;
    if (error && isMissingTable(error)) {
      throw new Error("未找到 worker_payments 表。请先创建该表后再记录付款。");
    }
    if (error && !isUnknownColumnError(error)) {
      throw new Error(error.message ?? "Failed to create worker payment.");
    }
  }

  throw new Error(lastError?.message ?? "Failed to create worker payment.");
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
  async function runSelect(cols: (typeof WORKER_PAYMENTS_SELECT_VARIANTS)[number]) {
    // Dynamic column lists for schema variants — not representable in generated Supabase types.
    let q = c
      .from("worker_payments")
      .select(cols as never)
      .order("created_at", { ascending: false });
    if (filters?.workerId) q = q.eq("worker_id", filters.workerId);
    // worker_payments has no project_id — ignore projectId filter.
    if (filters?.fromDate) q = q.gte("created_at", `${filters.fromDate}T00:00:00.000Z`);
    if (filters?.toDate) q = q.lte("created_at", `${filters.toDate}T23:59:59.999Z`);
    if (filters?.limit) q = q.limit(Math.max(1, Math.min(filters.limit, 500)));
    return q;
  }

  let lastError: { message?: string } | null = null;
  for (const cols of WORKER_PAYMENTS_SELECT_VARIANTS) {
    const res = await runSelect(cols);
    if (!res.error) {
      return ((res.data ?? []) as unknown as Record<string, unknown>[]).map(fromRow);
    }
    lastError = res.error;
    if (isMissingTable(res.error)) return [];
    if (!isRetryableWorkerPaymentsSelectError(res.error)) {
      throw new Error(res.error.message ?? "Failed to load worker payments.");
    }
  }
  throw new Error(lastError?.message ?? "Failed to load worker payments.");
}

export async function getWorkerPaymentById(id: string): Promise<WorkerPayment | null> {
  const c = client();
  let lastError: { message?: string } | null = null;
  for (const cols of WORKER_PAYMENTS_SELECT_VARIANTS) {
    const { data, error } = await c
      .from("worker_payments")
      .select(cols as never)
      .eq("id", id)
      .maybeSingle();
    if (!error) {
      return data ? fromRow(data as unknown as Record<string, unknown>) : null;
    }
    lastError = error;
    if (isMissingTable(error)) return null;
    if (!isRetryableWorkerPaymentsSelectError(error)) {
      throw new Error(error.message ?? "Failed to load worker payment.");
    }
  }
  throw new Error(lastError?.message ?? "Failed to load worker payment.");
}
