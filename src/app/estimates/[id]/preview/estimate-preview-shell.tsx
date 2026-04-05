"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

type Props = {
  estimateId: string;
  estimateNumber: string;
  children: React.ReactNode;
};

function safePdfFilename(number: string) {
  return `Estimate-${number.replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function EstimatePreviewShell({ estimateId, estimateNumber, children }: Props) {
  const exportRef = React.useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const handleDownloadPdf = async () => {
    const el = exportRef.current;
    if (!el) return;
    setPdfBusy(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: safePdfFilename(estimateNumber),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (e) {
      console.error(e);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[8.5in] px-4 py-4 print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" className="btn-outline-ghost rounded-sm h-8" asChild>
          <Link href={`/estimates/${estimateId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to estimate
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="rounded-sm h-8" asChild>
          <a href={`/estimates/${estimateId}/print`} target="_blank" rel="noopener noreferrer">
            Print
          </a>
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
          {pdfBusy ? "Generating…" : "Download PDF"}
        </Button>
        <span className="text-xs text-muted-foreground">
          PDF matches the preview below (A4). Or use Print → Save as PDF.
        </span>
      </div>

      <div ref={exportRef} className="bg-white">
        {children}
      </div>
    </div>
  );
}
