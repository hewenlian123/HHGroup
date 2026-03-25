/**
 * Worker invoices: amount, invoice_file, status (unpaid/paid).
 * Schema: id, worker_id, project_id, amount, invoice_file, status, created_at.
 */

import { getSupabaseClient } from "@/lib/supabase";

export type WorkerInvoiceStatus = "unpaid" | "paid";

export type WorkerInvoice = {
  id: string;
  workerId: string;
  projectId: string | null;
  amount: number;
  invoiceFile: string | null;
  status: WorkerInvoiceStatus;
  createdAt: string;
};

export type WorkerInvoiceDraft = {
  workerId: string;
  projectId: string | null;
  amount: number;
  invoiceFile?: string | null;
  status?: WorkerInvoiceStatus;
};

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error("Supabase is not configured.");
  return c;
}

const TABLE_NAME = "worker_invoices";
const TABLE_MISSING_MESSAGE =
  "未找到 worker_invoices 表。请运行 Supabase 迁移（如 supabase db push），然后在 Project Settings → API 中重新加载 schema 缓存。";

function isTableMissingError(error: { message?: string; code?: string }): boolean {
  const msg = error?.message ?? "";
  return msg.includes(TABLE_NAME) && (msg.includes("schema cache") || error?.code === "PGRST205");
}

const COLS = "id, worker_id, project_id, amount, invoice_file, status, created_at";

function fromRow(r: Record<string, unknown>): WorkerInvoice {
  const raw = String(r.status ?? "unpaid").toLowerCase();
  const status: WorkerInvoiceStatus = raw === "paid" ? "paid" : "unpaid";
  const file =
    (r.invoice_file as string | null) ?? (r.attachment_url as string | null) ?? null;
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    projectId: (r.project_id as string | null) ?? null,
    amount: Number(r.amount) || 0,
    invoiceFile: file,
    status,
    createdAt: r.created_at as string,
  };
}

function isInvoiceInsertFallback(err: { message?: string } | null | undefined): boolean {
  const m = err?.message ?? "";
  return (
    /invoice_number|null value|violates not-null|could not find the .* column|schema cache/i.test(m)
  );
}

export async function getWorkerInvoices(): Promise<WorkerInvoice[]> {
  const { data, error } = await client()
    .from("worker_invoices")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load worker invoices.");
  }
  return ((data ?? []) as Record<string, unknown>[]).map(fromRow);
}

export async function getWorkerInvoiceById(id: string): Promise<WorkerInvoice | null> {
  const { data, error } = await client()
    .from("worker_invoices")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to load worker invoice.");
  }
  return data ? fromRow(data as Record<string, unknown>) : null;
}

export async function insertWorkerInvoice(draft: WorkerInvoiceDraft): Promise<WorkerInvoice> {
  const c = client();
  const invNo = `WI-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const modern = {
    worker_id: draft.workerId,
    project_id: draft.projectId,
    amount: draft.amount,
    invoice_number: invNo,
    invoice_date: today,
    attachment_url: draft.invoiceFile?.trim() || null,
    status: draft.status === "paid" ? "Paid" : "Unpaid",
  };
  const legacy = {
    worker_id: draft.workerId,
    project_id: draft.projectId,
    amount: draft.amount,
    invoice_file: draft.invoiceFile?.trim() || "",
    status: draft.status ?? "unpaid",
  };

  let { data, error } = await c.from("worker_invoices").insert(modern).select("*").single();
  if (error && isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
  if (error && isInvoiceInsertFallback(error)) {
    ({ data, error } = await c.from("worker_invoices").insert(legacy).select("*").single());
  }
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to create worker invoice.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function updateWorkerInvoice(
  id: string,
  draft: Partial<WorkerInvoiceDraft>
): Promise<WorkerInvoice> {
  const payload: Record<string, unknown> = {};
  if (draft.workerId != null) payload.worker_id = draft.workerId;
  if (draft.projectId !== undefined) payload.project_id = draft.projectId;
  if (draft.amount != null) payload.amount = draft.amount;
  if (draft.invoiceFile !== undefined) payload.invoice_file = draft.invoiceFile?.trim() || null;
  if (draft.status != null) payload.status = draft.status;
  const { data, error } = await client()
    .from("worker_invoices")
    .update(payload)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to update worker invoice.");
  }
  return fromRow(data as Record<string, unknown>);
}

export async function deleteWorkerInvoice(id: string): Promise<void> {
  const { error } = await client().from("worker_invoices").delete().eq("id", id);
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to delete worker invoice.");
  }
}

export async function markWorkerInvoicesPaid(
  workerId: string,
  projectId?: string | null
): Promise<number> {
  const c = client();
  let q = c
    .from("worker_invoices")
    .update({ status: "paid" })
    .eq("worker_id", workerId)
    .neq("status", "paid");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.select("id");
  if (error) {
    if (isTableMissingError(error)) throw new Error(TABLE_MISSING_MESSAGE);
    throw new Error(error.message ?? "Failed to mark invoices paid.");
  }
  return Array.isArray(data) ? data.length : 0;
}
