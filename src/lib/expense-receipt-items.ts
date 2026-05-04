import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense } from "@/lib/data";
import {
  collapseMirrorReceiptUrlAndExpenseAttachmentItems,
  dedupeExpenseReceiptItemsByStorageKey,
} from "@/lib/expense-attachment-dedupe";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import { resolvePreviewSignedUrlWithMemoryCache } from "@/lib/receipt-preview-url-cache";

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

/** Resolve storage paths / non-http URLs to signed HTTPS for attachment preview modals. */
export async function resolveExpenseReceiptItemsPreviewUrls(
  items: ExpenseReceiptItem[],
  supabase: SupabaseClient | null
): Promise<ExpenseReceiptItem[]> {
  if (!supabase) return items;
  const next: ExpenseReceiptItem[] = [];
  for (const item of items) {
    const raw = (item.url ?? "").trim();
    if (!raw || raw.startsWith("blob:")) {
      next.push(item);
      continue;
    }
    const urlOut = await resolvePreviewSignedUrl({
      supabase,
      rawUrlOrPath: raw,
      ttlSec: 3600,
      bucketCandidates: ["expense-attachments", "receipts"],
    });
    next.push(urlOut ? { ...item, url: urlOut } : item);
  }
  return next;
}

/** Same as `resolveExpenseReceiptItemsPreviewUrls` but uses the tab-session signed-URL cache + request dedupe. */
export async function resolveExpenseReceiptItemsPreviewUrlsWithCache(
  items: ExpenseReceiptItem[],
  supabase: SupabaseClient | null
): Promise<ExpenseReceiptItem[]> {
  if (!supabase) return items;
  const next: ExpenseReceiptItem[] = [];
  for (const item of items) {
    const raw = (item.url ?? "").trim();
    if (!raw || raw.startsWith("blob:")) {
      next.push(item);
      continue;
    }
    const urlOut = await resolvePreviewSignedUrlWithMemoryCache({
      supabase,
      rawUrlOrPath: raw,
      ttlSec: 3600,
      bucketCandidates: ["expense-attachments", "receipts"],
    });
    next.push(urlOut ? { ...item, url: urlOut } : item);
  }
  return next;
}
