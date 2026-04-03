/**
 * Client-side commission payment receipt PDF (jsPDF). Black & white, print-friendly.
 */

export type CommissionReceiptPdfInput = {
  paymentId: string;
  paymentDate: string;
  personName: string;
  projectName: string;
  commissionAmount: number;
  paymentAmount: number;
  paymentMethod: string;
  notes: string | null;
};

const COMPANY = "HH Construction";

function receiptNoFromPaymentId(paymentId: string): string {
  const compact = paymentId.replace(/-/g, "").toUpperCase();
  return `RCP-${compact.slice(0, 12)}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateCommissionReceiptPdf(
  input: CommissionReceiptPdfInput
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 22;
  const right = pageW - 22;
  let y = 18;

  // Simple monogram mark (no raster logo asset).
  doc.setDrawColor(0);
  doc.setLineWidth(0.35);
  doc.rect(left, y - 2, 11, 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("HH", left + 2.2, y + 5.2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(0, 0, 0);
  doc.text(COMPANY, left + 14, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Commission Payment Receipt", left + 14, y + 10);

  y += 22;
  doc.setDrawColor(40);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RECEIPT", left, y);
  y += 9;

  const rows: [string, string][] = [
    ["Receipt No.", receiptNoFromPaymentId(input.paymentId)],
    ["Date", input.paymentDate || "—"],
    ["Payee", input.personName?.trim() || "—"],
    ["Project", input.projectName?.trim() || "—"],
    ["Commission amount", `$${money(input.commissionAmount)}`],
    ["Payment amount", `$${money(input.paymentAmount)}`],
    ["Payment method", input.paymentMethod?.trim() || "—"],
  ];

  doc.setFontSize(10);
  const labelW = 48;
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, right - left - labelW - 6);
    doc.text(lines, left + labelW, y);
    y += Math.max(7, lines.length * 5);
  }

  doc.setFont("helvetica", "bold");
  doc.text("Notes", left, y + 2);
  y += 7;
  doc.setFont("helvetica", "normal");
  const noteText = input.notes?.trim() ? input.notes.trim() : "—";
  const noteLines = doc.splitTextToSize(noteText, right - left);
  doc.text(noteLines, left, y);
  y += noteLines.length * 5 + 14;

  doc.setDrawColor(40);
  doc.line(left, y, right, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text("This document confirms a commission payment record. Retain for your records.", left, y);

  return doc.output("blob");
}

/**
 * Open PDF in a new tab so the user can print or save (browser PDF viewer).
 */
export function openCommissionReceiptPdfInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-receipt-${Date.now()}.pdf`;
    a.rel = "noopener noreferrer";
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 180_000);
}
