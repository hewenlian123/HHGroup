export function sanitizePaymentReceiptNoForFilename(receiptNo: string): string {
  const s = receiptNo
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  return s || "Payment-Receipt";
}

export function paymentReceiptPdfFilename(receiptNo: string): string {
  return `Payment-Receipt-${sanitizePaymentReceiptNoForFilename(receiptNo)}.pdf`;
}

export async function downloadPaymentReceiptPdf(
  element: HTMLElement,
  receiptNo: string
): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const host = document.createElement("div");
  host.className = "payment-receipt-pdf-render-host";
  const clone = element.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    width: "190mm",
    maxWidth: "190mm",
    minHeight: "277mm",
    aspectRatio: "auto",
    margin: "0",
    padding: "0",
    border: "none",
    borderRadius: "0",
    boxShadow: "none",
    overflow: "visible",
  });
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: paymentReceiptPdfFilename(receiptNo),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2.75,
          useCORS: true,
          logging: false,
          letterRendering: true,
          backgroundColor: "#ffffff",
          windowWidth: Math.max(794, clone.scrollWidth),
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(clone)
      .save();
  } finally {
    host.remove();
  }
}
