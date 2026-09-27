/**
 * Worker receipt uploads — pending approval; approved rows create worker_reimbursements.
 * Status: Pending | Approved | Rejected | Paid
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import type { WorkerReimbursement } from "./worker-reimbursements-db";

export const EXPENSE_TYPES = [
  "Building Materials",
  "Tools",
  "Food / Meal",
  "Transportation",
  "Supplies",
  "Equipment",
  "Other",
] as const;

export type WorkerReceiptStatus = "Pending" | "Approved" | "Rejected" | "Paid";

export type WorkerReceipt = {
  id: string;
  workerId: string | null;
  workerName: string;
  projectId: string | null;
  expenseType: string;
  vendor: string | null;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  notes: string | null;
  receiptDate: string | null;
  status: string | null;
  workflowClass: "canonical" | "LEGACY_UNVERIFIED";
  canonicalIngestedAt: string | null;
  rejectionReason: string | null;
  reimbursementId: string | null;
  createdAt: string;
};

export type WorkerReceiptWithNames = WorkerReceipt & {
  projectName: string;
};

const COLS =
  "id, worker_id, worker_name, project_id, expense_type, vendor, amount, description, receipt_url, notes, receipt_date, status, rejection_reason, reimbursement_id, canonical_ingested_at, created_at";

const LEGACY_READ_COLS = COLS.replace(", canonical_ingested_at", "");

function isMissingIntakeMarker(error: { code?: string; message?: string }): boolean {
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /\bcanonical_ingested_at\b/.test(error.message ?? "")
  );
}

function client(explicitClient?: SupabaseClient) {
  const c = explicitClient ?? getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

function fromRow(r: Record<string, unknown>): WorkerReceipt {
  const status = r.status == null ? null : String(r.status);
  return {
    id: String(r.id ?? ""),
    workerId: r.worker_id != null ? String(r.worker_id) : null,
    workerName: String(r.worker_name ?? "").trim() || "—",
    projectId: r.project_id != null ? String(r.project_id) : null,
    expenseType: String(r.expense_type ?? "Other"),
    vendor: r.vendor != null ? String(r.vendor) : null,
    amount: Number(r.amount) || 0,
    description: r.description != null ? String(r.description) : null,
    receiptUrl: r.receipt_url != null ? String(r.receipt_url) : null,
    notes: r.notes != null ? String(r.notes) : null,
    receiptDate: r.receipt_date != null ? String(r.receipt_date).slice(0, 10) : null,
    status,
    workflowClass: r.canonical_ingested_at ? "canonical" : "LEGACY_UNVERIFIED",
    canonicalIngestedAt: r.canonical_ingested_at == null ? null : String(r.canonical_ingested_at),
    rejectionReason: r.rejection_reason != null ? String(r.rejection_reason) : null,
    reimbursementId: r.reimbursement_id != null ? String(r.reimbursement_id) : null,
    createdAt: String(r.created_at ?? "").slice(0, 19),
  };
}

export async function getWorkerReceipts(explicitClient?: SupabaseClient): Promise<WorkerReceipt[]> {
  let { data, error } = await client(explicitClient)
    .from("worker_receipts")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error && isMissingIntakeMarker(error)) {
    const legacy = await client(explicitClient)
      .from("worker_receipts")
      .select(LEGACY_READ_COLS)
      .order("created_at", { ascending: false });
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) {
    if (/schema cache|does not exist|could not find the table/i.test(error.message ?? ""))
      throw new Error("worker_receipts table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to load worker receipts.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerReceiptById(
  id: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReceipt | null> {
  let { data, error } = await client(explicitClient)
    .from("worker_receipts")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingIntakeMarker(error)) {
    const legacy = await client(explicitClient)
      .from("worker_receipts")
      .select(LEGACY_READ_COLS)
      .eq("id", id)
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }
  if (error) throw new Error(error.message ?? "Failed to load receipt.");
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export type WorkerReceiptDraft = {
  workerId?: string | null;
  workerName: string;
  projectId: string | null;
  expenseType: string;
  vendor?: string | null;
  amount: number;
  description?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  receiptDate?: string | null;
  status?: WorkerReceiptStatus;
};

function buildInsertPayload(draft: WorkerReceiptDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    worker_name: draft.workerName.trim(),
    project_id: draft.projectId,
    expense_type: draft.expenseType.trim() || "Other",
    vendor: draft.vendor?.trim() || null,
    amount: draft.amount,
    description: draft.description?.trim() || null,
    receipt_url: draft.receiptUrl?.trim() || null,
    notes: draft.notes?.trim() || null,
    receipt_date: draft.receiptDate ?? null,
  };
  if (draft.workerId != null && draft.workerId !== "") payload.worker_id = draft.workerId;
  return payload;
}

/** Insert using a specific Supabase client (e.g. server client in API routes). */
export async function insertWorkerReceiptWithClient(
  c: SupabaseClient,
  draft: WorkerReceiptDraft
): Promise<WorkerReceipt> {
  const payload = buildInsertPayload(draft);
  const receiptId = draft.receiptUrl?.match(/^uploads\/([0-9a-f-]{36})\./i)?.[1];
  if (!receiptId) throw new Error("Canonical receipt upload identity is required.");
  const { data, error } = await c.rpc("intake_worker_receipt_atomic", {
    p_receipt_id: receiptId,
    p_payload: payload,
  });
  if (error) throw new Error(error.message ?? "Failed to create receipt upload.");
  if (!data?.id || !data?.canonical_ingested_at)
    throw new Error("Invalid canonical intake result.");
  return fromRow(data as Record<string, unknown>);
}

