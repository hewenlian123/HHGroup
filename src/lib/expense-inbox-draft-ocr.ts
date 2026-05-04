import type { Expense } from "@/lib/data";
import { getExpenseById, getExpenseTotal, updateExpenseForReview } from "@/lib/data";
import { notifyReceiptQueueChanged } from "@/lib/receipt-queue";
import { inferExpenseCategoryFromVendor } from "@/lib/receipt-infer-category";
import { mergeReceiptOcrResults, runReceiptOcrForImageFile } from "@/lib/receipt-ocr-client";

/**
 * Runs OCR after an inbox draft expense exists; patches empty fields only.
 * On failure, sets `needs_review` without clearing receipt or amounts.
 */
export function scheduleInboxDraftExpenseOcr(expenseId: string, file: File): void {
  void (async () => {
    const infer = (vendor: string, itemNames: string[]) => {
      void itemNames;
      return inferExpenseCategoryFromVendor(vendor);
    };

    if (!file.type.startsWith("image/")) {
      try {
        await updateExpenseForReview(expenseId, { status: "needs_review" });
      } catch {
        /* ignore */
      }
      notifyReceiptQueueChanged();
      return;
    }

    let merged: ReturnType<typeof mergeReceiptOcrResults> | null = null;
    try {
      const ocrEntry = await runReceiptOcrForImageFile(file, { localTimeoutMs: 8000 });
      merged = mergeReceiptOcrResults([ocrEntry], { inferCategory: infer });
    } catch {
      try {
        await updateExpenseForReview(expenseId, { status: "needs_review" });
      } catch {
        /* ignore */
      }
      notifyReceiptQueueChanged();
      return;
    }

    const cur = await getExpenseById(expenseId);
    if (!cur) {
      notifyReceiptQueueChanged();
      return;
    }

    const patch: Parameters<typeof updateExpenseForReview>[1] = {};

    const vRaw = String(cur.vendorName ?? "").trim();
    /** Treat placeholder vendor as empty so OCR can fill (matches Quick Expense / inbox drafts). */
    const vCur = /^unknown$/i.test(vRaw) ? "" : vRaw;
    const aCur = String(getExpenseTotalNum(cur));
    const dCur = String(cur.date ?? "")
      .trim()
      .slice(0, 10);
    const catCur = String(cur.lines[0]?.category ?? "Other").trim();

    if (merged) {
      if (!vCur.trim() && merged.autoFillVendor && merged.finalVendor.trim()) {
        patch.vendorName = merged.finalVendor;
      }
      if (merged.autoFillAmount && merged.sanitizedAmount != null) {
        const num = merged.sanitizedAmount;
        const current = Number(aCur);
        if (current <= 0.011) {
          patch.amount = num;
        }
      }
      if (merged.autoFillDate && merged.clampedPurchase) {
        if (!dCur || dCur === "") {
          patch.date = merged.clampedPurchase;
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
      if (Object.keys(patch).length > 0) {
        await updateExpenseForReview(expenseId, patch);
      }
    } catch {
      try {
        await updateExpenseForReview(expenseId, { status: "needs_review" });
      } catch {
        /* ignore */
      }
    }
    notifyReceiptQueueChanged();
  })();
}

function getExpenseTotalNum(e: Expense): number {
  return getExpenseTotal(e);
}
