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

  await html2pdf()
    .set({
      margin: [0.4, 0.4, 0.4, 0.4],
      filename: paymentReceiptPdfFilename(receiptNo),
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
