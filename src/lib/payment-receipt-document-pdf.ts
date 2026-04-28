/**
 * Server: single commission payment receipt PDF. Matches commission-summary-pdf styling (A4, B&W, logo + company).
 */

import type { jsPDF } from "jspdf";
import type { DocumentCompanyProfileDTO } from "@/lib/document-company-profile";

export type PaymentReceiptDocumentPdfInput = {
  company: DocumentCompanyProfileDTO;
  logoBase64: { base64: string; format: "PNG" | "JPEG" } | null;
  projectName: string;
  personName: string;
  role: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  note: string | null;
  commissionSummary: {
    commissionAmount: number;
    paidAmount: number;
    outstandingAmount: number;
  } | null;
};

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawCompanyHeader(
  doc: jsPDF,
  input: PaymentReceiptDocumentPdfInput,
  left: number,
  right: number,
  startY: number
): number {
  const y = startY;
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
      /* skip */
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

  return Math.max(y + 16, subY + 4);
}

export async function generatePaymentReceiptDocumentPdfBuffer(
  input: PaymentReceiptDocumentPdfInput
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

  y = drawCompanyHeader(doc, input, left, right, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Payment Receipt", left, y);
  y += 8;

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
  const dateStr = input.paymentDate ? String(input.paymentDate).slice(0, 10) : "—";
  kv("Project", input.projectName?.trim() || "—");
  kv(
    "Person",
    `${input.personName?.trim() || "—"}${input.role?.trim() ? ` · ${input.role.trim()}` : ""}`
  );
  kv("Payment date", dateStr);
  kv("Amount", `$${money(input.amount)}`);
  kv("Method", input.paymentMethod?.trim() || "—");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text("Note", left, y);
  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const noteText = input.note != null && input.note.trim() !== "" ? input.note.trim() : "—";
  const noteLines = doc.splitTextToSize(noteText, right - left - labelW - 2);
  doc.text(noteLines, left + labelW, y);
  y += Math.max(rowGap, noteLines.length * 4.2);

  y += 2;
  doc.line(left, y, right, y);
  y += 7;

  const sum = input.commissionSummary;
  if (sum) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Related commission", left, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const line = (a: string, b: string) => {
      doc.setFont("helvetica", "normal");
      doc.text(a, left, y);
      doc.text(b, right, y, { align: "right" });
      y += rowGap;
    };
    line("Total commission", `$${money(sum.commissionAmount)}`);
    line("Paid to date", `$${money(sum.paidAmount)}`);
    line("Outstanding", `$${money(sum.outstandingAmount)}`);
    y += 4;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
