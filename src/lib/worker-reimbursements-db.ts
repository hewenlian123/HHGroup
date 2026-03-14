/**
 * Worker reimbursements: construction finance module.
 * Tables: worker_reimbursements (id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at),
 *         worker_reimbursement_payments (id, worker_id, amount, method, note, created_at).
 * Status: pending | paid.
 */

import { supabase } from "@/lib/supabase";

export type WorkerReimbursementStatus = "pending" | "paid";

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

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const TABLE_NAME = "worker_reimbursements";
const PAYMENTS_TABLE = "worker_reimbursement_payments";
const WORKER_PAYMENTS_TABLE = "worker_payments";
const TABLE_MISSING_MESSAGE =
  "未找到 worker_reimbursements 表。请运行 Supabase 迁移（如 supabase db push），然后在 Project Settings → API 中重新加载 schema 缓存。";

function isTableMissingError(error: { message?: string; code?: string }): boolean {
  const msg = error?.message ?? "";
  return (msg.includes(TABLE_NAME) || msg.includes(PAYMENTS_TABLE)) && (msg.includes("schema cache") || error?.code === "PGRST205");
}

const COLS = "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at, payment_id";
/** Fallback when payment_id column does not exist */
const COLS_MINIMAL = "id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at";

async function enrichNames(rows: WorkerReimbursement[]): Promise<WorkerReimbursement[]> {
  const c = client();
  const workerIds = Array.from(new Set(rows.map((r) => r.workerId).filter(Boolean))) as string[];
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter(Boolean))) as string[];

  const [workersRes, projectsRes] = await Promise.all([
    workerIds.length ? c.from("workers").select("id, name").in("id", workerIds) : Promise.resolve({ data: [] as any[] }),
    projectIds.length ? c.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] as any[] }),
  ]);

  const workerNameById = new Map(((workersRes.data ?? []) as { id: string; name: string | null }[]).map((w) => [w.id, w.name ?? null]));
  const projectNameById = new Map(((projectsRes.data ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? null]));

  return rows.map((r) => ({
    ...r,
    workerName: r.workerName ?? workerNameById.get(r.workerId) ?? null,
    projectName: r.projectId ? (r.projectName ?? projectNameById.get(r.projectId) ?? null) : null,
  }));
}

function normaliseStatus(s: unknown): WorkerReimbursementStatus {
  const v = String(s ?? "").toLowerCase();
  if (v === "paid") return "paid";
  return "pending";
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
    createdAt: String(r.created_at ?? ""),
    paidAt: r.paid_at != null ? String(r.paid_at) : null,
    paymentId: (r.payment_id as string | null) ?? null,
  };
}

