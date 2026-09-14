import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { notifyReceiptQueueChanged, type ReceiptQueueRow } from "./receipt-queue";

const inflight = new Map<string, Promise<void>>();

export function finalizeReceiptQueueExpense(
  supabase: SupabaseClient,
  row: ReceiptQueueRow,
  _mode: "confirm" | "bulk"
): Promise<void> {
  void _mode; // Both legacy entry points use the same atomic workflow.
  const existing = inflight.get(row.id);
  if (existing) return existing;
  const pending = (async () => {
    const { data, error } = await supabase.rpc("finalize_receipt_queue_operation", {
      p_receipt_id: row.id,
      p_expense_id: null,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data.expense_id !== "string")
      throw new Error("Receipt transfer could not be confirmed. Retry the same receipt.");
    const account = row.payment_account_id?.trim();
    if (typeof window !== "undefined" && account) {
      rememberExpenseVendorPaymentAccount(row.vendor_name.trim() || "Unknown", account);
      persistLastExpensePaymentAccountId(account);
    }
    notifyReceiptQueueChanged();
  })().finally(() => inflight.delete(row.id));
  inflight.set(row.id, pending);
  return pending;
}
