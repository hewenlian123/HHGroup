import { createBrowserClient } from "@/lib/supabase";
import { uploadReceiptToStorage } from "@/lib/expense-receipt-upload-browser";
import {
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
  type ReceiptOcrResult,
  type OcrSource,
} from "@/lib/receipt-ocr-client";
import { updateReceiptQueueRow } from "@/lib/receipt-queue";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

/**
 * Upload + OCR for a `receipt_queue` row; sets status `pending` or `failed`.
 */
export async function processReceiptQueueUpload(
  supabase: BrowserSupabase,
  rowId: string,
  file: File,
  inferCategory: (vendor: string) => string
): Promise<void> {
  const slot = await uploadReceiptToStorage(supabase, file, rowId);
  const ocrResults: Array<{ result: ReceiptOcrResult; source: OcrSource }> = [];
  if (file.type.startsWith("image/")) {
    try {
      ocrResults.push(await runReceiptOcrForImageFile(file, { localTimeoutMs: 8000 }));
    } catch {
      /* manual */
    }
  }
  const merged =
    ocrResults.length > 0 ? mergeReceiptOcrResults(ocrResults, { inferCategory }) : null;
  const today = new Date().toISOString().slice(0, 10);
  const uploadFailed = !!(slot.uploadError && !slot.attachmentPath && !slot.receiptsPublicUrl);
  await updateReceiptQueueRow(supabase, rowId, {
    status: uploadFailed ? "failed" : "pending",
    storage_path: slot.attachmentPath,
    receipt_public_url: slot.receiptsPublicUrl,
    error_message: uploadFailed
      ? (slot.uploadError ?? "Upload failed")
      : (slot.uploadError ?? null),
    vendor_name: merged?.autoFillVendor ? merged.finalVendor : "",
    amount:
      merged?.autoFillAmount && merged.sanitizedAmount != null
        ? String(merged.sanitizedAmount)
        : "",
    expense_date: merged?.autoFillDate && merged.clampedPurchase ? merged.clampedPurchase : today,
    category: merged?.mappedCategory ?? "Other",
    ocr_source: merged?.source ?? "none",
  });
}