function isColumnMissingError(err: { message?: string }): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function getWorkerReimbursements(): Promise<WorkerReimbursement[]> {
  const c = client();
  let { data, error } = await c.from(TABLE_NAME).select(COLS).order("created_at", { ascending: false });
  if (error && isColumnMissingError(error)) {
    const fallback = await c.from(TABLE_NAME).select(COLS_MINIMAL).order("created_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load worker reimbursements.");
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(fromRow);
  return enrichNames(rows);
}

/** Get a single reimbursement by id. Returns null if not found. */
export async function getReimbursementById(reimbursementId: string): Promise<WorkerReimbursement | null> {
  const c = client();
  let { data, error } = await c.from(TABLE_NAME).select(COLS).eq("id", reimbursementId).maybeSingle();
  if (error && isColumnMissingError(error)) {
    const fallback = await c.from(TABLE_NAME).select(COLS_MINIMAL).eq("id", reimbursementId).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load reimbursement.");
  }
  if (!data) return null;
  return (await enrichNames([fromRow(data as Record<string, unknown>)]))[0] ?? null;
}

export async function getWorkerReimbursementsByWorkerId(workerId: string): Promise<WorkerReimbursement[]> {
  const c = client();
  let { data, error } = await c.from(TABLE_NAME).select(COLS).eq("worker_id", workerId).order("created_at", { ascending: false });
  if (error && isColumnMissingError(error)) {
    const fallback = await c.from(TABLE_NAME).select(COLS_MINIMAL).eq("worker_id", workerId).order("created_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load reimbursements.");
  }
  const rows = ((data ?? []) as Record<string, unknown>[]).map(fromRow);
  return enrichNames(rows);
}

export async function insertWorkerReimbursement(draft: WorkerReimbursementDraft): Promise<WorkerReimbursement> {
  const { data, error } = await client()
    .from(TABLE_NAME)
    .insert({
      worker_id: draft.workerId,
      project_id: draft.projectId ?? null,
      vendor: draft.vendor?.trim() || null,
      amount: draft.amount,
      description: draft.description?.trim() || null,
      receipt_url: draft.receiptUrl?.trim() || null,
      status: (draft.status as string) ?? "pending",
    })
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to create reimbursement.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function updateWorkerReimbursement(
  id: string,
  draft: Partial<WorkerReimbursementDraft>
): Promise<WorkerReimbursement> {
  const payload: Record<string, unknown> = {};
  if (draft.workerId != null) payload.worker_id = draft.workerId;
  if (draft.projectId !== undefined) payload.project_id = draft.projectId ?? null;
  if (draft.vendor !== undefined) payload.vendor = draft.vendor?.trim() || null;
  if (draft.amount != null) payload.amount = draft.amount;
  if (draft.description !== undefined) payload.description = draft.description?.trim() || null;
  if (draft.receiptUrl !== undefined) payload.receipt_url = draft.receiptUrl?.trim() || null;
  if (draft.status != null) payload.status = draft.status;
  const { data, error } = await client()
    .from(TABLE_NAME)
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to update reimbursement.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function approveWorkerReimbursement(id: string): Promise<WorkerReimbursement> {
  const { data, error } = await client()
    .from(TABLE_NAME)
    .update({ status: "approved" })
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to approve reimbursement.");
  }
  return fromRow(data as Record<string, unknown>);
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

export async function getWorkerReimbursementPayments(workerId: string): Promise<WorkerReimbursementPayment[]> {
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
export async function markReimbursementPaid(reimbursementId: string): Promise<WorkerReimbursement> {
  const c = client();
  const payload = { status: "paid" as const, paid_at: new Date().toISOString() };
  let result = await c
    .from(TABLE_NAME)
    .update(payload)
    .eq("id", reimbursementId)
    .select(COLS)
    .maybeSingle();
  if (result.error && isColumnMissingError(result.error)) {
    result = await c
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", reimbursementId)
      .select(COLS_MINIMAL)
      .maybeSingle();
  }
  if (result.error) throw new Error(result.error.message ?? "Failed to update reimbursement.");
  if (result.data) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[reimbursement paid]", reimbursementId);
      console.log("[workflow test] reimbursement paid", { reimbursementId });
    }
    return (await enrichNames([fromRow(result.data as Record<string, unknown>)]))[0]!;
  }
  const { data: existing, error: fetchErr } = await c
    .from(TABLE_NAME)
    .select(COLS_MINIMAL)
    .eq("id", reimbursementId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load reimbursement.");
  if (existing) {
    const row = (await enrichNames([fromRow(existing as Record<string, unknown>)]))[0]!;
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
export async function createWorkerPayment(params: {
  workerId: string;
  totalAmount: number;
  paymentMethod?: string | null;
  note?: string | null;
}): Promise<WorkerPayment> {
  const { data, error } = await client()
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
  params: { paymentMethod?: string | null; note?: string | null }
): Promise<{ payment: WorkerPayment; updatedCount: number; reimbursements: WorkerReimbursement[] }> {
  if (reimbursementIds.length === 0) throw new Error("No reimbursements selected.");
  const c = client();

  const { data: rows, error: fetchErr } = await c
    .from(TABLE_NAME)
    .select("id, worker_id, amount, status")
    .in("id", reimbursementIds);
  if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load reimbursements.");
  const list = (rows ?? []) as { id: string; worker_id: string; amount: number; status: string }[];
  if (list.length !== reimbursementIds.length) throw new Error("One or more reimbursements not found.");
  const workerIds = new Set(list.map((r) => r.worker_id));
  if (workerIds.size > 1) throw new Error("All selected reimbursements must be for the same worker.");
  const workerId = list[0].worker_id;
  const notPending = list.filter((r) => r.status !== "pending");
  if (notPending.length > 0) throw new Error("All selected reimbursements must have status pending.");

  const totalAmount = list.reduce((s, r) => s + Number(r.amount) || 0, 0);
  const payment = await createWorkerPayment({
    workerId,
    totalAmount,
    paymentMethod: params.paymentMethod,
    note: params.note,
  });

  const { data: updated, error: updateErr } = await c
    .from(TABLE_NAME)
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_id: payment.id,
    })
    .in("id", reimbursementIds)
    .select("id");
  if (updateErr) throw new Error(updateErr.message ?? "Failed to update reimbursements.");
  const updatedCount = Array.isArray(updated) ? updated.length : 0;
  const { data: reimbRows } = await c
    .from(TABLE_NAME)
    .select(COLS)
    .in("id", reimbursementIds);
  const reimbursements = await enrichNames(((reimbRows ?? []) as Record<string, unknown>[]).map(fromRow));
  return { payment, updatedCount, reimbursements };
}

export async function markWorkerReimbursementsPaid(workerId: string, projectId?: string | null): Promise<number> {
  const c = client();
  let q = c
    .from(TABLE_NAME)
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("worker_id", workerId)
    .eq("status", "pending");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.select("id");
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to mark reimbursements paid.");
  }
  return Array.isArray(data) ? data.length : 0;
}

export type WorkerBalanceRow = {
  workerId: string;
  workerName: string | null;
  pendingAmount: number;
  approvedAmount: number;
  paidAmount: number;
  balance: number;
};

export async function getWorkerReimbursementBalances(): Promise<WorkerBalanceRow[]> {
  const [reimbursements, payments, workers] = await Promise.all([
    getWorkerReimbursements(),
    (async () => {
      const { data, error } = await client()
        .from(PAYMENTS_TABLE)
        .select("worker_id, amount");
      if (error) return [] as { worker_id: string; amount: number }[];
      return (data ?? []) as { worker_id: string; amount: number }[];
    })(),
    (async () => {
      const { data } = await client().from("workers").select("id, name");
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
