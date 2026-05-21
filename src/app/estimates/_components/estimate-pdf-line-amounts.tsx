import type { EstimateItemRow } from "@/lib/estimates-db";
import type { EditorLineItem } from "./estimate-line-item-model";

const PDF_AMOUNT_HIDDEN = "—";

type PdfLineRow = Pick<EstimateItemRow, "qty" | "unitCost" | "hideAmountOnPdf">;

function pdfLineTotal(row: PdfLineRow): number {
  return row.qty * row.unitCost;
}

export function isEstimateLineAmountHiddenOnPdf(row: { hideAmountOnPdf?: boolean }): boolean {
  return Boolean(row.hideAmountOnPdf);
}

export function formatPdfLineUnitPrice(row: PdfLineRow, fmt: (n: number) => string): string {
  if (isEstimateLineAmountHiddenOnPdf(row)) return PDF_AMOUNT_HIDDEN;
  return fmt(row.unitCost);
}

export function formatPdfLineTotal(row: PdfLineRow, fmt: (n: number) => string): string {
  if (isEstimateLineAmountHiddenOnPdf(row)) return PDF_AMOUNT_HIDDEN;
  return fmt(pdfLineTotal(row));
}

export function formatPdfEditorLineTotal(
  item: Pick<EditorLineItem, "hideAmountOnPdf" | "qty" | "unitPrice">,
  total: number,
  fmt: (n: number) => string
): string {
  if (isEstimateLineAmountHiddenOnPdf(item)) return PDF_AMOUNT_HIDDEN;
  return fmt(total);
}
