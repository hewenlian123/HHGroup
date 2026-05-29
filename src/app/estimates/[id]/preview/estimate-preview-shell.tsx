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

export function EstimatePreviewShell({ estimateId, children }: Props) {
  const pdfDownloadHref = `/api/estimates/${estimateId}/pdf`;

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
          <a href={pdfDownloadHref} download>
            <Download className="h-4 w-4 mr-1.5" />
            Download PDF
          </a>
        </Button>
        <span className="text-xs text-muted-foreground">
          A4 preview below. Download PDF saves a vector file from the same print layout.
        </span>
      </div>

      <div data-testid="estimate-pdf-export" className="estimate-pdf-export">
        {children}
      </div>
    </div>
  );
}