export async function insertWorkerReceipt(draft: WorkerReceiptDraft): Promise<WorkerReceipt> {
  return insertWorkerReceiptWithClient(client(), draft);
}

export async function updateWorkerReceiptStatus(
  id: string,
  patch: {
    status: WorkerReceiptStatus;
    rejectionReason?: string | null;
    reimbursementId?: string | null;
  },
  explicitClient?: SupabaseClient
): Promise<WorkerReceipt> {
  const current = await getWorkerReceiptById(id, explicitClient);
  if (current?.workflowClass !== "canonical")
    throw new Error("LEGACY_UNVERIFIED: Receipt mutation is blocked.");
  const payload: Record<string, unknown> = { status: patch.status };
  if (patch.rejectionReason !== undefined)
    payload.rejection_reason = patch.rejectionReason?.trim() || null;
  if (patch.reimbursementId !== undefined) payload.reimbursement_id = patch.reimbursementId;
  const { data, error } = await client(explicitClient)
    .from("worker_receipts")
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to update receipt.");
  return fromRow(data as Record<string, unknown>);
}

export async function deleteWorkerReceipt(id: string): Promise<void> {
  return deleteWorkerReceiptWithClient(client(), id);
}

/**
 * Delete a worker receipt using the given Supabase client (e.g. server client).
 * Verifies that exactly one row was deleted.
 */
export async function deleteWorkerReceiptWithClient(c: SupabaseClient, id: string): Promise<void> {
  const current = await getWorkerReceiptById(id, c);
  if (current?.workflowClass !== "canonical")
    throw new Error("LEGACY_UNVERIFIED: Receipt deletion is blocked.");
  const { data, error } = await c.from("worker_receipts").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message ?? "Failed to delete receipt.");
  if (!data?.length) throw new Error("Receipt not found or already deleted.");
}

export type ApproveReceiptResult = {
  receipt: WorkerReceipt;
  reimbursementCreated: WorkerReimbursement | null;
};

/** No browser-side approval writes; the authenticated server route owns actor identity. */
export async function approveWorkerReceipt(receiptId: string): Promise<ApproveReceiptResult> {
  void receiptId;
  throw new Error("Use the authenticated Worker Receipt approval route.");
}

/** The database owns approval, obligation creation, linkage and retry identity. */
export async function approveWorkerReceiptWithClient(
  c: SupabaseClient,
  receiptId: string,
  actorUserId?: string
): Promise<ApproveReceiptResult> {
  if (!actorUserId) throw new Error("Verified approval actor is required.");
  const { data: snapshot, error: readError } = await c
    .from("worker_receipts")
    .select("worker_id,amount,project_id,canonical_ingested_at")
    .eq("id", receiptId)
    .single();
  if (readError || !snapshot) throw new Error(readError?.message || "Receipt not found.");
  if (!snapshot.canonical_ingested_at)
    throw new Error("LEGACY_UNVERIFIED: Receipt approval is blocked.");
  const { data, error } = await c.rpc("approve_worker_receipt_atomic", {
    p_receipt_id: receiptId,
    p_actor_user_id: actorUserId,
    p_expected_worker_id: snapshot.worker_id,
    p_expected_amount: snapshot.amount,
    p_expected_project_id: snapshot.project_id,
  });
  if (error) throw new Error(error.message);
  if (!data?.receipt?.id || !data?.obligation?.id)
    throw new Error("Invalid atomic approval result.");
  const o = data.obligation;
  return {
    receipt: fromRow(data.receipt),
    reimbursementCreated: data.reused
      ? null
      : {
          id: o.id,
          workerId: o.worker_id,
          workerName: null,
          projectId: o.project_id,
          projectName: null,
          vendor: o.vendor,
          amount: Number(o.amount),
          description: o.description,
          receiptUrl: o.receipt_url,
          status: "pending",
          workflowClass: "canonical",
          reimbursementDate: o.reimbursement_date,
          createdAt: o.created_at,
          paidAt: o.paid_at,
          paymentId: o.payment_id,
        },
  };
}

/**
 * Reject: set status Rejected and optional reason.
 */
export async function rejectWorkerReceipt(
  receiptId: string,
  reason?: string | null,
  explicitClient?: SupabaseClient
): Promise<WorkerReceipt> {
  const receipt = await getWorkerReceiptById(receiptId, explicitClient);
  if (!receipt) throw new Error("Receipt not found.");
  return updateWorkerReceiptStatus(
    receiptId,
    {
      status: "Rejected",
      rejectionReason: reason ?? null,
    },
    explicitClient
  );
}

/** Reset unlinked receipts only; linked reimbursements require their settlement workflow. */
export async function resetWorkerReceiptToPending(
  receiptId: string,
  explicitClient?: SupabaseClient
): Promise<WorkerReceipt> {
  const { data, error } = await client(explicitClient)
    .from("worker_receipts")
    .update({ status: "Pending", rejection_reason: null })
    .eq("id", receiptId)
    .is("reimbursement_id", null)
    .not("canonical_ingested_at", "is", null)
    .in("status", ["Pending", "Rejected"])
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to reset receipt.");
  if (!data)
    throw new Error(
      "Receipt cannot be reset: approved, paid, or linked receipts must use their reimbursement workflow."
    );
  return fromRow(data as Record<string, unknown>);
}
