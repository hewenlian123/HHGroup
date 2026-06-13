/**
 * Client-side PDF export for worker payment receipts (A4, portrait).
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
  const wrapper = document.createElement("div");
  const captureElement = element.cloneNode(true) as HTMLElement;
  const a4MarginPt = 28.35; // 10mm in PDF points.
  captureElement.classList.add("receipt-pdf-capture");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "190mm";
  wrapper.style.background = "#ffffff";
  wrapper.style.pointerEvents = "none";
  captureElement.style.width = "190mm";
  captureElement.style.maxWidth = "190mm";
  captureElement.style.minHeight = "calc(277mm - 1px)";
  captureElement.style.aspectRatio = "auto";
  captureElement.style.margin = "0";
  wrapper.appendChild(captureElement);
  document.body.appendChild(wrapper);

  try {
    await html2pdf()
      .set({
        // A4 page with 10mm printable margins; the capture clone uses the matching 190mm width.
        margin: [a4MarginPt, a4MarginPt, a4MarginPt, a4MarginPt],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2.75,
          useCORS: true,
          logging: false,
          letterRendering: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      })
      .from(captureElement)
      .save();
  } finally {
    wrapper.remove();
  }
}
