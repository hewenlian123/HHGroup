/**
 * Client-side PDF export for worker payment receipts (US Letter, portrait).
 * Uses html2pdf.js — no new window, no navigation.
 */

export function sanitizeReceiptNoForFilename(receiptNo: string): string {
  const s = receiptNo
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  return s || "Receipt";
}

/** Filename: Receipt-{编号}.pdf */
export function workerPaymentReceiptPdfFilename(receiptNo: string): string {
  return `Receipt-${sanitizeReceiptNoForFilename(receiptNo)}.pdf`;
}

/**
 * Renders only the given element (the receipt root, e.g. `.receipt-container`) to a PDF and triggers download.
 */
export async function downloadWorkerPaymentReceiptPdf(
  element: HTMLElement,
  receiptNo: string
): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const filename = workerPaymentReceiptPdfFilename(receiptNo);

  await html2pdf()
    .set({
      // US Letter margins ~0.4in; unit matches jsPDF
      margin: [0.4, 0.4, 0.4, 0.4],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2.75,
        useCORS: true,
        logging: false,
        letterRendering: true,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    })
    .from(element)
    .save();
}
