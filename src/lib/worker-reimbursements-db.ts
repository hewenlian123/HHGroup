/**
 * Worker reimbursements: construction finance module.
 * Tables: worker_reimbursements (id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at),
 *         worker_reimbursement_payments (id, worker_id, amount, method, note, created_at).
 * Status: pending | paid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";

export type WorkerReimbursementStatus = "pending" | "approved" | "paid" | "settled";

export type WorkerReimbursement = {
  id: string;
  workerId: string;
  workerName?: string | null;
  projectId: string | null;
  projectName?: string | null;
  vendor: string | null;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  status: WorkerReimbursementStatus;
  /** Business date (YYYY-MM-DD); falls back to created_at date when column absent in DB. */
  reimbursementDate: string;
  createdAt: string;
  paidAt: string | null;
  paymentId?: string | null;
};

export type WorkerPayment = {
  id: string;
  workerId: string;
  totalAmount: number;
  paymentMethod: string | null;
  note: string | null;
  createdAt: string;
};

export type WorkerReimbursementDraft = {
  workerId: string;
  projectId: string | null;
  /** Required for new rows in UI; stored as reimbursement_date (date). */
  reimbursementDate?: string;
  vendor?: string | null;
  amount: number;
  description?: string | null;
  receiptUrl?: string | null;
  status?: WorkerReimbursementStatus;
};

export type WorkerReimbursementPayment = {
  id: string;
  workerId: string;
  amount: number;
  method: string | null;
  note: string | null;
  createdAt: string;
};

