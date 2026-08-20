"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";

export function PrintActionBar({
  estimateId,
  estimateNumber,
  returnHref,
  documentStyle,
}: {
  estimateId: string;
  estimateNumber: string;
  returnHref?: string | null;
  documentStyle: EstimateDocumentStyle;
}) {
  const modeLabel = documentStyle === "proposal" ? "Proposal" : "Itemized";
  return (
    <div className="estimate-print-action-bar print:hidden relative z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div className="estimate-print-action-bar__context flex min-w-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="estimate-preview-tool-button min-h-11"
          asChild
        >
          <Link href={returnHref ?? `/estimates/${estimateId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {returnHref ? "Back to preview" : "Back to estimate"}
          </Link>
        </Button>
        <span className="estimate-print-context-title">Print preview</span>
        <span className="estimate-print-context-identity tabular-nums">{estimateNumber}</span>
        <span className="estimate-preview-mode-badge rounded-full px-2 py-1 text-xs font-semibold">
          {modeLabel}
        </span>
      </div>
      <div className="estimate-print-action-bar__actions flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="estimate-preview-tool-button estimate-preview-tool-button--primary min-h-11"
          onClick={() => typeof window !== "undefined" && window.print()}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>
    </div>
  );
}
