/**
 * Worker receipt uploads — pending approval; approved rows create worker_reimbursements.
 * Status: Pending | Approved | Rejected | Paid
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import * as workerReimbursementsDb from "./worker-reimbursements-db";
import type { WorkerReimbursement } from "./worker-reimbursements-db";
import * as laborDb from "./labor-db";
import * as projectsDb from "./projects-db";

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
  status: WorkerReceiptStatus;
  rejectionReason: string | null;
  reimbursementId: string | null;
  createdAt: string;
};

export type WorkerReceiptWithNames = WorkerReceipt & {
  projectName: string;
};

const COLS =
  "id, worker_id, worker_name, project_id, expense_type, vendor, amount, description, receipt_url, notes, receipt_date, status, rejection_reason, reimbursement_id, created_at";

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
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
    receiptDate: r.receipt_date != null ? String(r.receipt_date).slice(0, 10) : null,
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
    status: draft.status ?? "Pending",
  };
  if (draft.workerId != null && draft.workerId !== "") payload.worker_id = draft.workerId;
  return payload;
}

/** Insert using a specific Supabase client (e.g. server client in API routes). */
export async function insertWorkerReceiptWithClient(
  c: SupabaseClient,
  draft: WorkerReceiptDraft
): Promise<WorkerReceipt> {
  const insertPayload = buildInsertPayload(draft);
  const { data, error } = await c
    .from("worker_receipts")
    .insert(insertPayload)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message ?? "Failed to create receipt upload.");
  const receipt = fromRow(data as Record<string, unknown>);
  if (typeof console !== "undefined" && console.log) {
    console.log("[workflow test] receipt created", { id: receipt.id, workerId: draft.workerId, amount: draft.amount });
  }
  return receipt;
}

