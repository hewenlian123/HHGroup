/**
 * Server/client: full commission summary PDF (project, person, totals, payment history).
 * Minimal B&W layout; A4; uses company profile + optional logo.
 */

import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";

export type CommissionSummaryPaymentRow = {
  payment_date: string;
  amount: number;
  payment_method: string;
  note: string | null;
};

export type CommissionSummaryPdfInput = {
  company: DocumentCompanyProfileDTO;
  /** Raw base64 without data: prefix; PNG or JPEG only for jsPDF. */
  logoBase64: { base64: string; format: "PNG" | "JPEG" } | null;
  projectName: string;
  personName: string;
  role: string;
  commissionAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  payments: CommissionSummaryPaymentRow[];
};

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateNote(s: string | null, maxLen: number): string {
  if (s == null || !s.trim()) return "—";
  const t = s.trim();
  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;
}

/**
 * Returns PDF as ArrayBuffer (works in Node route handlers and browser).
 */
export async function generateCommissionSummaryPdfBuffer(
  input: CommissionSummaryPdfInput
): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 20;
  const right = pageW - 20;
  let y = 18;

  doc.setTextColor(35, 35, 35);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);

  const logo = input.logoBase64;
  let textStartX = left;
  if (logo) {
    try {
      const dataUrl = `data:image/${logo.format.toLowerCase()};base64,${logo.base64}`;
      const props = doc.getImageProperties(dataUrl);
      const maxW = 38;
      const maxH = 14;
      let iw = maxW;
      let ih = (props.height * iw) / props.width;
      if (ih > maxH) {
        ih = maxH;
        iw = (props.width * ih) / props.height;
      }
      doc.addImage(dataUrl, logo.format, left, y, iw, ih);
      textStartX = left + iw + 6;
    } catch {
      /* logo skip */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(input.company.companyName, textStartX, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let subY = y + 9;
  for (const line of input.company.addressLines.slice(0, 2)) {
    doc.text(line, textStartX, subY);
    subY += 3.5;
  }
  const contactBits = [input.company.phone, input.company.email].filter(Boolean).join(" · ");
  if (contactBits) {
    doc.text(contactBits, textStartX, subY);
    subY += 3.5;
  }

  y = Math.max(y + 16, subY + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Commission summary", left, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const labelW = 38;
  const rowGap = 5.2;
  const kv = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(label, left, y);
    doc.setTextColor(35, 35, 35);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(value, right - left - labelW - 2);
    doc.text(lines, left + labelW, y);
    y += Math.max(rowGap, lines.length * 4.2);
  };

  doc.setFont("helvetica", "normal");
  kv("Project", input.projectName?.trim() || "—");
  kv(
    "Person",
    `${input.personName?.trim() || "—"}${input.role?.trim() ? ` · ${input.role.trim()}` : ""}`
  );
  y += 2;
  doc.line(left, y, right, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Total commission", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(`$${money(input.commissionAmount)}`, right, y, { align: "right" });
  y += rowGap;
  doc.setFont("helvetica", "bold");
  doc.text("Paid to date", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(`$${money(input.paidAmount)}`, right, y, { align: "right" });
  y += rowGap;
  doc.setFont("helvetica", "bold");
  doc.text("Outstanding", left, y);
  doc.setFont("helvetica", "normal");
  doc.text(`$${money(input.outstandingAmount)}`, right, y, { align: "right" });
  y += 8;

  doc.line(left, y, right, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Payment history", left, y);
  y += 6;

  const colDate = left;
  const colAmt = right - 52;
  const colMethod = right - 34;
  const colNote = left + 52;
  const noteW = right - colNote;

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text("DATE", colDate, y);
  doc.text("AMOUNT", colAmt, y, { align: "right" });
  doc.text("METHOD", colMethod, y);
  doc.text("NOTE", colNote, y);
  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(left, y, right, y);
  y += 4.5;

  doc.setTextColor(45, 45, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const pageBottom = 285;
  for (const p of input.payments) {
    if (y > pageBottom - 12) {
      doc.addPage();
      y = 18;
    }
    const dateStr = p.payment_date ? String(p.payment_date).slice(0, 10) : "—";
    doc.text(dateStr, colDate, y);
    doc.text(`$${money(p.amount)}`, colAmt, y, { align: "right" });
    doc.text((p.payment_method || "—").slice(0, 14), colMethod, y);
    const noteLines = doc.splitTextToSize(truncateNote(p.note, 120), noteW);
    doc.text(noteLines, colNote, y);
    y += Math.max(5, noteLines.length * 3.8);
  }

  if (input.payments.length === 0) {
    doc.setTextColor(140, 140, 140);
    doc.setFontSize(8.5);
    doc.text("No payments recorded.", left, y);
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
