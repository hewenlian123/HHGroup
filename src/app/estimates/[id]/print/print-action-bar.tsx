"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import type { EstimateRevisionContext } from "@/lib/estimates-db";

export function PrintActionBar({
  estimateId,
  estimateNumber,
  returnHref,
  documentStyle,
  revisionContext,
}: {
  estimateId: string;
  estimateNumber: string;
  returnHref?: string | null;
  documentStyle: EstimateDocumentStyle;
  revisionContext: EstimateRevisionContext;
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
        <span
          data-testid="estimate-revision-context"
          className="estimate-preview-revision-badge rounded-full px-2 py-1 text-xs font-semibold"
        >
          {revisionContext.isCurrent ? "Current revision" : "Historical revision · Read-only"}
        </span>
        <span className="estimate-preview-mode-badge rounded-full px-2 py-1 text-xs font-semibold">
          {modeLabel}
        </span>
      </div>
      <div className="estimate-print-action-bar__actions flex items-center gap-2">
        {revisionContext.previousRevisionId ? (
          <Button
            variant="outline"
            size="icon"
            className="estimate-preview-tool-button h-11 w-11"
            asChild
          >
            <Link
              href={`/estimates/${revisionContext.previousRevisionId}/print`}
              aria-label="Previous revision"
              title="Previous revision"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
        {revisionContext.nextRevisionId ? (
          <Button
            variant="outline"
            size="icon"
            className="estimate-preview-tool-button h-11 w-11"
            asChild
          >
            <Link
              href={`/estimates/${revisionContext.nextRevisionId}/print`}
              aria-label="Next revision"
              title="Next revision"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
        {!revisionContext.isCurrent &&
        revisionContext.currentRevisionId !== revisionContext.nextRevisionId ? (
          <Button
            variant="outline"
            size="sm"
            className="estimate-preview-tool-button hidden min-h-11 sm:inline-flex"
            asChild
          >
            <Link href={`/estimates/${revisionContext.currentRevisionId}/print`}>
              Current revision
            </Link>
          </Button>
        ) : null}
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
