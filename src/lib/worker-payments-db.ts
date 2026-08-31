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
  /** Calendar date for display / receipt sequencing (payment_date, fallback created_at). */
  paymentDate: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
  /** Denormalized labor_entries.id[] settled by this payment (audit / receipt). */
  laborEntryIds: string[] | null;
  idempotencyKey?: string | null;
};

export type CreateWorkerPaymentInput = {
  workerId: string;
  /** Ignored at insert — column removed from worker_payments. */
  projectId?: string | null;
  /** Persisted to worker_payments.payment_date when available; falls back to created_at. */
  paymentDate?: string;
  amount: number;
  paymentMethod: string;
  notes?: string | null;
  idempotencyKey?: string | null;
  /** Exact pending advances to settle inside the payroll RPC. */
  advanceIds?: string[];
  advanceDeductionAmount?: number;
};

export type RecordWorkerPayrollSettlementInput = {
  idempotencyKey: string;
  workerId: string;
  projectId?: string | null;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  notes?: string | null;
  laborEntryIds: string[];
  reimbursementIds: string[];
  advanceIds: string[];
  advanceDeductionAmount: number;
};

export type AtomicWorkerPayrollSettlementResult = {
  payment: WorkerPayment;
  reused: boolean;
};

export type WorkerPayrollSettlementReplaySelection = {
  paymentDate: string;
  laborEntryIds: string[];
  reimbursementIds: string[];
  advanceIds: string[];
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
 * Canonical shape (local / migrations): id, worker_id, total_amount, payment_method, note, payment_date, created_at [, labor_entry_ids].
 * Extra variants cover legacy or partial schemas without breaking the payments UI.
 */
const WORKER_PAYMENTS_SELECT_VARIANTS = [
  "id, worker_id, total_amount, payment_method, note, payment_date, created_at, labor_entry_ids",
  "id, worker_id, total_amount, payment_method, note, payment_date, created_at",
  "id, worker_id, amount, payment_method, note, payment_date, created_at",
  "id, worker_id, total_amount, payment_method, notes, payment_date, created_at",
  "id, worker_id, amount, payment_method, notes, payment_date, created_at",
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

function normalizePaymentDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function fromRow(r: Record<string, unknown>): WorkerPayment {
  const createdAt = (r.created_at as string) ?? "";
  const paymentDate = normalizePaymentDate((r.payment_date as string | null) ?? null);
  return {
    id: (r.id as string) ?? "",
    workerId: (r.worker_id as string) ?? "",
    projectId: null,
    paymentDate: paymentDate ?? createdAt.slice(0, 10),
    amount: Number(r.total_amount ?? r.amount) || 0,
    paymentMethod: (r.payment_method as string | null) ?? null,
    notes: ((r.note ?? r.notes) as string | null) ?? null,
    createdAt,
    laborEntryIds: parseLaborEntryIds(r.labor_entry_ids),
    idempotencyKey: (r.idempotency_key as string | null) ?? null,
  };
}

export async function recordWorkerPayrollSettlementWithClient(
  c: SupabaseClient,
  input: RecordWorkerPayrollSettlementInput
): Promise<AtomicWorkerPayrollSettlementResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new Error("Payroll idempotency key is required.");

  const { data, error } = await c.rpc("record_worker_payroll_settlement", {
    p_idempotency_key: idempotencyKey,
    p_worker_id: input.workerId,
    p_project_id: input.projectId ?? null,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_date: input.paymentDate.slice(0, 10),
    p_notes: input.notes ?? null,
    p_labor_entry_ids: input.laborEntryIds,
    p_reimbursement_ids: input.reimbursementIds,
    p_advance_ids: input.advanceIds,
    p_advance_deduction_amount: input.advanceDeductionAmount,
  });
  if (error) {
    const failure = new Error(error.message ?? "Failed to record payroll settlement atomically.");
    Object.assign(failure, { code: error.code });
    throw failure;
  }

  const result = data as { payment_id?: unknown; reused?: unknown } | null;
  const paymentId = String(result?.payment_id ?? "");
  if (!paymentId) throw new Error("Atomic payroll RPC returned no payment id.");

  const { data: paymentRow, error: paymentError } = await c
    .from("worker_payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (paymentError || !paymentRow) {
    throw new Error(paymentError?.message ?? "Payroll settled, but payment could not be reloaded.");
  }
  return {
    payment: fromRow(paymentRow as Record<string, unknown>),
    reused: result?.reused === true,
  };
}

function metadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

/**
 * Loads only the canonical item selection needed to re-enter the atomic RPC.
 * The caller must never treat this lookup as success: the RPC revalidates the
 * fingerprint, completion marker, and every persisted settlement link.
 */
export async function getWorkerPayrollSettlementReplaySelectionWithClient(
  c: SupabaseClient,
  idempotencyKey: string
): Promise<WorkerPayrollSettlementReplaySelection | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  const { data, error } = await c
    .from("worker_payments")
    .select("payment_date, labor_entry_ids, settlement_metadata")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) {
    const failure = new Error(error.message ?? "Failed to load payroll retry state.");
    Object.assign(failure, { code: error.code });
    throw failure;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const metadata =
    row.settlement_metadata &&
    typeof row.settlement_metadata === "object" &&
    !Array.isArray(row.settlement_metadata)
      ? (row.settlement_metadata as Record<string, unknown>)
      : {};
  const paymentDate = normalizePaymentDate(row.payment_date as string | null);
  if (!paymentDate) throw new Error("Existing payroll retry state has no canonical payment date.");

  return {
    paymentDate,
    laborEntryIds:
      parseLaborEntryIds(row.labor_entry_ids) ?? metadataStringArray(metadata, "labor_entry_ids"),
    reimbursementIds: metadataStringArray(metadata, "reimbursement_ids"),
    advanceIds: metadataStringArray(metadata, "advance_ids"),
  };
}

