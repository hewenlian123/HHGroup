"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type InvoicePreviewShellProps = {
  invoiceId: string;
  invoiceNo: string;
  children: React.ReactNode;
};

function safePdfFilename(invoiceNo: string): string {
  return `Invoice-${invoiceNo.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function InvoicePreviewShell({ invoiceId, invoiceNo, children }: InvoicePreviewShellProps) {
  const searchParams = useSearchParams();
  const exportRef = React.useRef<HTMLDivElement>(null);
  const autoDownloadStarted = React.useRef(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const handleDownloadPdf = React.useCallback(async () => {
    const el = exportRef.current;
    if (!el) return;
    el.classList.add("invoice-exporting-pdf");
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 0,
          filename: safePdfFilename(invoiceNo),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
            windowWidth: 1123,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
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
    <div className="invoice-a4-shell financial-nums mx-auto w-full max-w-[210mm] px-3 py-5 sm:px-6 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="btn-outline-ghost rounded-sm h-8" asChild>
            <Link href={`/financial/invoices/${invoiceId}`} data-testid="invoice-preview-back-link">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to invoice
            </Link>
          </Button>
          <div className="h-5 w-px bg-gray-200" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-sm h-8"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-sm h-8"
            disabled={pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {pdfBusy ? "Generating..." : "Download PDF"}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">A4 PDF preview</span>
      </div>

      <div className="shadow-[0_18px_55px_rgba(15,23,42,0.08)] print:shadow-none">
        <div ref={exportRef} className="bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}
