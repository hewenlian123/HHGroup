"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { ArrowLeft, Download, Loader2, Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  estimateId: string;
  estimateNumber: string;
  children: React.ReactNode;
};

const MIN_PREVIEW_SCALE = 0.35;
const MAX_PREVIEW_SCALE = 1.25;

export function EstimatePreviewShell({ estimateId, estimateNumber, children }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [fitMode, setFitMode] = React.useState(true);
  const [scale, setScale] = React.useState(1);
  const [paperSize, setPaperSize] = React.useState({ width: 794, height: 1123 });
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const paperLayerRef = React.useRef<HTMLDivElement>(null);
  const pdfDownloadInFlightRef = React.useRef(false);
  const pdfDownloadHref = `/api/estimates/${estimateId}/pdf`;

  const measurePreview = React.useCallback((): void => {
    const viewport = viewportRef.current;
    const paperLayer = paperLayerRef.current;
    if (!viewport || !paperLayer) return;
    const width = Math.max(1, paperLayer.scrollWidth);
    const height = Math.max(1, paperLayer.scrollHeight);
    setPaperSize((current) =>
      current.width === width && current.height === height ? current : { width, height }
    );
    if (fitMode) {
      const nextScale = Math.max(
        MIN_PREVIEW_SCALE,
        Math.min(1, (viewport.clientWidth - 2) / width)
      );
      setScale((current) => (Math.abs(current - nextScale) < 0.005 ? current : nextScale));
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
      router.push(`/estimates/${estimateId}`);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [estimateId, router]);

  const setManualScale = (nextScale: number): void => {
    setFitMode(false);
    setScale(Math.max(MIN_PREVIEW_SCALE, Math.min(MAX_PREVIEW_SCALE, nextScale)));
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
    <div className="estimate-preview-shell mx-auto w-full px-3 py-5 print:px-0 print:py-0">
      <div className="estimate-preview-toolbar mx-auto mb-5 flex max-w-[8.5in] flex-wrap items-center gap-2 print:hidden">
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
            aria-disabled={downloadingPdf}
            tabIndex={downloadingPdf ? -1 : undefined}
            className={cn(downloadingPdf && "pointer-events-none opacity-70")}
          >
            {downloadingPdf ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            {downloadingPdf ? "Generating PDF…" : "Download PDF"}
          </a>
        </Button>
        <div className="ml-auto flex items-center gap-1" aria-label="Preview zoom controls">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-sm sm:h-8 sm:w-8"
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
            className="h-11 min-w-[5.75rem] rounded-sm sm:h-8"
            onClick={() => {
              setFitMode(true);
              requestAnimationFrame(measurePreview);
            }}
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
            className="h-11 w-11 rounded-sm sm:h-8 sm:w-8"
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
        <p className="basis-full text-xs text-muted-foreground">
          {estimateNumber} · Letter preview · Press Esc to return
        </p>
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
