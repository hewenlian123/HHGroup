import type { EstimateItemRow } from "@/lib/data";
import { estimateLineTotal } from "@/lib/data";
import { roundEstimateCurrencyValue } from "./estimate-currency";

/** Unified line item shape for create + edit UIs. */
export type EditorLineItem = {
  id: string;
  costCode: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  markupPct: number;
  hideAmountOnPdf: boolean;
};

export function splitLineItemDesc(desc: string): { title: string; description: string } {
  const i = desc.indexOf("\n");
  if (i < 0) return { title: desc, description: "" };
  return { title: desc.slice(0, i), description: desc.slice(i + 1) };
}

export function combineLineItemDesc(title: string, description: string): string {
  const t = title.trim();
  const d = description.trim();
  return d ? `${t}\n${d}` : t;
}

export function editorLineTotal(item: EditorLineItem): number {
  return item.qty * item.unitPrice * (1 + item.markupPct);
}

export function estimateRowLineTotal(row: EstimateItemRow): number {
  return estimateLineTotal(row);
}

export function editorLineTotalFromParts(
  qty: number,
  unitPrice: number,
  markupPct: number
): number {
  return qty * unitPrice * (1 + markupPct);
}

export function rowToEditorLineItem(row: EstimateItemRow): EditorLineItem {
  const { title, description } = splitLineItemDesc(row.desc ?? "");
  return {
    id: row.id,
    costCode: row.costCode,
    title,
    description,
    qty: row.qty,
    unit: row.unit,
    unitPrice: roundEstimateCurrencyValue(row.unitCost),
    markupPct: row.markupPct,
    hideAmountOnPdf: Boolean(row.hideAmountOnPdf),
  };
}

export function createEmptyLineItem(costCode: string, markupPct = 0.1): EditorLineItem {
  return {
    id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    costCode,
    title: "",
    description: "",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    markupPct,
    hideAmountOnPdf: false,
  };
}
