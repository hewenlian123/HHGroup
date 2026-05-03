import { createBrowserClient } from "@/lib/supabase";
import { uploadReceiptToStorage } from "@/lib/expense-receipt-upload-browser";
import {
  mergeReceiptOcrResults,
  runReceiptOcrForImageFile,
  type OcrSource,
} from "@/lib/receipt-ocr-client";
import { notifyReceiptQueueChanged, updateReceiptQueueRow } from "@/lib/receipt-queue";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

/** Outcome after attempting storage + queue row update (OCR may still be partial). */
export type ProcessReceiptQueueResult = {
  /** True once the file is stored (attachment path or public URL). */
  storageSaved: boolean;
};

/**
 * Upload file to storage and set queue row to pending/failed — does not run OCR.
 * Inputs can be enabled immediately after this returns (row status becomes pending).
 */
export async function uploadReceiptQueueFileOnly(
  supabase: BrowserSupabase,
  rowId: string,
  file: File,
  options?: { alreadyCompressed?: boolean }
): Promise<ProcessReceiptQueueResult> {
  const slot = await uploadReceiptToStorage(supabase, file, rowId, options);
  const uploadFailed = !!(slot.uploadError && !slot.attachmentPath && !slot.receiptsPublicUrl);
  const storageSaved = Boolean(slot.attachmentPath || slot.receiptsPublicUrl);
  await updateReceiptQueueRow(supabase, rowId, {
    status: uploadFailed ? "failed" : "pending",
    storage_path: slot.attachmentPath,
    receipt_public_url: slot.receiptsPublicUrl,
    error_message: uploadFailed
      ? (slot.uploadError ?? "Upload failed")
      : (slot.uploadError ?? null),
  });
  return { storageSaved };
}

/**
 * Run OCR in the background and patch the row only where DB fields are still empty
 * (avoids clobbering user edits).
 */
export function scheduleReceiptQueueOcr(
  supabase: BrowserSupabase,
  rowId: string,
  file: File,
  inferCategory: (vendor: string) => string,
  onApplied?: () => void
): void {
  void (async () => {
    const infer = (vendor: string, itemNames: string[]) => {
      void itemNames;
      return inferCategory(vendor);
    };
    if (!file.type.startsWith("image/")) {
      try {
        await updateReceiptQueueRow(supabase, rowId, { ocr_source: "none" });
        onApplied?.();
      } catch {
        /* ignore */
      }
      return;
    }

    let merged: ReturnType<typeof mergeReceiptOcrResults> | null = null;
    let ocrSource: OcrSource = "none";
    try {
      const ocrEntry = await runReceiptOcrForImageFile(file, { localTimeoutMs: 8000 });
      merged = mergeReceiptOcrResults([ocrEntry], { inferCategory: infer });
      ocrSource = merged.source;
    } catch {
      /* manual */
    }

    const { data: cur } = await supabase
      .from("receipt_queue")
      .select("vendor_name,amount,expense_date,category")
      .eq("id", rowId)
      .maybeSingle();

    if (!cur) return;

    const patch: Parameters<typeof updateReceiptQueueRow>[2] = {
      ocr_source: merged ? ocrSource : "none",
    };

    const vCur = String((cur as { vendor_name?: string }).vendor_name ?? "").trim();
    const aCur = String((cur as { amount?: string }).amount ?? "").trim();
    const dCur = String((cur as { expense_date?: string }).expense_date ?? "").trim();
    const catCur = String((cur as { category?: string }).category ?? "Other");

    if (merged) {
      if (!vCur && merged.autoFillVendor && merged.finalVendor.trim()) {
        patch.vendor_name = merged.finalVendor;
      }
      if (!aCur && merged.autoFillAmount && merged.sanitizedAmount != null) {
        patch.amount = String(merged.sanitizedAmount);
      }
      if (merged.autoFillDate && merged.clampedPurchase) {
        if (!dCur) {
          patch.expense_date = merged.clampedPurchase;
        }
      }
      if (
        !merged.needsReview &&
        catCur === "Other" &&
        merged.mappedCategory &&
        merged.mappedCategory !== "Other"
      ) {
        patch.category = merged.mappedCategory;
      }
    }

    try {
      await updateReceiptQueueRow(supabase, rowId, patch);
      onApplied?.();
    } catch {
      /* ignore */
    }
  })();
}

/**
 * Upload + set row pending, then OCR asynchronously (UI stays editable once upload finishes).
 */
export async function processReceiptQueueUpload(
  supabase: BrowserSupabase,
  rowId: string,
  file: File,
  inferCategory: (vendor: string) => string,
  options?: { alreadyCompressed?: boolean }
): Promise<ProcessReceiptQueueResult> {
  const result = await uploadReceiptQueueFileOnly(supabase, rowId, file, options);
  scheduleReceiptQueueOcr(supabase, rowId, file, inferCategory, () => {
    notifyReceiptQueueChanged();
  });
  return result;
}
