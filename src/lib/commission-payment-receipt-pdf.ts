/**
 * Client-side commission payment receipt PDF (jsPDF). A4, black & white, print-friendly.
 */

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
};

const COMPANY_LINE1 = "HH Construction";
const COMPANY_LINE2 = "Hawaii, USA";

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

export async function generateCommissionReceiptPdf(
  input: CommissionReceiptPdfInput
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const left = 24;
  const right = pageW - 24;
  let y = 22;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(COMPANY_LINE1, left, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(COMPANY_LINE2, left, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("COMMISSION PAYMENT RECEIPT", left, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Receipt No: ${commissionReceiptNo(input.paymentId)}`, left, y);
  y += 6;
  doc.text(`Date: ${input.paymentDate || "—"}`, left, y);
  y += 10;

  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(left, y, right, y);
  y += 8;

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
