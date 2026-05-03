import type { Expense } from "@/lib/data";
import {
  collapseMirrorReceiptUrlAndExpenseAttachmentItems,
  dedupeExpenseReceiptItemsByStorageKey,
} from "@/lib/expense-attachment-dedupe";

export type ExpenseReceiptItem = { url: string; fileName: string };

/**
 * Receipt line items for inbox row signals, preview modal, and global receipt preview.
 * Trims URLs so whitespace-only receipt_url does not count as “has receipt”.
 */
export function getExpenseReceiptItemsFromParts(parts: {
  receiptUrl?: string | null;
  attachments?: Expense["attachments"] | null;
}): ExpenseReceiptItem[] {
  const items: ExpenseReceiptItem[] = [];
  const ru = (parts.receiptUrl ?? "").trim();
  if (ru) {
    items.push({ url: ru, fileName: "Receipt" });
  }
  for (const a of parts.attachments ?? []) {
    if (!a?.url) continue;
    const u = String(a.url).trim();
    if (!u) continue;
    const name = (a.fileName ?? "").trim();
    items.push({ url: u, fileName: name !== "" ? name : "Attachment" });
  }
  return collapseMirrorReceiptUrlAndExpenseAttachmentItems(
    dedupeExpenseReceiptItemsByStorageKey(items)
  );
}

export function getExpenseReceiptItems(expense: Expense): ExpenseReceiptItem[] {
  return getExpenseReceiptItemsFromParts({
    receiptUrl: expense.receiptUrl,
    attachments: expense.attachments,
  });
}

/**
 * Server-friendly receipt signal: non-empty receipt URL or at least one attachment row.
 * Matches the intent of getExpenseReceiptItemsFromParts when full attachment URLs are loaded.
 */
export function expenseHasReceiptSignal(
  receiptUrl: string | null | undefined,
  attachmentCount: number
): boolean {
  if ((receiptUrl ?? "").trim() !== "") return true;
  return attachmentCount > 0;
}
