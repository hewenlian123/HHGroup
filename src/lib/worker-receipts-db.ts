/**
 * Worker receipt uploads — pending approval; approved rows create worker_reimbursements.
 * Status: Pending | Approved | Rejected | Paid
 */

import { supabase } from "@/lib/supabase";
import * as workerReimbursementsDb from "./worker-reimbursements-db";
import * as laborDb from "./labor-db";

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
  status: WorkerReceiptStatus;
  rejectionReason: string | null;
  reimbursementId: string | null;
  createdAt: string;
};

export type WorkerReceiptWithNames = WorkerReceipt & {
  projectName: string;
};

const COLS =
  "id, worker_id, worker_name, project_id, expense_type, vendor, amount, description, receipt_url, notes, status, rejection_reason, reimbursement_id, created_at";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function fromRow(r: Record<string, unknown>): WorkerReceipt {
  const status = String(r.status ?? "Pending");
  const normalized: WorkerReceiptStatus =
    status === "Approved" || status === "Rejected" || status === "Paid" ? status : "Pending";
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
    status: normalized,
    rejectionReason: r.rejection_reason != null ? String(r.rejection_reason) : null,
    reimbursementId: r.reimbursement_id != null ? String(r.reimbursement_id) : null,
    createdAt: String(r.created_at ?? "").slice(0, 19),
  };
}

export async function getWorkerReceipts(): Promise<WorkerReceipt[]> {
  const { data, error } = await client()
    .from("worker_receipts")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) {
    if (/schema cache|does not exist|could not find the table/i.test(error.message ?? ""))
      throw new Error("worker_receipts table not found. Run migrations.");
    throw new Error(error.message ?? "Failed to load worker receipts.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerReceiptById(id: string): Promise<WorkerReceipt | null> {
  const { data, error } = await client()
    .from("worker_receipts")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load receipt.");
  if (!data) return null;
  return fromRow(data as Record<string, unknown>);
}

export async function insertWorkerReceipt(draft: {
  workerId?: string | null;
  workerName: string;
  projectId: string | null;
  expenseType: string;
  vendor?: string | null;
  amount: number;
  description?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  status?: WorkerReceiptStatus;
}): Promise<WorkerReceipt> {
  const insertPayload: Record<string, unknown> = {
    worker_name: draft.workerName.trim(),
    project_id: draft.projectId,
    expense_type: draft.expenseType.trim() || "Other",
    vendor: draft.vendor?.trim() || null,
    amount: draft.amount,
    description: draft.description?.trim() || null,
    receipt_url: draft.receiptUrl?.trim() || null,
    notes: draft.notes?.trim() || null,
    status: draft.status ?? "Pending",
  };
  if (draft.workerId != null && draft.workerId !== "") insertPayload.worker_id = draft.workerId;

  const { data, error } = await client()
    .from("worker_receipts")
    .insert(insertPayload)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to create receipt upload.");
  return fromRow(data as Record<string, unknown>);
}

export async function updateWorkerReceiptStatus(
  id: string,
  patch: { status: WorkerReceiptStatus; rejectionReason?: string | null; reimbursementId?: string | null }
): Promise<WorkerReceipt> {
  const payload: Record<string, unknown> = { status: patch.status };
  if (patch.rejectionReason !== undefined) payload.rejection_reason = patch.rejectionReason?.trim() || null;
  if (patch.reimbursementId !== undefined) payload.reimbursement_id = patch.reimbursementId;
  const { data, error } = await client()
    .from("worker_receipts")
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to update receipt.");
  return fromRow(data as Record<string, unknown>);
}

/**
 * Approve: set status Approved, create worker_reimbursement (Pending), link reimbursement_id.
 * Requires worker_id or resolvable worker by name.
 */
export async function approveWorkerReceipt(receiptId: string): Promise<WorkerReceipt> {
  const receipt = await getWorkerReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  if (receipt.status !== "Pending")
    throw new Error("Only Pending receipts can be approved.");

  let workerId = receipt.workerId;
  if (!workerId && receipt.workerName) {
    const workers = await laborDb.getWorkers();
    const match = workers.find((w) => w.name.toLowerCase() === receipt.workerName.toLowerCase());
    if (match) workerId = match.id;
  }
  if (!workerId) throw new Error("Cannot approve: link worker to reimbursement (missing worker).");

  const reimbursement = await workerReimbursementsDb.insertWorkerReimbursement({
    workerId,
    projectId: receipt.projectId,
    amount: receipt.amount,
    receiptUrl: receipt.receiptUrl,
    description:
      [receipt.expenseType, receipt.vendor, receipt.description, receipt.notes].filter(Boolean).join(" — ") || "From approved receipt upload",
    status: "Pending",
  });

  return updateWorkerReceiptStatus(receiptId, {
    status: "Approved",
    reimbursementId: reimbursement.id,
  });
}

/**
 * Reject: set status Rejected and optional reason.
 */
export async function rejectWorkerReceipt(receiptId: string, reason?: string | null): Promise<WorkerReceipt> {
  const receipt = await getWorkerReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  if (receipt.status !== "Pending") throw new Error("Only Pending receipts can be rejected.");
  return updateWorkerReceiptStatus(receiptId, {
    status: "Rejected",
    rejectionReason: reason ?? null,
  });
}
