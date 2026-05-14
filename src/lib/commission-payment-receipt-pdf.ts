/**
 * Client-side commission payment receipt PDF (jsPDF). A4, black & white, print-friendly.
 */

import {
  addDocumentCompanyPdfFooter,
  addDocumentCompanyPdfHeader,
  DOCUMENT_COMPANY_FALLBACK,
  normalizeDocumentCompanyProfile,
} from "@/lib/document-company-pdf";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";

export type CommissionReceiptPdfInput = {
  paymentId: string;
  paymentDate: string;
  personName: string;
  projectName: string;
  role: string;
  commissionAmount: number;
  paymentAmount: number;
  paymentMethod: string;
  notes: string | null;
  company?: Partial<DocumentCompanyProfileDTO> | null;
};

function compactId(paymentId: string): string {
  return paymentId.replace(/-/g, "").toUpperCase();
}

export function commissionReceiptNo(paymentId: string): string {
  return `RCPT-${compactId(paymentId).slice(0, 8)}`;
}

export function commissionReferenceNo(paymentId: string): string {
  return `#${compactId(paymentId).slice(0, 8)}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type CompanyProfileApiRow = {
  org_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  license_number?: string | null;
  tax_id?: string | null;
  invoice_footer?: string | null;
  default_terms?: string | null;
  notes?: string | null;
  logo_url?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function profileRowToDocumentCompany(row: CompanyProfileApiRow): DocumentCompanyProfileDTO {
  const addressLines = [
    [row.address1?.trim(), row.address2?.trim()].filter(Boolean).join(", "),
    [[row.city?.trim(), row.state?.trim()].filter(Boolean).join(", "), row.zip?.trim()]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean);
  return normalizeDocumentCompanyProfile({
    companyName: row.org_name ?? DOCUMENT_COMPANY_FALLBACK.companyName,
    phone: row.phone ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    licenseNumber: row.license_number ?? null,
    taxId: row.tax_id ?? null,
    invoiceFooter: row.invoice_footer ?? null,
    defaultTerms: row.default_terms ?? null,
    notes: row.notes ?? null,
    logoUrl: row.logo_url ?? null,
    addressLines,
  });
}

export async function fetchCommissionReceiptCompanyProfile(): Promise<DocumentCompanyProfileDTO> {
  try {
    const res = await fetch("/api/settings/company-profile", { cache: "no-store" });
    if (!res.ok) return DOCUMENT_COMPANY_FALLBACK;
    const json = (await res.json()) as { ok?: boolean; profile?: CompanyProfileApiRow };
    return json.ok && json.profile
      ? profileRowToDocumentCompany(json.profile)
      : DOCUMENT_COMPANY_FALLBACK;
  } catch {
    return DOCUMENT_COMPANY_FALLBACK;
  }
}

export async function generateCommissionReceiptPdf(
  input: CommissionReceiptPdfInput
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 24;
  const right = pageW - 24;
  const company = normalizeDocumentCompanyProfile(input.company);
  let y = await addDocumentCompanyPdfHeader(doc, company, {
    title: "COMMISSION PAYMENT RECEIPT",
    documentNo: commissionReceiptNo(input.paymentId),
    documentNoLabel: "Receipt No",
    documentDate: input.paymentDate || "—",
    y: 16,
    left,
    right,
  });

  doc.setFont("helvetica", "bold");
  const block: [string, string][] = [
    ["Project:", input.projectName?.trim() || "—"],
    ["Person:", input.personName?.trim() || "—"],
    ["Role:", input.role?.trim() || "—"],
  ];
  doc.setFontSize(10);
  const lw = 38;
  for (const [label, val] of block) {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(val, right - left - lw - 4);
    doc.text(lines, left + lw, y);
    y += Math.max(6, lines.length * 5);
  }
  y += 4;
  doc.line(left, y, right, y);
  y += 8;

  const amounts: [string, string][] = [
    ["Commission Amount:", `$${money(input.commissionAmount)}`],
    ["Payment Amount:", `$${money(input.paymentAmount)}`],
    ["Payment Method:", input.paymentMethod?.trim() || "—"],
    ["Reference No:", commissionReferenceNo(input.paymentId)],
    ["Notes:", input.notes?.trim() ? input.notes.trim() : "—"],
  ];
  for (const [label, val] of amounts) {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(val, right - left - lw - 4);
    doc.text(lines, left + lw, y);
    y += Math.max(6, lines.length * 5);
  }

  y += 6;
  doc.line(left, y, right, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.text("Thank you for your work.", left, y);
  y += 8;
  addDocumentCompanyPdfFooter(doc, company, { y, left, maxWidth: right - left });

  return doc.output("blob");
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener noreferrer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Open PDF blob in a new tab and trigger print (user can also save from viewer). */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (w) {
    const tryPrint = () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    };
    w.addEventListener("load", () => setTimeout(tryPrint, 400));
    setTimeout(tryPrint, 800);
  }
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

export function printAndDownloadCommissionReceipt(blob: Blob, paymentId: string): void {
  const name = `${commissionReceiptNo(paymentId)}.pdf`;
  downloadPdfBlob(blob, name);
  printPdfBlob(blob);
}
