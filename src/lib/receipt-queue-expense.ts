import { addExpenseAttachment, createQuickExpense, updateExpenseForReview } from "@/lib/data";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteReceiptQueueRow,
  notifyReceiptQueueChanged,
  type ReceiptQueueRow,
} from "./receipt-queue";

/** Prevents concurrent finalize for the same queue row (double Confirm / race). */
const finalizeReceiptQueueExpenseInflight = new Set<string>();

function resolveQueueExpenseDate(row: ReceiptQueueRow): string {
  const raw = (row.expense_date ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

export async function finalizeReceiptQueueExpense(
  supabase: SupabaseClient,
  row: ReceiptQueueRow,
  _mode: "confirm" | "bulk"
): Promise<void> {
  void _mode;
  if (finalizeReceiptQueueExpenseInflight.has(row.id)) {
    return;
  }
  finalizeReceiptQueueExpenseInflight.add(row.id);
  try {
    // Both legacy actions only transfer into Review; neither approves the expense.
    const total = Number(
      String(row.amount ?? "")
        .replace(/,/g, "")
        .trim()
    );
    if (!Number.isFinite(total) || total < 0)
      throw new Error("Amount must be a valid non-negative number.");
    const receiptUrl = (row.receipt_public_url ?? "").trim() || undefined;
    const stRaw = (row.source_type ?? "receipt_upload").trim();
    const st: "company" | "receipt_upload" | "reimbursement" =
      stRaw === "company" || stRaw === "receipt_upload" || stRaw === "reimbursement"
        ? stRaw
        : "receipt_upload";
    const expenseDate = resolveQueueExpenseDate(row);
    const category = (row.category ?? "").trim() || "Other";
    const paId = (row.payment_account_id ?? "").trim() || null;
    const created = await createQuickExpense({
      idempotencyKey: `receipt-queue:${row.id}`,
      date: expenseDate,
      vendorName: row.vendor_name.trim() || "Unknown",
      totalAmount: total,
      receiptUrl,
      sourceType: row.worker_id ? "reimbursement" : st,
      category,
      projectId: row.project_id || null,
      paymentAccountId: paId,
      initialStatus: "needs_review",
    });
    if (typeof window !== "undefined" && paId) {
      rememberExpenseVendorPaymentAccount(row.vendor_name.trim() || "Unknown", paId);
      persistLastExpensePaymentAccountId(paId);
    }
    const path = row.storage_path?.trim();
    if (path) {
      await addExpenseAttachment(created.id, {
        id: row.id,
        fileName: row.file_name || "receipt",
        mimeType: row.mime_type || "image/jpeg",
        size: row.size_bytes || 0,
        url: path,
        createdAt: new Date().toISOString(),
      });
    }
    if (row.worker_id) {
      const updated = await updateExpenseForReview(created.id, { workerId: row.worker_id });
      if (!updated)
        throw new Error("Unable to link the expense to the worker. Receipt retained for review.");
    }
    await deleteReceiptQueueRow(supabase, row.id);
    notifyReceiptQueueChanged();
  } finally {
    finalizeReceiptQueueExpenseInflight.delete(row.id);
  }
}
