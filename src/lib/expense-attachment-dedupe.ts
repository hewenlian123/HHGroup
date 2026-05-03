import type { ExpenseReceiptUploadSlot } from "@/lib/expense-receipt-upload-browser";

export type ExpenseReceiptItemLike = { url: string; fileName: string };

/** Comparable key for expense receipt rows (storage path or public/signed URL). */
export function expenseAttachmentStorageDedupeKey(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  try {
    if (/^https?:\/\//i.test(s)) {
      s = new URL(s).pathname;
    }
  } catch {
    /* keep raw */
  }
  s = s.split("?")[0]!.split("#")[0]!.replace(/^\/+/, "").toLowerCase();
  const sliceFrom = (needle: string): string | null => {
    const i = s.indexOf(needle);
    if (i < 0) return null;
    return s.slice(i).replace(/\/+/g, "/");
  };
  const bucketTail =
    sliceFrom("expense-attachments/") ??
    sliceFrom("private/expense-attachments/") ??
    sliceFrom("receipts/");
  if (bucketTail) return bucketTail;
  /** DB often stores `quick-expense/...` without the bucket prefix; align with public URL paths. */
  if (s.startsWith("quick-expense/")) return `expense-attachments/${s}`.replace(/\/+/g, "/");
  return s.replace(/\/+/g, "/");
}

function attachmentDisplayScore(fileName: string): number {
  const fn = fileName.trim().toLowerCase();
  if (fn === "" || fn === "attachment.jpg" || fn === "attachment.pdf") return 0;
  if (fn === "receipt" || fn === "photo" || fn === "photo.jpg") return 1;
  return 2;
}

function pickBetterReceiptDisplayItem(
  a: ExpenseReceiptItemLike,
  b: ExpenseReceiptItemLike
): ExpenseReceiptItemLike {
  const aIsGeneric = a.fileName.trim().toLowerCase() === "receipt";
  const bIsGeneric = b.fileName.trim().toLowerCase() === "receipt";
  if (a.fileName.trim() === "Receipt" && b.fileName.trim() !== "Receipt") return b;
  if (b.fileName.trim() === "Receipt" && a.fileName.trim() !== "Receipt") return a;
  const sa = attachmentDisplayScore(a.fileName);
  const sb = attachmentDisplayScore(b.fileName);
  if (sa !== sb) return sa >= sb ? a : b;
  if (aIsGeneric !== bIsGeneric) return aIsGeneric ? b : a;
  return a;
}

/**
 * Quick Expense (and similar flows) set `expenses.receipt_url` to a public `receipts/…` URL while
 * also inserting `attachments.file_path` under `expense-attachments/quick-expense/…` — two
 * objects, one logical receipt. When exactly one pair remains after storage-key dedupe, keep the
 * expense-attachments entry (stable path for preview/replace).
 */
export function collapseMirrorReceiptUrlAndExpenseAttachmentItems(
  items: ExpenseReceiptItemLike[]
): ExpenseReceiptItemLike[] {
  if (items.length !== 2) return items;
  const k0 = expenseAttachmentStorageDedupeKey(items[0]!.url);
  const k1 = expenseAttachmentStorageDedupeKey(items[1]!.url);
  if (!k0 || !k1 || k0 === k1) return items;
  const r0 = k0.startsWith("receipts/");
  const e0 = k0.startsWith("expense-attachments/");
  const r1 = k1.startsWith("receipts/");
  const e1 = k1.startsWith("expense-attachments/");
  if (!((r0 && e1) || (e0 && r1))) return items;
  return [e0 ? items[0]! : items[1]!];
}

/** Dedupe receipt carousel / merged receipt lines when URLs differ but point at the same object. */
export function dedupeExpenseReceiptItemsByStorageKey(
  items: ExpenseReceiptItemLike[]
): ExpenseReceiptItemLike[] {
  if (items.length <= 1) return items;
  const indexed = items.map((it, i) => ({ it, i }));
  const groups = new Map<string, typeof indexed>();
  for (const pair of indexed) {
    const k = expenseAttachmentStorageDedupeKey(pair.it.url) || `raw:${pair.it.url}`;
    const g = groups.get(k) ?? [];
    g.push(pair);
    groups.set(k, g);
  }
  return Array.from(groups.values())
    .map((g) => {
      const i = Math.min(...g.map((x) => x.i));
      const it = g.map((x) => x.it).reduce((a, b) => pickBetterReceiptDisplayItem(a, b));
      return { it, i };
    })
    .sort((a, b) => a.i - b.i)
    .map((x) => x.it);
}

function pickBetterAttachmentRow<T extends { fileName: string; createdAt: string }>(a: T, b: T): T {
  const sa = attachmentDisplayScore(a.fileName);
  const sb = attachmentDisplayScore(b.fileName);
  if (sa !== sb) return sa >= sb ? a : b;
  return new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b;
}

/** Collapse duplicate attachment rows (same storage object, different ids / legacy+dedicated merge). */
export function dedupeExpenseAttachmentsByStorageKey<
  T extends { id: string; fileName: string; url: string; createdAt: string },
>(attachments: T[]): T[] {
  if (attachments.length <= 1) return attachments;
  const sorted = [...attachments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const byKey = new Map<string, T>();
  const noUrl: T[] = [];
  for (const a of sorted) {
    const k = expenseAttachmentStorageDedupeKey(a.url);
    if (!k) {
      noUrl.push(a);
      continue;
    }
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, a);
    else byKey.set(k, pickBetterAttachmentRow(cur, a));
  }
  return [...noUrl, ...byKey.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/** After parallel upload/OCR, drop duplicate slots that resolved to the same storage object. */
export function dedupeExpenseReceiptUploadSlots(
  slots: ExpenseReceiptUploadSlot[]
): ExpenseReceiptUploadSlot[] {
  if (slots.length <= 1) return slots;
  const seen = new Set<string>();
  const out: ExpenseReceiptUploadSlot[] = [];
  const dropped: ExpenseReceiptUploadSlot[] = [];
  for (const s of slots) {
    const path = (s.attachmentPath ?? "").trim();
    const pub = (s.receiptsPublicUrl ?? "").trim();
    const k = path
      ? expenseAttachmentStorageDedupeKey(path)
      : pub
        ? expenseAttachmentStorageDedupeKey(pub)
        : "";
    if (k) {
      if (seen.has(k)) {
        dropped.push(s);
        continue;
      }
      seen.add(k);
    }
    out.push(s);
  }
  for (const s of dropped) s.revoke?.();
  return out;
}
