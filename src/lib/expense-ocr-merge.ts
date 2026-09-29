import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
import {
  isPlaceholderVendor,
  matchVendorName,
  type VendorCandidate,
  type VendorMatch,
} from "@/lib/expense-vendor-match";

export { isPlaceholderVendor };

export type FieldConfidence = "high" | "medium" | "low";

export type InvoiceExtraction = {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: Partial<
    Record<
      "vendor" | "invoiceNumber" | "invoiceDate" | "dueDate" | "subtotal" | "tax" | "total",
      FieldConfidence
    >
  >;
};

export type InboxDraftSnapshot = {
  vendorName: string;
  vendorId: string | null;
  referenceNo: string | null;
  expenseDate: string;
  /** Calendar date the draft was defaulted to, usually Honolulu today at upload. */
  placeholderDate: string | null;
  createdOn: string | null;
  dueDate: string | null;
  subtotal: number | null;
  tax: number | null;
  lineAmount: number | null;
  lineCount: number;
};

export type OcrMergePatch = {
  vendorName?: string;
  vendorId?: string | null;
  vendorSuggestion?: string | null;
  referenceNo?: string;
  expenseDate?: string;
  dueDate?: string;
  subtotal?: number;
  tax?: number;
  lineAmount?: number;
};

export type OcrMergeResult = {
  patch: OcrMergePatch;
  applied: string[];
  attention: string[];
  confidence: Record<string, FieldConfidence>;
  vendorMatch: VendorMatch;
};

const CONFIDENCE_RANK: Record<FieldConfidence, number> = { low: 0, medium: 1, high: 2 };

export function isPlaceholderAmount(value: number | null | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return true;
  return value <= 0.011;
}

export function isPlaceholderInvoiceNumber(value: string | null | undefined): boolean {
  const ref = String(value ?? "").trim();
  return !ref || isInboxUploadExpenseReference(ref);
}

export function isPlaceholderExpenseDate(
  value: string | null | undefined,
  snapshot: Pick<InboxDraftSnapshot, "placeholderDate" | "createdOn">
): boolean {
  const current = String(value ?? "")
    .trim()
    .slice(0, 10);
  if (!current) return true;
  const placeholder = String(snapshot.placeholderDate ?? "").slice(0, 10);
  const created = String(snapshot.createdOn ?? "").slice(0, 10);
  return current === placeholder || (created !== "" && current === created);
}

