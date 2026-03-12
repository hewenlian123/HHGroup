/**
 * Worker reimbursements: amount, description, receipt, status.
 * Schema: id, worker_id, project_id, amount, description, receipt_url, status, created_at.
 */

import { supabase } from "@/lib/supabase";

export type WorkerReimbursement = {
  id: string;
  workerId: string;
  projectId: string | null;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
  status: string;
  createdAt: string;
};

export type WorkerReimbursementDraft = {
  workerId: string;
  projectId: string | null;
  amount: number;
  description?: string | null;
  receiptUrl?: string | null;
  status?: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

const TABLE_NAME = "worker_reimbursements";
const TABLE_MISSING_MESSAGE =
  "未找到 worker_reimbursements 表。请运行 Supabase 迁移（如 supabase db push），然后在 Project Settings → API 中重新加载 schema 缓存。";

function isTableMissingError(error: { message?: string; code?: string }): boolean {
  const msg = error?.message ?? "";
  return msg.includes(TABLE_NAME) && (msg.includes("schema cache") || error?.code === "PGRST205");
}

const COLS = "id, worker_id, project_id, amount, description, receipt_url, status, created_at";

function fromRow(r: Record<string, unknown>): WorkerReimbursement {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    projectId: (r.project_id as string | null) ?? null,
    amount: Number(r.amount) || 0,
    description: (r.description as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    status: (r.status as string) ?? "pending",
    createdAt: r.created_at as string,
  };
}

export async function getWorkerReimbursements(): Promise<WorkerReimbursement[]> {
  const { data, error } = await client()
    .from("worker_reimbursements")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load worker reimbursements.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function insertWorkerReimbursement(
  draft: WorkerReimbursementDraft
): Promise<WorkerReimbursement> {
  const { data, error } = await client()
    .from("worker_reimbursements")
    .insert({
      worker_id: draft.workerId,
      project_id: draft.projectId,
      amount: draft.amount,
      description: draft.description?.trim() || null,
      receipt_url: draft.receiptUrl?.trim() || null,
      status: draft.status ?? "pending",
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
  if (draft.projectId !== undefined) payload.project_id = draft.projectId;
  if (draft.amount != null) payload.amount = draft.amount;
  if (draft.description !== undefined) payload.description = draft.description?.trim() || null;
  if (draft.receiptUrl !== undefined) payload.receipt_url = draft.receiptUrl?.trim() || null;
  if (draft.status != null) payload.status = draft.status;
  const { data, error } = await client()
    .from("worker_reimbursements")
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

export async function deleteWorkerReimbursement(id: string): Promise<void> {
  const { error } = await client().from("worker_reimbursements").delete().eq("id", id);
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to delete reimbursement.");
  }
}

export async function markWorkerReimbursementsPaid(workerId: string, projectId?: string | null): Promise<number> {
  const c = client();
  let q = c
    .from("worker_reimbursements")
    .update({ status: "paid" })
    .eq("worker_id", workerId)
    .neq("status", "paid");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.select("id");
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to mark reimbursements paid.");
  }
  return Array.isArray(data) ? data.length : 0;
}
