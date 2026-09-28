import { decimalDraftFromNumber, parseDecimalDraft } from "@/lib/decimal-draft";

export type InvoiceLineDraft = {
  itemName: string;
  description: string;
  qty: string;
  unitPrice: string;
};

export function newInvoiceLineDraft(prefill?: {
  itemName?: string;
  description?: string;
  unitPrice?: number;
}): InvoiceLineDraft {
  return {
    itemName: prefill?.itemName ?? "",
    description: prefill?.description ?? "",
    qty: "1",
    unitPrice: decimalDraftFromNumber(prefill?.unitPrice ?? 0),
  };
}

export function invoiceLineHasContent(line: InvoiceLineDraft): boolean {
  return line.itemName.trim().length > 0 || line.description.trim().length > 0;
}

export function composeInvoiceLineDescription(line: InvoiceLineDraft): string {
  const itemName = line.itemName.trim();
  const description = line.description.trim();
  if (itemName && description) return `${itemName}\n${description}`;
  return itemName || description;
}

export function splitInvoiceLineDescription(
  raw: string
): Pick<InvoiceLineDraft, "itemName" | "description"> {
  const normalized = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { itemName: "", description: "" };
  const [itemName, ...descriptionParts] = normalized.split("\n");
  return {
    itemName: itemName.trim(),
    description: descriptionParts.join("\n").trim(),
  };
}

export function invoiceLinesToDrafts(
  lines: Array<{ description?: string | null; qty?: unknown; unitPrice?: unknown }>
): InvoiceLineDraft[] {
  if (!lines.length) return [newInvoiceLineDraft()];
  return lines.map((line) => ({
    ...splitInvoiceLineDescription(line.description ?? ""),
    qty: decimalDraftFromNumber(parseDecimalDraft(String(line.qty ?? ""))),
    unitPrice: decimalDraftFromNumber(parseDecimalDraft(String(line.unitPrice ?? ""))),
  }));
}

export function invoiceLineDraftToInput(line: InvoiceLineDraft): {
  description: string;
  qty: number;
  unitPrice: number;
} {
  return {
    description: composeInvoiceLineDescription(line),
    qty: Math.max(0, parseDecimalDraft(line.qty)),
    unitPrice: Math.max(0, parseDecimalDraft(line.unitPrice)),
  };
}
