/**
 * Worker reimbursements: construction finance module.
 * Tables: worker_reimbursements (id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at, paid_at),
 *         worker_reimbursement_payments (id, worker_id, amount, method, note, created_at).
 * Status: pending | paid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { financialDataUnavailable } from "@/lib/financial-availability";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";

export type WorkerReimbursementStatus = "pending" | "approved" | "paid" | "settled";

export type WorkerReimbursement = {
  id: string;
  workerId: string | null;
  workerName?: string | null;
  projectId: string | null;
  projectName?: string | null;
  vendor: string | null;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  status: string | null;
  workflowClass: "canonical" | "LEGACY_UNVERIFIED";
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
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, reimbursement_date, created_at, paid_at, payment_id, source_worker_receipt_id, source_receipt:worker_receipts!worker_reimbursements_source_worker_receipt_id_fkey(id,canonical_ingested_at,reimbursement_id,worker_id,project_id,amount,status)";
/** Read-only shape before the canonical intake boundary migrations. */
const LEGACY_READ_COLS =
  "id, worker_id, project_id, vendor, amount, description, receipt_url, status, reimbursement_date, created_at, paid_at, payment_id";

function isMissingCanonicalReadSchema(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const message = `${error.message ?? ""} ${error.details ?? ""}`;
  return (
    ((error.code === "42703" || error.code === "PGRST204") &&
      /\b(canonical_ingested_at|source_worker_receipt_id)\b/.test(message)) ||
    (error.code === "PGRST200" &&
      /worker_reimbursements_source_worker_receipt_id_fkey/.test(message))
  );
}

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
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }>, error: null }),
    projectIds.length
      ? c.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }>, error: null }),
  ]);

  if (workersRes.error || projectsRes.error)
    throw new Error(
      workersRes.error?.message ??
        projectsRes.error?.message ??
        "Failed to load reimbursement names."
    );

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
    workerName: r.workerName ?? workerNameById.get(r.workerId ?? "") ?? null,
    projectName: r.projectId ? (r.projectName ?? projectNameById.get(r.projectId) ?? null) : null,
  }));
}

function reimbursementDateFromRow(r: Record<string, unknown>): string {
  const rd = r.reimbursement_date;
  if (typeof rd === "string" && /^\d{4}-\d{2}-\d{2}/.test(rd)) return rd.slice(0, 10);
  return String(r.created_at ?? "").slice(0, 10);
}