export async function insertWorkerReceipt(draft: WorkerReceiptDraft): Promise<WorkerReceipt> {
  const insertPayload = buildInsertPayload(draft);
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

export async function deleteWorkerReceipt(id: string): Promise<void> {
  const { error } = await client().from("worker_receipts").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Failed to delete receipt.");
}

/**
 * Delete a worker receipt using the given Supabase client (e.g. server client).
 * Verifies that exactly one row was deleted.
 */
export async function deleteWorkerReceiptWithClient(
  c: SupabaseClient,
  id: string
): Promise<void> {
  const { data, error } = await c
    .from("worker_receipts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message ?? "Failed to delete receipt.");
  if (!data?.length) throw new Error("Receipt not found or already deleted.");
}

/**
 * Resolve worker_id from receipt: use receipt.workerId if set, else find worker by worker_name.
 */
async function resolveWorkerId(receipt: WorkerReceipt): Promise<string> {
  if (receipt.workerId && receipt.workerId.trim() !== "") return receipt.workerId;
  const workers = await laborDb.getWorkers();
  const name = (receipt.workerName ?? "").trim();
  if (!name) throw new Error("Receipt has no worker; set worker or worker name.");
  const match = workers.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`Worker not found by name: ${name}`);
  return match.id;
}

/**
 * Resolve project_id for reimbursement: use only if the project exists (avoids FK violation).
 */
async function resolveProjectId(projectId: string | null): Promise<string | null> {
  if (!projectId || projectId.trim() === "") return null;
  const project = await projectsDb.getProjectById(projectId.trim());
  return project ? project.id : null;
}

export type ApproveReceiptResult = {
  receipt: WorkerReceipt;
  /** Set when a new reimbursement was created (not when receipt was already linked). */
  reimbursementCreated: WorkerReimbursement | null;
};

/**
 * Approve: set status Approved, create worker_reimbursement (Pending), link reimbursement_id.
 * Prevents duplicate reimbursements for the same receipt (skips create if already linked).
 */
export async function approveWorkerReceipt(receiptId: string): Promise<ApproveReceiptResult> {
  const receipt = await getWorkerReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");

  if (receipt.reimbursementId) {
    const updated = await updateWorkerReceiptStatus(receiptId, { status: "Approved" });
    return { receipt: updated, reimbursementCreated: null };
  }

  const workerId = await resolveWorkerId(receipt);
  const description = [receipt.vendor, receipt.expenseType].filter(Boolean).join(" · ") || receipt.description || null;
  const projectId = await resolveProjectId(receipt.projectId);

  const reimbursement = await workerReimbursementsDb.insertWorkerReimbursement({
    workerId,
    projectId,
    amount: receipt.amount,
    description,
    receiptUrl: receipt.receiptUrl,
    status: "pending",
  });

  const updated = await updateWorkerReceiptStatus(receiptId, {
    status: "Approved",
    reimbursementId: reimbursement.id,
  });
  return { receipt: updated, reimbursementCreated: reimbursement };
}

/**
 * Approve using an explicit Supabase client (server-side API routes).
 *
 * Required flow:
 * 1) Mark receipt status = Approved
 * 2) Create worker_reimbursements row (status=pending)
 * 3) Update receipt.reimbursement_id to link the reimbursement
 *
 * If reimbursement creation fails, revert receipt back to Pending.
 */
export async function approveWorkerReceiptWithClient(
  c: SupabaseClient,
  receiptId: string
): Promise<ApproveReceiptResult> {
  const { data: receiptRow, error: fetchErr } = await c
    .from("worker_receipts")
    .select(COLS)
    .eq("id", receiptId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message ?? "Failed to load receipt.");
  if (!receiptRow) throw new Error("Receipt not found.");
  const receipt = fromRow(receiptRow as Record<string, unknown>);

  // If already linked, just ensure status is Approved.
  if (receipt.reimbursementId) {
    const { data: updatedRow, error: updErr } = await c
      .from("worker_receipts")
      .update({ status: "Approved" })
      .eq("id", receiptId)
      .select(COLS)
      .single();
    if (updErr) throw new Error(updErr.message ?? "Failed to update receipt.");
    return { receipt: fromRow(updatedRow as Record<string, unknown>), reimbursementCreated: null };
  }

  // 1) Update receipt status first
  const { data: approvedRow, error: approveErr } = await c
    .from("worker_receipts")
    .update({ status: "Approved" })
    .eq("id", receiptId)
    .select(COLS)
    .single();
  if (approveErr) throw new Error(approveErr.message ?? "Failed to approve receipt.");
  const approvedReceipt = fromRow(approvedRow as Record<string, unknown>);

  try {
    // Resolve worker_id (prefer worker_id, fallback to worker_name)
    let workerId = approvedReceipt.workerId?.trim() || "";
    if (!workerId) {
      const name = (approvedReceipt.workerName ?? "").trim().toLowerCase();
      if (!name) throw new Error("Receipt has no worker; set worker or worker name.");
      const { data: workerRows, error: wErr } = await c.from("workers").select("id,name");
      if (wErr) throw new Error(wErr.message ?? "Failed to load workers.");
      const match = ((workerRows ?? []) as { id: string; name: string | null }[]).find(
        (w) => (w.name ?? "").trim().toLowerCase() === name
      );
      if (!match) throw new Error(`Worker not found by name: ${approvedReceipt.workerName}`);
      workerId = match.id;
    }

    // Resolve project_id (only if it exists)
    let projectId: string | null = approvedReceipt.projectId;
    if (projectId) {
      const { data: proj, error: pErr } = await c.from("projects").select("id").eq("id", projectId).maybeSingle();
      if (pErr) throw new Error(pErr.message ?? "Failed to validate project.");
      if (!proj) projectId = null;
    }

    // 2) Create reimbursement row (status=pending) with full fields
    const description =
      [approvedReceipt.vendor, approvedReceipt.expenseType].filter(Boolean).join(" · ") ||
      approvedReceipt.description ||
      null;
    const { data: reimbRow, error: rErr } = await c
      .from("worker_reimbursements")
      .insert({
        worker_id: workerId,
        project_id: projectId,
        vendor: approvedReceipt.vendor ?? null,
        amount: approvedReceipt.amount ?? 0,
        description,
        receipt_url: approvedReceipt.receiptUrl ?? null,
        status: "pending",
      })
      .select("id, worker_id, project_id, vendor, amount, description, receipt_url, status, created_at")
      .single();
    if (rErr) throw new Error(rErr.message ?? "Failed to create reimbursement.");

    const reimbursementCreated: WorkerReimbursement = {
      id: String((reimbRow as any).id),
      workerId: String((reimbRow as any).worker_id),
      workerName: null,
      projectId: (reimbRow as any).project_id != null ? String((reimbRow as any).project_id) : null,
      projectName: null,
      vendor: (reimbRow as any).vendor != null ? String((reimbRow as any).vendor) : null,
      amount: Number((reimbRow as any).amount) || 0,
      description: (reimbRow as any).description != null ? String((reimbRow as any).description) : null,
      receiptUrl: (reimbRow as any).receipt_url != null ? String((reimbRow as any).receipt_url) : null,
      status: "pending",
      createdAt: String((reimbRow as any).created_at ?? ""),
      paidAt: null,
      paymentId: null,
    };

    // 3) Link receipt to reimbursement
    const { data: linkedRow, error: linkErr } = await c
      .from("worker_receipts")
      .update({ reimbursement_id: reimbursementCreated.id })
      .eq("id", receiptId)
      .select(COLS)
      .single();
    if (linkErr) throw new Error(linkErr.message ?? "Failed to link reimbursement to receipt.");

    if (typeof console !== "undefined" && console.log) {
      console.log("[workflow test] reimbursement created", {
        id: reimbursementCreated.id,
        workerId: reimbursementCreated.workerId,
        amount: reimbursementCreated.amount,
        status: reimbursementCreated.status,
      });
    }
    return { receipt: fromRow(linkedRow as Record<string, unknown>), reimbursementCreated };
  } catch (e) {
    // Revert status back to Pending if reimbursement creation/linking fails
    await c.from("worker_receipts").update({ status: "Pending" }).eq("id", receiptId);
    throw e;
  }
}

/**
 * Reject: set status Rejected and optional reason.
 */
export async function rejectWorkerReceipt(receiptId: string, reason?: string | null): Promise<WorkerReceipt> {
  const receipt = await getWorkerReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  return updateWorkerReceiptStatus(receiptId, {
    status: "Rejected",
    rejectionReason: reason ?? null,
  });
}

/**
 * Reset to Pending: set status Pending and clear reimbursement_id.
 * Use so you can click Approve again to test reimbursement creation.
 */
export async function resetWorkerReceiptToPending(receiptId: string): Promise<WorkerReceipt> {
  const receipt = await getWorkerReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  return updateWorkerReceiptStatus(receiptId, {
    status: "Pending",
    reimbursementId: null,
  });
}
