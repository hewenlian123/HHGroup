import { createQuickExpense } from "@/lib/data";
import { uploadReceiptToStorage } from "@/lib/expense-receipt-upload-browser";
import { compressImageFileForReceiptUpload } from "@/lib/image-compress-browser";
import { inboxUploadDedupeReference } from "@/lib/inbox-upload-constants";
import { scheduleInboxDraftExpenseOcr } from "@/lib/expense-inbox-draft-ocr";
import { createBrowserClient } from "@/lib/supabase";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type InboxDraftUploadResult =
  | { ok: true; expenseId: string; duplicate: false; referenceNo: string }
  | { ok: true; expenseId: string; duplicate: true; referenceNo: string }
  | { ok: false; message: string };

/**
 * Upload receipt to storage, create a `draft` expense (inbox), dedupe by `reference_no` hash.
 * Does not use `receipt_queue`. OCR runs asynchronously via `scheduleInboxDraftExpenseOcr`.
 */
export async function createInboxDraftFromReceiptFile(
  supabase: BrowserSupabase,
  file: File
): Promise<InboxDraftUploadResult> {
  let prepared: File = file;
  if (file.type.startsWith("image/") && !file.type.includes("svg")) {
    try {
      prepared = await compressImageFileForReceiptUpload(file);
    } catch {
      prepared = file;
    }
  }

  const hash = await sha256Hex(prepared);
  const ref = inboxUploadDedupeReference(hash);

  const { data: existing, error: existErr } = await supabase
    .from("expenses")
    .select("id")
    .eq("reference_no", ref)
    .maybeSingle();
  if (!existErr && existing && typeof (existing as { id?: string }).id === "string") {
    return {
      ok: true,
      expenseId: String((existing as { id: string }).id),
      duplicate: true,
      referenceNo: ref,
    };
  }

  const slot = await uploadReceiptToStorage(supabase, prepared, hash.slice(0, 12), {
    alreadyCompressed: true,
  });
  const receiptUrl =
    slot.receiptsPublicUrl?.trim() ||
    (slot.previewUrl && !slot.previewUrl.startsWith("blob:") ? slot.previewUrl : null);
  if (!receiptUrl || slot.uploadError) {
    return {
      ok: false,
      message: slot.uploadError ?? "Could not upload receipt file.",
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const created = await createQuickExpense({
    date: today,
    vendorName: "Unknown",
    totalAmount: 0.01,
    receiptUrl,
    category: "Other",
    sourceType: "receipt_upload",
    initialStatus: "draft",
    referenceNo: ref,
  });

  scheduleInboxDraftExpenseOcr(created.id, prepared);
  return { ok: true, expenseId: created.id, duplicate: false, referenceNo: ref };
}