function fromRow(r: Record<string, unknown>): WorkerReimbursement {
  const source = r.source_receipt as Record<string, unknown> | null;
  const canonical = Boolean(
    source?.canonical_ingested_at &&
    source.status === "Approved" &&
    r.worker_id &&
    source.id === r.source_worker_receipt_id &&
    source.reimbursement_id === r.id &&
    source.worker_id === r.worker_id &&
    source.project_id === r.project_id &&
    Number.isFinite(Number(r.amount)) &&
    Number(r.amount) > 0 &&
    Number(source.amount) === Number(r.amount)
  );
  return {
    id: r.id as string,
    workerId: (r.worker_id as string | null) ?? null,
    workerName: null,
    projectId: (r.project_id as string | null) ?? null,
    projectName: null,
    vendor: (r.vendor as string | null) ?? null,
    amount: Number(r.amount) || 0,
    description: (r.description as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    status: r.status == null ? null : String(r.status),
    workflowClass: canonical ? "canonical" : "LEGACY_UNVERIFIED",
    reimbursementDate: reimbursementDateFromRow(r),
    createdAt: String(r.created_at ?? ""),
    paidAt: r.paid_at != null ? String(r.paid_at) : null,
    paymentId: (r.payment_id as string | null) ?? null,
  };
}

/**
 * Sum of worker reimbursements with status `approved` (approved but not yet marked paid).
 * Overlap with worker balance aggregates is possible when approved rows are also counted as open
 * reimbursements there. Read failures are unavailable, never a financial zero.
 */
export async function sumUnpaidApprovedWorkerReimbursements(
  explicitClient?: SupabaseClient
): Promise<number> {
  const c = client(explicitClient);
  const { data, error } = await c.from(TABLE_NAME).select("amount").eq("status", "approved");
  if (error) financialDataUnavailable("approved worker reimbursements", error);
  return (data ?? []).reduce((s, r) => s + Number((r as { amount?: number }).amount ?? 0), 0);
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
  if (error && isMissingCanonicalReadSchema(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(LEGACY_READ_COLS)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
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
  if (error && isMissingCanonicalReadSchema(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(LEGACY_READ_COLS)
      .eq("id", reimbursementId)
      .maybeSingle();
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
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
  if (error && isMissingCanonicalReadSchema(error)) {
    const fallback = await c
      .from(TABLE_NAME)
      .select(LEGACY_READ_COLS)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
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
  void draft;
  throw new Error("BLOCKED: obligations are created only by canonical Receipt approval.");
}

export async function updateWorkerReimbursement(
  id: string,
  draft: Partial<WorkerReimbursementDraft>,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement> {
  if (draft.status !== undefined)
    throw new Error("Edit cannot change reimbursement status. Continue to Payment.");
  void id;
  void explicitClient;
  throw new Error("BLOCKED: obligation edits require canonical workflow authority.");
}

export async function approveWorkerReimbursement(id: string): Promise<WorkerReimbursement> {
  void id;
  throw new Error(
    "Use Receipt approval or Continue to Payment; obligation approval is not a standalone action."
  );
}

export async function deleteWorkerReimbursement(id: string): Promise<void> {
  void id;
  throw new Error("BLOCKED: obligation deletion requires canonical workflow authority.");
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
  workerId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursementPayment[]> {
  const { data, error } = await client(explicitClient)
    .from(PAYMENTS_TABLE)
    .select(PAYMENT_COLS)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) {
    financialDataUnavailable("worker reimbursement payments", error);
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

/** Retained for compatibility; settlement belongs to the atomic payment workflow. */
export async function markReimbursementPaid(
  reimbursementId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReimbursement> {
  void reimbursementId;
  void explicitClient;
  throw new Error("Continue to Payment in Labor Reimbursements. A payment record is required.");
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
    .select("id, worker_id, amount, status")
    .in("id", ids);
  if (selectionError) {
    throw new Error(selectionError.message ?? "Failed to load reimbursements.");
  }
  const selectedRows = (selection ?? []) as Array<{
    id: string;
    worker_id: string;
    amount: number;
    status: string;
  }>;
  if (selectedRows.length !== ids.length) throw new Error("One or more reimbursements not found.");
  const workerIds = new Set(selectedRows.map((row) => row.worker_id));
  if (workerIds.size !== 1) {
    throw new Error("All selected reimbursements must be for the same worker.");
  }
  const workerId = selectedRows[0]!.worker_id;
  // Source authorization is enforced under row locks inside the payment RPC.
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
  const c = client(explicitClient);
  const results = await Promise.all([
    c
      .from(TABLE_NAME)
      .select("id, worker_id, project_id, source_worker_receipt_id, amount, status, payment_id", {
        count: "exact",
      }),
    c.from(WORKER_PAYMENTS_TABLE).select("id, worker_id, total_amount", { count: "exact" }),
    c
      .from("worker_receipts")
      .select(
        "id, canonical_ingested_at, reimbursement_id, worker_id, project_id, amount, status",
        { count: "exact" }
      ),
    c.from("workers").select("id, name", { count: "exact" }),
  ]);
  if (results.some((result) => result.error && isMissingCanonicalReadSchema(result.error))) {
    throw new Error(
      "Legacy / Unverified: balances are unavailable until canonical evidence can be verified. Historical rows remain available in the reimbursement list."
    );
  }
  for (const result of results) {
    if (result.error || !Array.isArray(result.data) || result.count !== result.data.length) {
      financialDataUnavailable(
        "reimbursement balances",
        result.error ?? new Error("Incomplete balance data.")
      );
    }
  }
  const reimbursements = results[0].data!;
  const payments = results[1].data!;
  const receipts = results[2].data!;
  const workers = results[3].data!;
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const workerById = new Map(workers.map((w) => [w.id, w.name]));
  const receiptById = new Map(receipts.map((r) => [r.id, r]));
  const byWorker = new Map<string, WorkerBalanceRow>();
  const allocatedByPayment = new Map<string, number>();
  for (const r of reimbursements) {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Invalid reimbursement amount; review history before calculating balances.");
    const receipt = receiptById.get(r.source_worker_receipt_id);
    if (
      !r.worker_id ||
      !receipt?.canonical_ingested_at ||
      receipt.status !== "Approved" ||
      receipt.reimbursement_id !== r.id ||
      receipt.worker_id !== r.worker_id ||
      receipt.project_id !== r.project_id ||
      Number(receipt.amount) !== amount
    ) {
      throw new Error(
        "LEGACY_UNVERIFIED: balance unavailable until historical obligation evidence is verified. Review the preserved reimbursement list."
      );
    }
    const row = byWorker.get(r.worker_id) ?? {
      workerId: r.worker_id,
      workerName: workerById.get(r.worker_id) ?? null,
      pendingAmount: 0,
      approvedAmount: 0,
      paidAmount: 0,
      balance: 0,
    };
    if (r.status === "pending" || r.status === "approved") {
      if (r.payment_id || receipt.status !== "Approved") {
        throw new Error(
          "Reimbursement approval source is unresolved. Review legacy obligations before calculating balances."
        );
      }
      if (r.status === "pending") row.pendingAmount += amount;
      else row.approvedAmount += amount;
      row.balance += amount;
    } else if (r.status === "paid" || r.status === "settled") {
      const payment = paymentById.get(r.payment_id);
      if (
        !payment ||
        payment.worker_id !== r.worker_id ||
        !Number.isFinite(Number(payment.total_amount))
      )
        throw new Error("Paid reimbursement has no valid payment record.");
      const allocated = (allocatedByPayment.get(payment.id) ?? 0) + amount;
      if (Math.round(allocated * 100) > Math.round(Number(payment.total_amount) * 100))
        throw new Error("Reimbursements exceed the linked payment.");
      allocatedByPayment.set(payment.id, allocated);
      row.paidAmount += amount;
    } else {
      throw new Error("Unknown reimbursement status; balance unavailable.");
    }
    byWorker.set(row.workerId, row);
  }
  return [...byWorker.values()].sort((a, b) => b.balance - a.balance);
}
