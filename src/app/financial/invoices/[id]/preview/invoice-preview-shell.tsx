"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  appendEstimateReturnPath,
  safeEstimateReturnPath,
} from "@/app/estimates/_components/estimate-workflow-continuity";

type InvoicePreviewShellProps = {
  invoiceId: string;
  invoiceNo: string;
  children: React.ReactNode;
};

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_ROUNDING_OVERFLOW_MM = 2;
const A4_EXPORT_WINDOW_WIDTH_PX = 1123;

function safePdfFilename(invoiceNo: string): string {
  return `Invoice-${invoiceNo.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function InvoicePreviewShell({ invoiceId, invoiceNo, children }: InvoicePreviewShellProps) {
  const searchParams = useSearchParams();
  const estimateReturnPath = safeEstimateReturnPath(searchParams.get("returnTo"));
  const invoiceReturnPath = appendEstimateReturnPath(
    `/financial/invoices/${invoiceId}`,
    estimateReturnPath
  );
  const invoiceDocumentRef = React.useRef<HTMLDivElement>(null);
  const autoDownloadStarted = React.useRef(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const handleDownloadPdf = React.useCallback(async () => {
    const el = invoiceDocumentRef.current;
    if (!el) return;
    el.classList.add("invoice-exporting-pdf");
    setPdfBusy(true);
    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: Math.max(A4_EXPORT_WINDOW_WIDTH_PX, el.scrollWidth),
      });
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const imageHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

      if (imageHeightMm <= A4_HEIGHT_MM + A4_ROUNDING_OVERFLOW_MM) {
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
      } else {
        const pageCanvasHeight = Math.floor((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);
        let renderedHeight = 0;
        let pageIndex = 0;

        while (renderedHeight < canvas.height) {
          const remainingHeight = canvas.height - renderedHeight;
          const remainingHeightMm = (remainingHeight * A4_WIDTH_MM) / canvas.width;
          if (pageIndex > 0 && remainingHeightMm <= A4_ROUNDING_OVERFLOW_MM) break;

          const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = sliceHeight;
          const context = slice.getContext("2d");
          if (!context) throw new Error("Unable to prepare invoice PDF page.");
          context.drawImage(
            canvas,
            0,
            renderedHeight,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
          );

          if (pageIndex > 0) pdf.addPage("a4", "portrait");
          pdf.addImage(
            slice.toDataURL("image/jpeg", 0.98),
            "JPEG",
            0,
            0,
            A4_WIDTH_MM,
            Math.min(A4_HEIGHT_MM, (sliceHeight * A4_WIDTH_MM) / canvas.width)
          );
          renderedHeight += sliceHeight;
          pageIndex += 1;
        }
      }

      pdf.save(safePdfFilename(invoiceNo));
    } finally {
      el.classList.remove("invoice-exporting-pdf");
      setPdfBusy(false);
    }
  }, [invoiceNo]);

  React.useEffect(() => {
    if (searchParams.get("download") !== "1" || autoDownloadStarted.current) return;
    autoDownloadStarted.current = true;
    const frame = window.requestAnimationFrame(() => {
      void handleDownloadPdf();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handleDownloadPdf, searchParams]);

  return (
    <div
      className="invoice-a4-shell financial-nums mx-auto w-full max-w-[calc(210mm+3rem)] px-3 py-5 sm:px-6 print:px-0 print:py-0"
      data-hh-context="viewer"
      data-hh-theme="neo-dark"
    >
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="btn-outline-ghost min-h-11 rounded-sm"
            asChild
          >
            <Link href={invoiceReturnPath} data-testid="invoice-preview-back-link">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to invoice
            </Link>
          </Button>
          {estimateReturnPath ? (
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost min-h-11 rounded-sm"
              asChild
            >
              <Link href={estimateReturnPath} data-testid="invoice-preview-return-to-estimate">
                Return to estimate
              </Link>
            </Button>
          ) : null}
          <div className="h-5 w-px bg-gray-200" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 rounded-sm"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 rounded-sm"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {pdfBusy ? "Generating..." : "Download PDF"}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">A4 PDF preview</span>
      </div>

      <div className="flex justify-center shadow-[0_18px_55px_rgba(15,23,42,0.08)] print:shadow-none">
        <div
          ref={invoiceDocumentRef}
          data-invoice-document-root
          data-hh-context="paper"
          data-hh-theme="document-light"
          className="inline-block bg-white"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
