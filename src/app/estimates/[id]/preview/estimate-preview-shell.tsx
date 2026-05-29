"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { ArrowLeft, Download } from "lucide-react";

type Props = {
  estimateId: string;
  estimateNumber: string;
  children: React.ReactNode;
};

export function EstimatePreviewShell({ estimateId, children }: Props) {
  const { toast } = useToast();
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const pdfDownloadHref = `/api/estimates/${estimateId}/pdf`;

  const handleDownloadPdf = React.useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (downloadingPdf) return;

      setDownloadingPdf(true);
      try {
        const response = await fetch(pdfDownloadHref);
        if (!response.ok) {
          let message = "PDF download failed.";
          try {
            const body: unknown = await response.json();
            if (
              body &&
              typeof body === "object" &&
              "message" in body &&
              typeof (body as { message: unknown }).message === "string"
            ) {
              message = (body as { message: string }).message;
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(message);
        }

        const blob = await response.blob();
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const filenameMatch = disposition.match(/filename="([^"]+)"/);
        const filename = filenameMatch?.[1] ?? "Estimate.pdf";

        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "PDF download failed.";
        toast({
          title: "PDF download failed",
          description: `${message} Use Print above to save a PDF from your browser.`,
          variant: "error",
        });
      } finally {
        setDownloadingPdf(false);
      }
    },
    [downloadingPdf, pdfDownloadHref, toast]
  );

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
        <Button variant="outline" size="sm" className="rounded-sm h-8" asChild>
          <a
            href={pdfDownloadHref}
            download
            onClick={(event) => {
              void handleDownloadPdf(event);
            }}
            aria-busy={downloadingPdf}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {downloadingPdf ? "Generating PDF…" : "Download PDF"}
          </a>
        </Button>
        <span className="text-xs text-muted-foreground">
          A4 preview below. Download PDF saves a vector file from the same print layout. If download
          fails, use Print.
        </span>
      </div>

      <div data-testid="estimate-pdf-export" className="estimate-pdf-export">
        {children}
      </div>
    </div>
  );
}
