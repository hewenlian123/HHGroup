import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchReceiptQueueRows, type ReceiptQueueRow } from "@/lib/receipt-queue";

export const receiptQueueQueryKey = ["receipt_queue"] as const;

export type FinancialProjectRow = { id: string; name: string | null; status?: string | null };

export const financialProjectsQueryKey = ["financial_projects"] as const;

/**
 * Active receipt queue rows (pending / processing / failed), same ordering and filters as
 * `fetchReceiptQueueRows` (created_at ascending — preserves existing queue UX).
 */
export async function fetchReceiptQueue(supabase: SupabaseClient): Promise<ReceiptQueueRow[]> {
  return fetchReceiptQueueRows(supabase);
}

export async function fetchFinancialProjects(
  supabase: SupabaseClient
): Promise<FinancialProjectRow[]> {
  const { data, error } = await supabase.from("projects").select("id,name,status").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as FinancialProjectRow[];
}
