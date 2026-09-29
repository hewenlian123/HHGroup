import { isInboxUploadExpenseReference } from "@/lib/inbox-upload-constants";
import { isPlaceholderVendor, vendorsAreSimilar } from "@/lib/expense-vendor-match";

export type ExpenseDuplicateSubject = {
  id: string;
  vendorName: string;
  vendorId: string | null;
  referenceNo: string | null;
  total: number;
  date: string;
};

export type ExpenseDuplicateHit = {
  expenseId: string;
  reason: "vendor_invoice" | "amount_date_vendor";
  message: string;
};

function invoiceKey(value: string | null | undefined): string {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text || isInboxUploadExpenseReference(text)) return "";
  return text.replace(/\s+/g, "");
}

function dayNumber(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function sameVendor(left: ExpenseDuplicateSubject, right: ExpenseDuplicateSubject): boolean {
  if (left.vendorId && right.vendorId && left.vendorId === right.vendorId) return true;
  if (isPlaceholderVendor(left.vendorName) || isPlaceholderVendor(right.vendorName)) return false;
  return vendorsAreSimilar(left.vendorName, right.vendorName);
}

function moneyClose(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.009;
}

/**
 * Server-side duplicate rules:
 * same vendor + invoice number, or same total within 3 calendar days and a similar vendor.
 */
export function findExpenseDuplicate(
  subject: ExpenseDuplicateSubject,
  others: readonly ExpenseDuplicateSubject[]
): ExpenseDuplicateHit | null {
  const invoice = invoiceKey(subject.referenceNo);
  const subjectDay = dayNumber(subject.date);
  let amountHit: ExpenseDuplicateHit | null = null;

  for (const other of others) {
    if (!other.id || other.id === subject.id) continue;
    if (!sameVendor(subject, other)) continue;

    const otherInvoice = invoiceKey(other.referenceNo);
    if (invoice && otherInvoice && invoice === otherInvoice) {
      return {
        expenseId: other.id,
        reason: "vendor_invoice",
        message: `Invoice ${subject.referenceNo?.trim()} already exists for this vendor.`,
      };
    }

    if (amountHit || subjectDay == null) continue;
    const otherDay = dayNumber(other.date);
    if (otherDay == null || Math.abs(subjectDay - otherDay) > 3) continue;
    if (!moneyClose(subject.total, other.total) || subject.total <= 0.011) continue;
    amountHit = {
      expenseId: other.id,
      reason: "amount_date_vendor",
      message: `Same vendor, total, and a date within 3 days of ${subject.date}.`,
    };
  }

  return amountHit;
}
