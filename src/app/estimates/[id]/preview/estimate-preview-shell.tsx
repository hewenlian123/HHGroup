"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast/toast-provider";
import {
  ArrowLeft,
  Download,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import { appendEstimateReturnPath } from "@/app/estimates/_components/estimate-workflow-continuity";

type Props = {
  estimateId: string;
  estimateNumber: string;
  documentStyle: EstimateDocumentStyle;
  hiddenAmountCount: number;
  returnHref: string;
  previewHref: string;
  children: React.ReactNode;
};

const MIN_PREVIEW_SCALE = 0.35;
const MAX_PREVIEW_SCALE = 1.25;
const MOBILE_READABLE_SCALE = 0.6;

export function EstimatePreviewShell({
  estimateId,
  estimateNumber,
  documentStyle,
  hiddenAmountCount,
  returnHref,
  previewHref,
  children,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [fitMode, setFitMode] = React.useState(true);
  const [scale, setScale] = React.useState(1);
  const [paperSize, setPaperSize] = React.useState({ width: 794, height: 1123 });
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const paperLayerRef = React.useRef<HTMLDivElement>(null);
  const pdfDownloadInFlightRef = React.useRef(false);
  const hasInitializedScaleRef = React.useRef(false);
  const mobileReadableScaleRef = React.useRef(false);
  const pdfDownloadHref = `/api/estimates/${estimateId}/pdf`;
  const printHref = appendEstimateReturnPath(`/estimates/${estimateId}/print`, previewHref);
  const documentModeLabel = documentStyle === "proposal" ? "Proposal" : "Itemized";
  const documentModeDescription =
    documentStyle === "proposal"
      ? "Proposal output keeps line-item prices private."
      : hiddenAmountCount > 0
        ? `${hiddenAmountCount} line ${hiddenAmountCount === 1 ? "amount is" : "amounts are"} hidden on PDF.`
        : "Itemized output shows line-item pricing.";

  const measurePreview = React.useCallback((): void => {
    const viewport = viewportRef.current;
    const paperLayer = paperLayerRef.current;
    if (!viewport || !paperLayer) return;
    const width = Math.max(1, paperLayer.scrollWidth);
    const height = Math.max(1, paperLayer.scrollHeight);
    setPaperSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
    const fitScale = Math.max(MIN_PREVIEW_SCALE, Math.min(1, (viewport.clientWidth - 2) / width));

    if (!hasInitializedScaleRef.current) {
      hasInitializedScaleRef.current = true;
      if (window.innerWidth <= 700 && fitScale < MOBILE_READABLE_SCALE) {
        mobileReadableScaleRef.current = true;
        setFitMode(false);
        setScale(MOBILE_READABLE_SCALE);
        return;
      }
    }

    if (mobileReadableScaleRef.current) return;

    if (fitMode) {
      setScale((current) => (Math.abs(current - fitScale) < 0.005 ? current : fitScale));
    }
  }, [fitMode]);

  React.useLayoutEffect(() => {
    measurePreview();
    const viewport = viewportRef.current;
    const paperLayer = paperLayerRef.current;
    if (!viewport || !paperLayer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measurePreview);
    observer.observe(viewport);
    observer.observe(paperLayer);
    return () => observer.disconnect();
  }, [measurePreview]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const activeElement = document.activeElement;
      if (
        event.defaultPrevented ||
        activeElement?.closest('[role="menu"], [role="dialog"], [role="listbox"]')
      ) {
        return;
      }
      router.push(returnHref);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [returnHref, router]);

  const setManualScale = (nextScale: number): void => {
    mobileReadableScaleRef.current = false;
    setFitMode(false);
    setScale(Math.max(MIN_PREVIEW_SCALE, Math.min(MAX_PREVIEW_SCALE, nextScale)));
  };

  const fitPreview = (): void => {
    mobileReadableScaleRef.current = false;
    setFitMode(true);
    requestAnimationFrame(measurePreview);
  };

  const handleDownloadPdf = React.useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (downloadingPdf || pdfDownloadInFlightRef.current) return;

      pdfDownloadInFlightRef.current = true;
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
        pdfDownloadInFlightRef.current = false;
        setDownloadingPdf(false);
      }
    },
    [downloadingPdf, pdfDownloadHref, toast]
  );

  return (
    <div
      className="estimate-preview-shell mx-auto w-full px-3 py-5 print:px-0 print:py-0"
      role="region"
      aria-label={`${estimateNumber} ${documentModeLabel} preview`}
    >
      <div
        className="estimate-preview-toolbar mx-auto mb-5 max-w-[8.5in] print:hidden"
        role="toolbar"
        aria-label="Estimate preview actions"
      >
        <Button
          variant="outline"
          size="sm"
          className="estimate-preview-tool-button estimate-preview-back-button h-11"
          asChild
        >
          <Link
            href={returnHref}
            data-testid="estimate-preview-back-link"
            aria-label="Back to estimate"
            title="Back to estimate"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="estimate-preview-back-label">Back</span>
          </Link>
        </Button>

        <div
          className="estimate-preview-toolbar-context min-w-0"
          data-testid="estimate-preview-context"
        >
          <div className="estimate-preview-toolbar-context-line">
            <span className="estimate-preview-context-title">Preview</span>
            <span className="estimate-preview-context-identity tabular-nums">{estimateNumber}</span>
            <span
              data-testid="estimate-preview-document-mode"
              className="estimate-preview-mode-badge rounded-full px-2 py-1 font-semibold"
            >
              {documentModeLabel}
            </span>
            <span className="estimate-preview-context-format">Letter</span>
          </div>
          <span className="estimate-preview-context-description">{documentModeDescription}</span>
        </div>

        <div
          className="estimate-preview-primary-actions"
          role="group"
          aria-label="Print and PDF actions"
        >
          <Button
            variant="outline"
            size="sm"
            className="estimate-preview-tool-button estimate-preview-print-action h-11"
            asChild
          >
            <a
              href={printHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Print"
              title="Open print view"
            >
              <Printer className="h-4 w-4" />
              <span className="estimate-preview-action-label">Print</span>
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="estimate-preview-tool-button estimate-preview-tool-button--primary h-11 justify-center"
            asChild
          >
            <a
              href={pdfDownloadHref}
              download
              onClick={(event) => {
                void handleDownloadPdf(event);
              }}
              aria-label={downloadingPdf ? "Generating PDF" : "Download PDF"}
              aria-busy={downloadingPdf}
              aria-disabled={downloadingPdf}
              title="Download PDF"
              tabIndex={downloadingPdf ? -1 : undefined}
              className={cn(downloadingPdf && "pointer-events-none opacity-70")}
            >
              {downloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="estimate-preview-action-label estimate-preview-action-label--download">
                {downloadingPdf ? "Generating…" : "Download PDF"}
              </span>
              <span className="estimate-preview-action-label-compact" aria-hidden>
                PDF
              </span>
            </a>
          </Button>
        </div>

        <div className="estimate-preview-overflow">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="estimate-preview-tool-button h-11 w-11"
                aria-label="More preview actions"
                title="More preview actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="estimate-preview-overflow-menu w-52"
            >
              <DropdownMenuLabel className="estimate-preview-overflow-label">
                <span>Preview controls</span>
                <span className="tabular-nums">{Math.round(scale * 100)}%</span>
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="estimate-preview-overflow-item min-h-11">
                <a href={printHref} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" />
                  Print
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="estimate-preview-overflow-separator" />
              <DropdownMenuItem
                className="estimate-preview-overflow-item min-h-11"
                onSelect={() => setManualScale(scale - 0.1)}
                disabled={scale <= MIN_PREVIEW_SCALE}
              >
                <Minus className="h-4 w-4" />
                Zoom out
              </DropdownMenuItem>
              <DropdownMenuItem
                className="estimate-preview-overflow-item min-h-11"
                onSelect={fitPreview}
              >
                <Maximize2 className="h-4 w-4" />
                Fit page
              </DropdownMenuItem>
              <DropdownMenuItem
                className="estimate-preview-overflow-item min-h-11"
                onSelect={() => setManualScale(scale + 0.1)}
                disabled={scale >= MAX_PREVIEW_SCALE}
              >
                <Plus className="h-4 w-4" />
                Zoom in
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          className="estimate-preview-zoom-controls"
          role="group"
          aria-label="Preview zoom controls"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="estimate-preview-tool-button h-11 w-11"
            onClick={() => setManualScale(scale - 0.1)}
            aria-label="Zoom out"
            disabled={scale <= MIN_PREVIEW_SCALE}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="estimate-preview-tool-button h-11 min-w-[5.75rem]"
            onClick={fitPreview}
            aria-label="Fit pages"
            aria-pressed={fitMode}
          >
            <Maximize2 className="mr-1.5 h-4 w-4" />
            Fit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="estimate-preview-tool-button h-11 w-11"
            onClick={() => setManualScale(scale + 0.1)}
            aria-label="Zoom in"
            disabled={scale >= MAX_PREVIEW_SCALE}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <output className="w-12 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </output>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="estimate-preview-viewport"
        data-testid="estimate-preview-viewport"
      >
        <div
          className="estimate-preview-zoom-frame"
          style={{ width: paperSize.width * scale, height: paperSize.height * scale }}
        >
          <div
            ref={paperLayerRef}
            className="estimate-preview-zoom-layer"
            style={{ transform: `scale(${scale})` }}
          >
            <div data-testid="estimate-pdf-export" className="estimate-pdf-export">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
