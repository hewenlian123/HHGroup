import type { EstimateItemRow } from "@/lib/data";
import { lineTotal as estimateLineTotal } from "@/lib/estimate-domain";
import { roundEstimateCurrencyValue } from "./estimate-currency";
import type { LineItemPresetInput } from "./estimate-builder-draft-storage";
import { DEFAULT_LINE_ITEM_STATUS, type EstimateLineItemStatus } from "./estimate-line-item-status";

/** Unified line item shape for create + edit UIs. */
export type EditorLineItem = {
  id: string;
  costCode: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  hideAmountOnPdf: boolean;
  status: EstimateLineItemStatus;
};

export function editorLineTotal(item: EditorLineItem): number {
  return item.qty * item.unitPrice;
}

export function estimateRowLineTotal(row: EstimateItemRow): number {
  return estimateLineTotal(row);
}

export function editorLineTotalFromParts(qty: number, unitPrice: number): number {
  return qty * unitPrice;
}

export function rowToEditorLineItem(row: EstimateItemRow): EditorLineItem {
  return {
    id: row.id,
    costCode: row.costCode,
    title: row.itemName ?? "",
    description: row.desc ?? "",
    qty: row.qty,
    unit: row.unit,
    unitPrice: roundEstimateCurrencyValue(row.unitCost),
    hideAmountOnPdf: Boolean(row.hideAmountOnPdf),
    status: row.status ?? DEFAULT_LINE_ITEM_STATUS,
  };
}

export function createEmptyLineItem(costCode: string): EditorLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    costCode,
    title: "",
    description: "",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    hideAmountOnPdf: false,
    status: DEFAULT_LINE_ITEM_STATUS,
  };
}

export function editorLineItemToPresetInput(item: EditorLineItem): LineItemPresetInput {
  return {
    title: item.title,
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    unitPrice: item.unitPrice,
    status: item.status,
  };
}

export function lineItemFromPreset(costCode: string, preset: LineItemPresetInput): EditorLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    costCode,
    title: preset.title,
    description: preset.description,
    qty: preset.qty,
    unit: preset.unit || "EA",
    unitPrice: preset.unitPrice,
    hideAmountOnPdf: false,
    status: preset.status ?? DEFAULT_LINE_ITEM_STATUS,
  };
}

/** Tax and discount are fixed amounts in computeSummary; replace only the selected line delta. */
export function estimateInspectorTotal(
  total: number | null | undefined,
  pricing: { adjustment: number } | null
): number | null {
  return total == null ? null : total + (pricing?.adjustment ?? 0);
}
