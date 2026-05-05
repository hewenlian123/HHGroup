import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense, ExpenseAttachment } from "@/lib/expenses-db";
import {
  collapseMirrorReceiptUrlAndExpenseAttachmentItems,
  dedupeExpenseAttachmentsByStorageKey,
  dedupeExpenseReceiptItemsByStorageKey,
} from "@/lib/expense-attachment-dedupe";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import { resolvePreviewSignedUrlWithMemoryCache } from "@/lib/receipt-preview-url-cache";

export type ExpenseReceiptItem = { url: string; fileName: string };

export const RECEIPT_URL_ATTACHMENT_ID_PREFIX = "receipt-url:";

export function isExpenseReceiptUrlAttachmentId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(RECEIPT_URL_ATTACHMENT_ID_PREFIX);
}

function receiptFileNameFromUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "Receipt";
  try {
    const pathname = /^https?:\/\//i.test(value) ? new URL(value).pathname : value;
    const cleanPath = pathname.split("?")[0]!.split("#")[0]!;
    const tail = cleanPath
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .pop();
    if (!tail) return "Receipt";
    const decoded = decodeURIComponent(tail).trim();
    return decoded || "Receipt";
  } catch {
    const tail = value
      .split("?")[0]!
      .split("#")[0]!
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .pop();
    return tail || "Receipt";
  }
}

function receiptMimeTypeFromNameOrUrl(fileName: string, raw: string): string {
  const s = `${fileName} ${raw}`.toLowerCase();
  if (/\.pdf(?:\?|#|$|\s)/.test(s)) return "application/pdf";
  if (/\.png(?:\?|#|$|\s)/.test(s)) return "image/png";
  if (/\.webp(?:\?|#|$|\s)/.test(s)) return "image/webp";
  if (/\.gif(?:\?|#|$|\s)/.test(s)) return "image/gif";
  return "image/jpeg";
}

export function getExpenseReceiptUrlAttachment(
  expense: Pick<Expense, "id" | "date" | "receiptUrl">
): ExpenseAttachment | null {
  const receiptUrl = (expense.receiptUrl ?? "").trim();
  if (!receiptUrl) return null;
  const fileName = receiptFileNameFromUrl(receiptUrl);
  return {
    id: `${RECEIPT_URL_ATTACHMENT_ID_PREFIX}${expense.id}`,
    fileName,
    mimeType: receiptMimeTypeFromNameOrUrl(fileName, receiptUrl),
    size: 0,
    url: receiptUrl,
    createdAt: expense.date
      ? `${expense.date.slice(0, 10)}T00:00:00.000Z`
      : "1970-01-01T00:00:00.000Z",
  };
}

export function getExpenseDisplayAttachments(
  expense: Pick<Expense, "id" | "date" | "receiptUrl" | "attachments">
): ExpenseAttachment[] {
  const receiptAttachment = getExpenseReceiptUrlAttachment(expense);
  return dedupeExpenseAttachmentsByStorageKey(
    receiptAttachment
      ? [receiptAttachment, ...(expense.attachments ?? [])]
      : (expense.attachments ?? [])
  );
}

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
