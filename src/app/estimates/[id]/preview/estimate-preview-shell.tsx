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
      el.classList.add("estimate-pdf-exporting");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const html2pdf = (await import("html2pdf.js")).default;
      const pdfOptions = {
        margin: [0, 0, 0, 0],
        filename: safePdfFilename(estimateNumber),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
        },
        pagebreak: {
          mode: ["css"],
          avoid: [
            ".estimate-final-packet-section",
            ".estimate-payment-row",
            ".estimate-signature-block",
          ],
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      } as Record<string, unknown>;
      await html2pdf().set(pdfOptions).from(el).save();
    } catch (e) {
      console.error(e);
    } finally {
      el.classList.remove("estimate-pdf-exporting");
      setPdfBusy(false);
    }
  };

  return (
    <div className="estimate-preview-shell mx-auto w-full px-3 py-5 print:px-0 print:py-0">
      <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-2 print:hidden">
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
          A4 preview below. Use Print → Save as PDF for the closest browser output.
        </span>
      </div>

      <div ref={exportRef} data-testid="estimate-pdf-export" className="estimate-pdf-export">
        {children}
      </div>
    </div>
  );
}
