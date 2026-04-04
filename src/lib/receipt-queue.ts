import type { SupabaseClient } from "@supabase/supabase-js";

export type ReceiptQueueStatus = "processing" | "pending" | "failed";

export type ReceiptQueueRow = {
  id: string;
  status: ReceiptQueueStatus;
  storage_path: string | null;
  receipt_public_url: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  vendor_name: string;
  amount: string;
  expense_date: string;
  project_id: string | null;
  category: string;
  source_type: string;
  worker_id: string | null;
  payment_account_id: string | null;
  ocr_source: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ReceiptQueuePatch = Partial<{
  status: ReceiptQueueStatus;
  storage_path: string | null;
  receipt_public_url: string | null;
  vendor_name: string;
  amount: string;
  expense_date: string;
  project_id: string | null;
  category: string;
  source_type: string;
  worker_id: string | null;
  payment_account_id: string | null;
  ocr_source: string;
  error_message: string | null;
}>;

export const RECEIPT_QUEUE_CHANGED_EVENT = "hh:receipt-queue-changed";

export function notifyReceiptQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(RECEIPT_QUEUE_CHANGED_EVENT));
  }
}

function mapRow(r: Record<string, unknown>): ReceiptQueueRow {
  return {
    id: String(r.id),
    status: (r.status as ReceiptQueueStatus) ?? "pending",
    storage_path: (r.storage_path as string | null) ?? null,
    receipt_public_url: (r.receipt_public_url as string | null) ?? null,
    file_name: String(r.file_name ?? ""),
    mime_type: String(r.mime_type ?? ""),
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    vendor_name: String(r.vendor_name ?? ""),
    amount: String(r.amount ?? ""),
    expense_date: String(r.expense_date ?? ""),
    project_id: (r.project_id as string | null) ?? null,
    category: String(r.category ?? "Other"),
    source_type: String(r.source_type ?? "receipt_upload"),
    worker_id: (r.worker_id as string | null) ?? null,
    payment_account_id: (r.payment_account_id as string | null) ?? null,
    ocr_source: String(r.ocr_source ?? "none"),
    error_message: (r.error_message as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function fetchReceiptQueueRows(supabase: SupabaseClient): Promise<ReceiptQueueRow[]> {
  const { data, error } = await supabase
    .from("receipt_queue")
    .select("*")
    .in("status", ["pending", "processing", "failed"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((x) => mapRow(x as Record<string, unknown>));
}

export async function fetchReceiptQueueBadgeCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("receipt_queue")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "processing", "failed"]);
  if (error) return 0;
  return count ?? 0;
}

export async function insertReceiptQueueProcessing(
  supabase: SupabaseClient,
  file: Pick<File, "name" | "type" | "size">
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("receipt_queue")
    .insert({
      status: "processing",
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      expense_date: today,
      category: "Other",
      source_type: "receipt_upload",
      ocr_source: "none",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function updateReceiptQueueRow(
  supabase: SupabaseClient,
  id: string,
  patch: ReceiptQueuePatch
): Promise<void> {
  const { error } = await supabase.from("receipt_queue").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteReceiptQueueRow(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("receipt_queue").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