function client(explicitClient?: SupabaseClient) {
  const c = explicitClient ?? getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

const TABLE_NAME = "worker_reimbursements";
const PAYMENTS_TABLE = "worker_reimbursement_payments";
const WORKER_PAYMENTS_TABLE = "worker_payments";
const TABLE_MISSING_MESSAGE =
  "未找到 worker_reimbursements 表。请运行 Supabase 迁移（如 supabase db push），然后在 Project Settings → API 中重新加载 schema 缓存。";

function isTableMissingError(error: { message?: string; code?: string }): boolean {
  const msg = error?.message ?? "";
  return (
    (msg.includes(TABLE_NAME) || msg.includes(PAYMENTS_TABLE)) &&
    (msg.includes("schema cache") || error?.code === "PGRST205")
  );
}

const COLS =
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, reimbursement_date, created_at, paid_at, payment_id";
/** Oldest PostgREST shapes */
const COLS_LEGACY =
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at, payment_id";
const COLS_LEGACY_NO_PAY =
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at";

async function enrichNames(
  rows: WorkerReimbursement[],
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement[]> {
  const c = client(explicitClient);
  const workerIds = Array.from(new Set(rows.map((r) => r.workerId).filter(Boolean))) as string[];
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];

  const [workersRes, projectsRes] = await Promise.all([
    workerIds.length
      ? c.from("workers").select("id, name").in("id", workerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    projectIds.length
      ? c.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);

  const workerNameById = new Map(
    ((workersRes.data ?? []) as { id: string; name: string | null }[]).map((w) => [
      w.id,
      w.name ?? null,
    ])
  );
  const projectNameById = new Map(
    ((projectsRes.data ?? []) as { id: string; name: string | null }[]).map((p) => [
      p.id,
      p.name ?? null,
    ])
  );

  return rows.map((r) => ({
    ...r,
    workerName: r.workerName ?? workerNameById.get(r.workerId) ?? null,
    projectName: r.projectId ? (r.projectName ?? projectNameById.get(r.projectId) ?? null) : null,
  }));
}

function normaliseStatus(s: unknown): WorkerReimbursementStatus {
  const v = String(s ?? "").toLowerCase();
  if (v === "approved") return "approved";
  if (v === "paid") return "paid";
  if (v === "settled") return "settled";
  return "pending";
}

function reimbursementDateFromRow(r: Record<string, unknown>): string {
  const rd = r.reimbursement_date;
  if (typeof rd === "string" && /^\d{4}-\d{2}-\d{2}/.test(rd)) return rd.slice(0, 10);
  return String(r.created_at ?? "").slice(0, 10);
}

function fromRow(r: Record<string, unknown>): WorkerReimbursement {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    workerName: null,
    projectId: (r.project_id as string | null) ?? null,
    projectName: null,
    vendor: (r.vendor as string | null) ?? null,
    amount: Number(r.amount) || 0,
    description: (r.description as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    status: normaliseStatus(r.status),
    reimbursementDate: reimbursementDateFromRow(r),
    createdAt: String(r.created_at ?? ""),
    paidAt: r.paid_at != null ? String(r.paid_at) : null,
    paymentId: (r.payment_id as string | null) ?? null,
  };
}

function isColumnMissingError(err: { message?: string }): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

/**
 * Sum of worker reimbursements with status `approved` (approved but not yet marked paid).
 * Safe $0 if table missing or query fails. Overlap with worker balance aggregates is possible when
 * approved rows are also counted as open reimbursements there.
 */
export async function sumUnpaidApprovedWorkerReimbursements(): Promise<number> {
  try {
    const c = client();
    const { data, error } = await c.from(TABLE_NAME).select("amount").eq("status", "approved");
    if (error) {
      if (isTableMissingError(error)) return 0;
      return 0;
    }
    return (data ?? []).reduce((s, r) => s + Number((r as { amount?: number }).amount ?? 0), 0);
  } catch {
    return 0;
  }
}

/** Paid reimbursements allocated to a project. No matching rows contribute $0; failed reads reject. */
export async function sumPaidWorkerReimbursementsForProject(
  projectId: string,
  explicitClient?: SupabaseClient
): Promise<number> {
  const c = client(explicitClient);
  const { data, error } = await c
    .from(TABLE_NAME)
    .select("amount")
    .eq("project_id", projectId)
    .eq("status", "paid");
  if (error) {
    throw new Error(`Financial data unavailable: worker_reimbursements. ${error.message}`);
  }
  return (data ?? []).reduce((s, r) => s + Number((r as { amount?: unknown }).amount ?? 0), 0);
}

export async function getWorkerReimbursements(
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement[]> {
  const c = client(explicitClient);
  let { data, error } = await c
    .from(TABLE_NAME)
    .select(COLS)
    .order("reimbursement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error && isColumnMissingError(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error && isColumnMissingError(error)) {
    const fallback2 = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY_NO_PAY)
      .order("created_at", { ascending: false });
    data = fallback2.data as unknown as typeof data;
    error = fallback2.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load worker reimbursements.");
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(fromRow);
  return enrichNames(rows, explicitClient);
}

/** Get a single reimbursement by id. Returns null if not found. */
export async function getReimbursementById(
  reimbursementId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement | null> {
  const c = client(explicitClient);
  let { data, error } = await c
    .from(TABLE_NAME)
    .select(COLS)
    .eq("id", reimbursementId)
    .maybeSingle();
  if (error && isColumnMissingError(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY)
      .eq("id", reimbursementId)
      .maybeSingle();
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error && isColumnMissingError(error)) {
    const fallback2 = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY_NO_PAY)
      .eq("id", reimbursementId)
      .maybeSingle();
    data = fallback2.data as unknown as typeof data;
    error = fallback2.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load reimbursement.");
  }
  if (!data) return null;
  return (await enrichNames([fromRow(data as Record<string, unknown>)], explicitClient))[0] ?? null;
}

export async function getWorkerReimbursementsByWorkerId(
  workerId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement[]> {
  const c = client(explicitClient);
  let { data, error } = await c
    .from(TABLE_NAME)
    .select(COLS)
    .eq("worker_id", workerId)
    .order("reimbursement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error && isColumnMissingError(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error && isColumnMissingError(error)) {
    const fallback2 = await c
      .from(TABLE_NAME)
      .select(COLS_LEGACY_NO_PAY)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });
    data = fallback2.data as unknown as typeof data;
    error = fallback2.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load reimbursements.");
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(fromRow);
  return enrichNames(rows, explicitClient);
}

export async function insertWorkerReimbursement(
  draft: WorkerReimbursementDraft
): Promise<WorkerReimbursement> {
  const dateStr = draft.reimbursementDate?.trim().slice(0, 10) || workerRateLocalYmd();
  const baseInsert: Record<string, unknown> = {
    worker_id: draft.workerId,
    project_id: draft.projectId ?? null,
    vendor: draft.vendor?.trim() || null,
    amount: draft.amount,
    description: draft.description?.trim() || null,
    receipt_url: draft.receiptUrl?.trim() || null,
    status: (draft.status as string) ?? "pending",
  };
  let res = await client()
    .from(TABLE_NAME)
    .insert({ ...baseInsert, reimbursement_date: dateStr })
    .select(COLS)
    .single();
  if (res.error && isColumnMissingError(res.error)) {
    res = await client().from(TABLE_NAME).insert(baseInsert).select(COLS_LEGACY).single();
  }
  if (res.error && isColumnMissingError(res.error)) {
    res = await client().from(TABLE_NAME).insert(baseInsert).select(COLS_LEGACY_NO_PAY).single();
  }
  if (res.error) {
    if (isTableMissingError(res.error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(res.error.message ?? "Failed to create reimbursement.");
  }
  return fromRow(res.data as Record<string, unknown>);
}

export async function updateWorkerReimbursement(
  id: string,
  draft: Partial<WorkerReimbursementDraft>,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement> {
  const c = client(explicitClient);
  const payload: Record<string, unknown> = {};
  if (draft.workerId != null) payload.worker_id = draft.workerId;
  if (draft.projectId !== undefined) payload.project_id = draft.projectId ?? null;
  if (draft.vendor !== undefined) payload.vendor = draft.vendor?.trim() || null;
  if (draft.amount != null) payload.amount = draft.amount;
  if (draft.description !== undefined) payload.description = draft.description?.trim() || null;
  if (draft.receiptUrl !== undefined) payload.receipt_url = draft.receiptUrl?.trim() || null;
  if (draft.status != null) payload.status = draft.status;
  if (draft.reimbursementDate !== undefined) {
    const d = draft.reimbursementDate.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) payload.reimbursement_date = d;
  }
  let res = await c.from(TABLE_NAME).update(payload).eq("id", id).select(COLS).single();
  if (res.error && isColumnMissingError(res.error)) {
    res = await c.from(TABLE_NAME).update(payload).eq("id", id).select(COLS_LEGACY).single();
  }
  if (res.error && isColumnMissingError(res.error)) {
    res = await c.from(TABLE_NAME).update(payload).eq("id", id).select(COLS_LEGACY_NO_PAY).single();
  }
  if (res.error && isColumnMissingError(res.error) && payload.reimbursement_date !== undefined) {
    const { reimbursement_date, ...rest } = payload;
    void reimbursement_date;
    res = await c.from(TABLE_NAME).update(rest).eq("id", id).select(COLS_LEGACY_NO_PAY).single();
  }
  if (res.error) {
    if (isTableMissingError(res.error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(res.error.message ?? "Failed to update reimbursement.");
  }
  return fromRow(res.data as Record<string, unknown>);
}

export async function approveWorkerReimbursement(id: string): Promise<WorkerReimbursement> {
  let res = await client()
    .from(TABLE_NAME)
    .update({ status: "approved" })
    .eq("id", id)
    .select(COLS)
    .single();
  if (res.error && isColumnMissingError(res.error)) {
    res = await client()
      .from(TABLE_NAME)
      .update({ status: "approved" })
      .eq("id", id)
      .select(COLS_LEGACY)
      .single();
  }
  if (res.error && isColumnMissingError(res.error)) {
    res = await client()
      .from(TABLE_NAME)
      .update({ status: "approved" })
      .eq("id", id)
      .select(COLS_LEGACY_NO_PAY)
      .single();
  }
  if (res.error) {
    if (isTableMissingError(res.error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(res.error.message ?? "Failed to approve reimbursement.");
  }
  return fromRow(res.data as Record<string, unknown>);
}

export async function deleteWorkerReimbursement(id: string): Promise<void> {
  const { error } = await client().from(TABLE_NAME).delete().eq("id", id);
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to delete reimbursement.");
  }
}

const PAYMENT_COLS = "id, worker_id, amount, method, note, created_at";

function paymentFromRow(r: Record<string, unknown>): WorkerReimbursementPayment {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    amount: Number(r.amount) || 0,
    method: (r.method as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

export async function getWorkerReimbursementPayments(
  workerId: string
): Promise<WorkerReimbursementPayment[]> {
  const { data, error } = await client()
    .from(PAYMENTS_TABLE)
    .select(PAYMENT_COLS)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isTableMissingError(error)) return [];
    throw new Error(error.message ?? "Failed to load payments.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(paymentFromRow);
}

export async function insertWorkerReimbursementPayment(params: {
  workerId: string;
  amount: number;
  method?: string | null;
  note?: string | null;
}): Promise<WorkerReimbursementPayment> {
  const { data, error } = await client()
    .from(PAYMENTS_TABLE)
    .insert({
      worker_id: params.workerId,
      amount: params.amount,
      method: params.method?.trim() || null,
      note: params.note?.trim() || null,
    })
    .select(PAYMENT_COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to record payment.");
  return paymentFromRow(data as Record<string, unknown>);
}

/**
 * Mark a reimbursement as paid: UPDATE worker_reimbursements SET status='paid', paid_at=now() WHERE id = reimbursementId.
 * Returns the updated row. Use after creating the expense so the workflow is: create expense → update status.
 */
export async function markReimbursementPaid(
  reimbursementId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement> {
  const c = client(explicitClient);
  const withPaidAt = { status: "paid" as const, paid_at: new Date().toISOString() };
  const statusOnly = { status: "paid" as const };
  let result = await c
    .from(TABLE_NAME)
    .update(withPaidAt)
    .eq("id", reimbursementId)
    .select(COLS)
    .maybeSingle();
  if (result.error && isColumnMissingError(result.error)) {
    result = await c
      .from(TABLE_NAME)
      .update(withPaidAt)
      .eq("id", reimbursementId)
      .select(COLS_LEGACY)
      .maybeSingle();
  }
  if (result.error && isColumnMissingError(result.error)) {
    result = await c
      .from(TABLE_NAME)
      .update(withPaidAt)
      .eq("id", reimbursementId)
      .select(COLS_LEGACY_NO_PAY)
      .maybeSingle();
  }
  if (result.error && isColumnMissingError(result.error)) {
    result = await c
      .from(TABLE_NAME)
      .update(statusOnly)
      .eq("id", reimbursementId)
      .select(COLS_LEGACY_NO_PAY)
      .maybeSingle();
  }
  if (result.error) throw new Error(result.error.message ?? "Failed to update reimbursement.");
  if (result.data) {
    return (
      await enrichNames([fromRow(result.data as Record<string, unknown>)], explicitClient)
    )[0]!;
  }
  const { data: existing, error: fetchErr } = await c
    .from(TABLE_NAME)
    .select(COLS_LEGACY)
    .eq("id", reimbursementId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load reimbursement.");
  if (existing) {
    const row = (
      await enrichNames([fromRow(existing as Record<string, unknown>)], explicitClient)
    )[0]!;
    if (row.status === "paid") return row;
  }
  throw new Error("Reimbursement not found.");
}

const WORKER_PAYMENT_COLS = "id, worker_id, total_amount, payment_method, note, created_at";

function workerPaymentFromRow(r: Record<string, unknown>): WorkerPayment {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    totalAmount: Number(r.total_amount) || 0,
    paymentMethod: (r.payment_method as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/**
 * Create a worker_payment row (batch payment). Does not update reimbursements.
 */
export async function createWorkerPayment(
  params: {
    workerId: string;
    totalAmount: number;
    paymentMethod?: string | null;
    note?: string | null;
  },
  explicitClient?: SupabaseClient
): Promise<WorkerPayment> {
  const { data, error } = await client(explicitClient)
    .from(WORKER_PAYMENTS_TABLE)
    .insert({
      worker_id: params.workerId,
      total_amount: params.totalAmount,
      payment_method: params.paymentMethod?.trim() || null,
      note: params.note?.trim() || null,
    })
    .select(WORKER_PAYMENT_COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to create worker payment.");
  return workerPaymentFromRow(data as Record<string, unknown>);
}

/**
 * Create a batch worker payment and mark the given reimbursements as paid (status=paid, paid_at, payment_id).
 * Reimbursements must be pending and belong to the same worker.
 */
export async function recordBatchReimbursementPayment(
  reimbursementIds: string[],
  params: { paymentMethod?: string | null; note?: string | null },
  explicitClient?: SupabaseClient
): Promise<{
  payment: WorkerPayment;
  updatedCount: number;
  reimbursements: WorkerReimbursement[];
}> {
  void reimbursementIds;
  void params;
  void explicitClient;
  throw new Error(
    "Non-atomic reimbursement payment path is disabled. Use the atomic reimbursement payment RPC."
  );
}

/**
 * Atomically creates one worker payment, links every reimbursement, and creates
 * each reimbursement expense + line. The database RPC owns the transaction and
 * validates idempotent replays before this helper reloads the completed result.
 */
export async function recordReimbursementPaymentAtomicWithClient(
  reimbursementIds: string[],
  params: {
    idempotencyKey: string;
    paymentMethod?: string | null;
    paymentDate?: string;
    note?: string | null;
  },
  explicitClient: SupabaseClient
): Promise<{
  payment: WorkerPayment;
  updatedCount: number;
  reimbursements: WorkerReimbursement[];
  expenseIds: string[];
  reused: boolean;
}> {
  const ids = [...new Set(reimbursementIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (ids.length === 0) throw new Error("No reimbursements selected.");
  if (ids.length !== reimbursementIds.length) {
    throw new Error("Reimbursement ids must be unique and non-empty.");
  }

  const { data: selection, error: selectionError } = await explicitClient
    .from(TABLE_NAME)
    .select("id, worker_id")
    .in("id", ids);
  if (selectionError) {
    throw new Error(selectionError.message ?? "Failed to load reimbursements.");
  }
  const selectedRows = (selection ?? []) as Array<{ id: string; worker_id: string }>;
  if (selectedRows.length !== ids.length) throw new Error("One or more reimbursements not found.");
  const workerIds = new Set(selectedRows.map((row) => row.worker_id));
  if (workerIds.size !== 1) {
    throw new Error("All selected reimbursements must be for the same worker.");
  }
  const workerId = selectedRows[0]!.worker_id;

  const { data, error } = await explicitClient.rpc("record_worker_reimbursement_payment_atomic", {
    p_idempotency_key: params.idempotencyKey,
    p_worker_id: workerId,
    p_payment_method: params.paymentMethod?.trim() || null,
    p_payment_date: (params.paymentDate ?? workerRateLocalYmd()).slice(0, 10),
    p_note: params.note?.trim() || null,
    p_reimbursement_ids: ids,
  });
  if (error) throw new Error(error.message ?? "Failed to record reimbursement payment.");

  const result = (data ?? {}) as {
    payment_id?: unknown;
    updated_count?: unknown;
    reused?: unknown;
  };
  const paymentId = String(result.payment_id ?? "");
  if (!paymentId) throw new Error("Atomic reimbursement payment returned no payment id.");

  const [paymentResult, reimbursementResult, expenseResult] = await Promise.all([
    explicitClient
      .from(WORKER_PAYMENTS_TABLE)
      .select(WORKER_PAYMENT_COLS)
      .eq("id", paymentId)
      .single(),
    explicitClient.from(TABLE_NAME).select(COLS).in("id", ids),
    explicitClient
      .from("expenses")
      .select("id, source_id")
      .eq("source", "worker_reimbursement")
      .in("source_id", ids),
  ]);
  if (paymentResult.error || !paymentResult.data) {
    throw new Error(
      paymentResult.error?.message ??
        "Atomic reimbursement payment completed but the payment could not be loaded."
    );
  }
  if (reimbursementResult.error) {
    throw new Error(
      reimbursementResult.error.message ??
        "Atomic reimbursement payment completed but reimbursements could not be loaded."
    );
  }
  if (expenseResult.error) {
    throw new Error(
      expenseResult.error.message ??
        "Atomic reimbursement payment completed but expenses could not be loaded."
    );
  }
  const reimbursements = await enrichNames(
    ((reimbursementResult.data ?? []) as Record<string, unknown>[]).map(fromRow),
    explicitClient
  );
  if (reimbursements.length !== ids.length) {
    throw new Error("Atomic reimbursement payment returned an incomplete reimbursement set.");
  }
  const expenseIdBySource = new Map(
    ((expenseResult.data ?? []) as Array<{ id: string; source_id: string }>).map((row) => [
      row.source_id,
      row.id,
    ])
  );
  const expenseIds = ids.map((id) => expenseIdBySource.get(id) ?? "");
  if (expenseIds.some((id) => !id) || expenseIdBySource.size !== ids.length) {
    throw new Error("Atomic reimbursement payment returned an incomplete expense set.");
  }

  return {
    payment: workerPaymentFromRow(paymentResult.data as Record<string, unknown>),
    updatedCount: Number(result.updated_count ?? ids.length),
    reimbursements,
    expenseIds,
    reused: result.reused === true,
  };
}

/**
 * Legacy helper used by payroll UI after recording a payment.
 * Reimbursements must be settled only via `worker_payments` (payment_id + paid status) in the pay API;
 * bulk-updating all pending rows without a payment link caused accounting inconsistencies.
 * @returns 0 — settlement is handled by POST /api/labor/workers/[id]/pay.
 */
export async function markWorkerReimbursementsPaid(
  workerId: string,
  projectId?: string | null
): Promise<number> {
  void workerId;
  void projectId;
  return 0;
}

export type WorkerBalanceRow = {
  workerId: string;
  workerName: string | null;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  balance: number;
};

export async function getWorkerReimbursementBalances(
  explicitClient?: SupabaseClient
): Promise<WorkerBalanceRow[]> {
  const [reimbursements, payments, workers] = await Promise.all([
    getWorkerReimbursements(explicitClient),
    (async () => {
      const { data, error } = await client(explicitClient)
        .from(PAYMENTS_TABLE)
        .select("worker_id, amount");
      if (error) return [] as { worker_id: string; amount: number }[];
      return (data ?? []) as { worker_id: string; amount: number }[];
    })(),
    (async () => {
      const { data } = await client(explicitClient).from("workers").select("id, name");
      return new Map(((data ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));
    })(),
  ]);

  const byWorker = new Map<
    string,
    { pending: number; paidReimb: number; payments: number; workerName: string | null }
  >();

  for (const r of reimbursements) {
    if (!byWorker.has(r.workerId)) {
      byWorker.set(r.workerId, {
        pending: 0,
        paidReimb: 0,
        payments: 0,
        workerName: r.workerName ?? workers.get(r.workerId) ?? null,
      });
    }
    const row = byWorker.get(r.workerId)!;
    if (r.status === "pending") row.pending += r.amount;
    else if (r.status === "paid") row.paidReimb += r.amount;
  }

  for (const p of payments) {
    const wid = p.worker_id;
    if (!byWorker.has(wid)) {
      byWorker.set(wid, {
        pending: 0,
        paidReimb: 0,
        payments: 0,
        workerName: workers.get(wid) ?? null,
      });
    }
    byWorker.get(wid)!.payments += Number(p.amount) || 0;
  }

  const result: WorkerBalanceRow[] = [];
  for (const [workerId, row] of Array.from(byWorker.entries())) {
    const balance = row.pending - row.payments;
    result.push({
      workerId,
      workerName: row.workerName,
      pendingAmount: row.pending,
      approvedAmount: 0,
      paidAmount: row.payments,
      balance,
    });
  }
  result.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return result;
}
