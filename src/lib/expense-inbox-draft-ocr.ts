import { notifyInboxDraftOcrWriteback } from "@/lib/expense-inbox-draft-ocr-events";
import { notifyReceiptQueueChanged } from "@/lib/receipt-queue";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import { mergeReceiptOcrResults, runReceiptOcrForImageFile } from "@/lib/receipt-ocr-client";

type OcrWritebackResponse = {
  ok?: boolean;
  message?: string;
  changedFields?: string[];
};

async function writeInboxDraftOcrResult(
  expenseId: string,
  merged: ReturnType<typeof mergeReceiptOcrResults>
): Promise<string[]> {
  const response = await fetch(
    `/api/financial/expenses/${encodeURIComponent(expenseId)}/ocr-writeback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        vendorName: merged.finalVendor,
        vendorConfidence: merged.vendorConfidence,
        amount: merged.sanitizedAmount,
        amountConfidence: merged.amountConfidence,
        date: merged.clampedPurchase,
        dateConfidence: merged.dateConfidence,
        category: merged.mappedCategory,
        ocrSource: merged.source,
      }),
    }
  );
  let body: OcrWritebackResponse | null = null;
  try {
    body = (await response.json()) as OcrWritebackResponse;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || `Receipt OCR writeback failed (${response.status}).`);
  }
  return Array.isArray(body.changedFields) ? body.changedFields : [];
}

/**
 * Runs OCR after an inbox draft expense exists; patches empty fields only.
 * On failure, keeps the receipt-backed draft intact for manual review.
 */
export function scheduleInboxDraftExpenseOcr(expenseId: string, file: File): void {
  void (async () => {
    const infer = (vendor: string, itemNames: string[]) => {
      void itemNames;
      return inferExpenseCategoryFromVendor(vendor);
    };

    if (!file.type.startsWith("image/")) {
      notifyInboxDraftOcrWriteback({
        expenseId,
        ok: false,
        message: "Receipt saved. OCR needs an image file, so this draft still needs review.",
      });
      notifyReceiptQueueChanged();
      return;
    }

    let merged: ReturnType<typeof mergeReceiptOcrResults> | null = null;
    try {
      const ocrEntry = await runReceiptOcrForImageFile(file, { localTimeoutMs: 8000 });
      merged = mergeReceiptOcrResults([ocrEntry], { inferCategory: infer });
    } catch {
      notifyInboxDraftOcrWriteback({
        expenseId,
        ok: false,
        message: "Receipt saved. OCR could not read this file, so this draft still needs review.",
      });
      notifyReceiptQueueChanged();
      return;
    }

    try {
      const changedFields = await writeInboxDraftOcrResult(expenseId, merged);
      notifyInboxDraftOcrWriteback({ expenseId, ok: true, changedFields });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Receipt saved. OCR results could not be applied to this draft.";
      console.warn("[expense-inbox-draft-ocr] writeback failed", message);
      notifyInboxDraftOcrWriteback({
        expenseId,
        ok: false,
        message:
          "Receipt saved. OCR results could not be applied, so this draft still needs review.",
      });
    }
    notifyReceiptQueueChanged();
  })();
}