export async function getWorkerPaymentByIdempotencyKeyWithClient(
  c: SupabaseClient,
  idempotencyKey: string
): Promise<WorkerPayment | null | undefined> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  const { data, error } = await c
    .from("worker_payments")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (!error) return data ? fromRow(data as Record<string, unknown>) : null;
  if (isUnknownColumnError(error)) return undefined;
  if (isMissingTable(error))
    throw new Error("未找到 worker_payments 表。请先创建该表后再记录付款。");
  throw new Error(error.message ?? "Failed to load worker payment.");
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
  const paymentDate = normalizePaymentDate(input.paymentDate);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await getWorkerPaymentByIdempotencyKeyWithClient(c, idempotencyKey);
    if (existing) return existing;
  }

  type Row = Record<string, unknown>;
  const attempts: Row[] = [];
  const pushAttempts = (includeIdempotencyKey: boolean, includePaymentDate: boolean) => {
    for (const totalField of ["total_amount", "amount"] as const) {
      const base: Row = { worker_id: input.workerId, payment_method: method, [totalField]: amt };
      if (includePaymentDate && paymentDate) base.payment_date = paymentDate;
      if (includeIdempotencyKey && idempotencyKey) base.idempotency_key = idempotencyKey;
      if (trimmedNote) {
        attempts.push({ ...base, note: trimmedNote });
        attempts.push({ ...base, notes: trimmedNote });
      }
      attempts.push(base);
    }
  };
  const includeIdempotencyKey = Boolean(idempotencyKey);
  const paymentDateModes = paymentDate ? [true, false] : [false];
  for (const includePaymentDate of paymentDateModes) {
    pushAttempts(includeIdempotencyKey, includePaymentDate);
  }

  let lastError: { message?: string } | null = null;
  for (const payload of attempts) {
    const { data, error } = await c.from("worker_payments").insert(payload).select("*").single();
    if (!error && data) return fromRow(data as Record<string, unknown>);
    lastError = error;
    if (
      idempotencyKey &&
      error &&
      (/duplicate key|unique/i.test(error.message ?? "") || error.code === "23505")
    ) {
      const existing = await getWorkerPaymentByIdempotencyKeyWithClient(c, idempotencyKey);
      if (existing) return existing;
    }
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

export async function getWorkerPaymentsWithClient(
  c: SupabaseClient,
  filters?: {
    workerId?: string;
    projectId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }
): Promise<WorkerPayment[]> {
  async function runSelect(cols: (typeof WORKER_PAYMENTS_SELECT_VARIANTS)[number]) {
    const dateColumn = cols.includes("payment_date") ? "payment_date" : "created_at";
    // Dynamic column lists for schema variants — not representable in generated Supabase types.
    let q = c
      .from("worker_payments")
      .select(cols as never)
      .order(dateColumn, { ascending: false });
    if (filters?.workerId) q = q.eq("worker_id", filters.workerId);
    // worker_payments has no project_id — ignore projectId filter.
    if (filters?.fromDate) {
      q =
        dateColumn === "payment_date"
          ? q.gte(dateColumn, filters.fromDate.slice(0, 10))
          : q.gte(dateColumn, `${filters.fromDate.slice(0, 10)}T00:00:00.000Z`);
    }
    if (filters?.toDate) {
      q =
        dateColumn === "payment_date"
          ? q.lte(dateColumn, filters.toDate.slice(0, 10))
          : q.lte(dateColumn, `${filters.toDate.slice(0, 10)}T23:59:59.999Z`);
    }
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

export async function getWorkerPayments(filters?: {
  workerId?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<WorkerPayment[]> {
  return getWorkerPaymentsWithClient(client(), filters);
}

export async function getWorkerPaymentByIdWithClient(
  c: SupabaseClient,
  id: string
): Promise<WorkerPayment | null> {
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

export async function getWorkerPaymentById(id: string): Promise<WorkerPayment | null> {
  return getWorkerPaymentByIdWithClient(client(), id);
}
