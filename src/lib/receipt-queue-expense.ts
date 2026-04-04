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

function resolveQueueExpenseDate(row: ReceiptQueueRow): string {
  const raw = (row.expense_date ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

export async function finalizeReceiptQueueExpense(
  supabase: SupabaseClient,
  row: ReceiptQueueRow,
  mode: "confirm" | "bulk"
): Promise<void> {
  const total =
    mode === "bulk"
      ? (() => {
          const raw = String(row.amount ?? "")
            .replace(/,/g, "")
            .trim();
          const n = parseFloat(raw);
          return Number.isFinite(n) && n >= 0 ? n : 0;
        })()
      : Number(row.amount);
  if (mode === "confirm" && (!Number.isFinite(total) || total <= 0)) {
    throw new Error("Amount required");
  }
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
    date: expenseDate,
    vendorName: row.vendor_name.trim() || "Unknown",
    totalAmount: total,
    receiptUrl,
    sourceType: row.worker_id ? "reimbursement" : st,
    category,
    projectId: row.project_id || null,
    paymentAccountId: paId,
    ...(mode === "bulk" ? { initialStatus: "needs_review" as const } : {}),
  });
  if (typeof window !== "undefined" && paId) {
    rememberExpenseVendorPaymentAccount(row.vendor_name.trim() || "Unknown", paId);
    persistLastExpensePaymentAccountId(paId);
  }
  const path = row.storage_path?.trim();
  if (path) {
    await addExpenseAttachment(created.id, {
      id: crypto.randomUUID(),
      fileName: row.file_name || "receipt",
      mimeType: row.mime_type || "image/jpeg",
      size: row.size_bytes || 0,
      url: path,
      createdAt: new Date().toISOString(),
    });
  }
  if (row.worker_id) {
    await updateExpenseForReview(created.id, { workerId: row.worker_id });
  }
  await deleteReceiptQueueRow(supabase, row.id);
  notifyReceiptQueueChanged();
}