function confidenceOf(
  extraction: InvoiceExtraction,
  field: keyof InvoiceExtraction["confidence"]
): FieldConfidence {
  const value = extraction.confidence[field];
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function usable(confidence: FieldConfidence): boolean {
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK.medium;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function flagEmptyField(
  attention: string[],
  field: string,
  wasEmpty: boolean,
  confidence: FieldConfidence,
  applied: boolean
): void {
  if (!wasEmpty) return;
  if (!applied || confidence !== "high") attention.push(field);
}

/**
 * Fill only empty or placeholder draft fields. Owner-entered values are left unchanged.
 */
export function mergeInvoiceExtraction(
  snapshot: InboxDraftSnapshot,
  extraction: InvoiceExtraction,
  vendors: readonly VendorCandidate[] = []
): OcrMergeResult {
  const patch: OcrMergePatch = {};
  const applied: string[] = [];
  const attention: string[] = [];
  const confidence: Record<string, FieldConfidence> = {
    vendor: confidenceOf(extraction, "vendor"),
    invoiceNumber: confidenceOf(extraction, "invoiceNumber"),
    invoiceDate: confidenceOf(extraction, "invoiceDate"),
    dueDate: confidenceOf(extraction, "dueDate"),
    subtotal: confidenceOf(extraction, "subtotal"),
    tax: confidenceOf(extraction, "tax"),
    total: confidenceOf(extraction, "total"),
  };

  const vendorConfidence = confidence.vendor ?? "low";
  const vendorMatch = matchVendorName(extraction.vendorName, vendors);
  const vendorEmpty = isPlaceholderVendor(snapshot.vendorName) && !snapshot.vendorId;
  if (vendorEmpty && extraction.vendorName && usable(vendorConfidence)) {
    if (vendorMatch.kind === "matched") {
      patch.vendorName = vendorMatch.name;
      patch.vendorId = vendorMatch.vendorId;
      patch.vendorSuggestion = null;
    } else {
      patch.vendorName = extraction.vendorName.slice(0, 160);
      patch.vendorSuggestion =
        vendorMatch.kind === "suggest_create" || vendorMatch.kind === "ambiguous"
          ? vendorMatch.name
          : extraction.vendorName.slice(0, 160);
    }
    applied.push("vendor");
  }
  if (
    vendorEmpty &&
    (vendorMatch.kind !== "matched" || vendorConfidence !== "high" || !patch.vendorName)
  ) {
    attention.push("vendor");
  }

  const invoiceConfidence = confidence.invoiceNumber ?? "low";
  const invoice = String(extraction.invoiceNumber ?? "").trim();
  if (
    invoice &&
    !isInboxUploadExpenseReference(invoice) &&
    usable(invoiceConfidence) &&
    isPlaceholderInvoiceNumber(snapshot.referenceNo)
  ) {
    patch.referenceNo = invoice.slice(0, 80);
    applied.push("invoiceNumber");
  }
  flagEmptyField(
    attention,
    "invoiceNumber",
    isPlaceholderInvoiceNumber(snapshot.referenceNo),
    invoiceConfidence,
    applied.includes("invoiceNumber")
  );

  const dateConfidence = confidence.invoiceDate ?? "low";
  if (
    extraction.invoiceDate &&
    usable(dateConfidence) &&
    isPlaceholderExpenseDate(snapshot.expenseDate, snapshot)
  ) {
    patch.expenseDate = extraction.invoiceDate;
    applied.push("invoiceDate");
  }
  flagEmptyField(
    attention,
    "invoiceDate",
    isPlaceholderExpenseDate(snapshot.expenseDate, snapshot),
    dateConfidence,
    applied.includes("invoiceDate")
  );

  const dueConfidence = confidence.dueDate ?? "low";
  if (extraction.dueDate && usable(dueConfidence) && !snapshot.dueDate) {
    patch.dueDate = extraction.dueDate;
    applied.push("dueDate");
  } else if (!snapshot.dueDate && !extraction.dueDate) {
    attention.push("dueDate");
  } else if (dueConfidence !== "high" && !snapshot.dueDate) {
    attention.push("dueDate");
  }

  const subtotalConfidence = confidence.subtotal ?? "low";
  if (extraction.subtotal != null && usable(subtotalConfidence) && snapshot.subtotal == null) {
    patch.subtotal = roundMoney(extraction.subtotal);
    applied.push("subtotal");
  }

  const taxConfidence = confidence.tax ?? "low";
  if (extraction.tax != null && usable(taxConfidence) && snapshot.tax == null) {
    patch.tax = roundMoney(extraction.tax);
    applied.push("tax");
  }

  const totalConfidence = confidence.total ?? "low";
  const singleLine = snapshot.lineCount <= 1;
  const totalWasEmpty = singleLine && isPlaceholderAmount(snapshot.lineAmount);
  if (extraction.total != null && usable(totalConfidence) && totalWasEmpty) {
    patch.lineAmount = roundMoney(extraction.total);
    applied.push("total");
  }
  flagEmptyField(attention, "total", totalWasEmpty, totalConfidence, applied.includes("total"));

  const subtotal = patch.subtotal ?? snapshot.subtotal;
  const tax = patch.tax ?? snapshot.tax;
  const total = patch.lineAmount ?? snapshot.lineAmount;
  if (
    subtotal != null &&
    tax != null &&
    total != null &&
    Math.abs(roundMoney(subtotal + tax) - roundMoney(total)) > 0.02
  ) {
    attention.push("totals");
  }

  return {
    patch,
    applied,
    attention: [...new Set(attention)],
    confidence,
    vendorMatch,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 9_999_999) return null;
  const rounded = Math.round(numeric * 100) / 100;
  if (rounded >= 1900 && rounded <= 2100 && Number.isInteger(rounded)) return null;
  return rounded;
}

function parseIsoDate(value: unknown, allowFuture: boolean, todayYmd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 2000
  ) {
    return null;
  }
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  if (!allowFuture && iso > todayYmd) return null;
  return iso;
}

function parseConfidence(value: unknown): FieldConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

export function parseInvoiceExtraction(raw: unknown, todayYmd: string): InvoiceExtraction | null {
  const record = asRecord(raw);
  if (!record) return null;
  const confidence = asRecord(record.confidence) ?? {};
  const vendor = String(record.vendor_name ?? record.vendorName ?? "").trim();
  const invoiceNumber = String(record.invoice_number ?? record.invoiceNumber ?? "")
    .trim()
    .slice(0, 80);
  return {
    vendorName: vendor && !/^unknown$/i.test(vendor) ? vendor.slice(0, 160) : null,
    invoiceNumber: invoiceNumber || null,
    invoiceDate: parseIsoDate(
      record.invoice_date ?? record.purchase_date ?? record.invoiceDate,
      false,
      todayYmd
    ),
    dueDate: parseIsoDate(record.due_date ?? record.dueDate, true, todayYmd),
    subtotal: parseMoney(record.subtotal),
    tax: parseMoney(record.tax_amount ?? record.tax),
    total: parseMoney(record.total_amount ?? record.total),
    confidence: {
      vendor: parseConfidence(confidence.vendor),
      invoiceNumber: parseConfidence(confidence.invoiceNumber ?? confidence.invoice_number),
      invoiceDate: parseConfidence(confidence.invoiceDate ?? confidence.date),
      dueDate: parseConfidence(confidence.dueDate ?? confidence.due_date),
      subtotal: parseConfidence(confidence.subtotal),
      tax: parseConfidence(confidence.tax),
      total: parseConfidence(confidence.total ?? confidence.amount),
    },
  };
}

export function openAiInvoiceOcrPrompt(): string {
  return `Extract ONE vendor invoice from this file. A multi-page PDF is still one invoice, not one invoice per page. Reply with ONLY a JSON object with these keys:
vendor_name (string),
invoice_number (string or null),
invoice_date (YYYY-MM-DD or null),
due_date (YYYY-MM-DD or null; due dates may be in the future),
subtotal (number or null),
tax_amount (number or null),
total_amount (number, the amount due; never the subtotal alone),
confidence (object with vendor, invoiceNumber, invoiceDate, dueDate, subtotal, tax, total each high|medium|low).
Use null when a field is not visible. Do not invent values.`;
}

export function openAiInvoiceContentPart(input: {
  mimeType: string;
  base64: string;
  fileName: string;
}): Record<string, unknown> {
  const mime = input.mimeType.toLowerCase();
  if (mime === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf")) {
    return {
      type: "file",
      file: {
        filename: input.fileName || "invoice.pdf",
        file_data: `data:application/pdf;base64,${input.base64}`,
      },
    };
  }
  const imageMime = mime.startsWith("image/") ? mime : "image/jpeg";
  return {
    type: "image_url",
    image_url: { url: `data:${imageMime};base64,${input.base64}` },
  };
}
