"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MaterialSelectionPreviewShell({
  selectionId,
  children,
}: {
  selectionId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="material-selection-a4-shell mx-auto w-full max-w-[calc(210mm+3rem)] px-3 py-5 sm:px-6 print:px-0 print:py-0"
      data-hh-context="viewer"
      data-hh-theme="operational-light"
    >
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-hh-compact" asChild>
            <Link href={`/materials/${selectionId}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Back to selection
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-hh-compact"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" aria-hidden />
            Print
          </Button>
          <Button variant="outline" size="sm" className="rounded-hh-compact" asChild>
            <Link href={`/api/materials/${selectionId}/pdf`}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Download PDF
            </Link>
          </Button>
        </div>
        <span className="text-xs text-[var(--hh-text-secondary)]">A4 print preview</span>
      </div>
      <div className="flex justify-center shadow-[0_18px_55px_rgba(15,23,42,0.12)] print:shadow-none">
        <div
          className="inline-block bg-white"
          data-hh-context="paper"
          data-hh-theme="document-light"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
