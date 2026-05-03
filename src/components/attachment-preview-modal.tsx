"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineLoading, Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  classifyStorageUrlPrefix,
  preflightPreviewUrl,
  type PreviewUrlPreflightResult,
} from "@/lib/preview-url-preflight";

export type AttachmentPreviewFileType = "image" | "pdf";

export type AttachmentPreviewFileItem = {
  url: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
  /** Optional MIME for debug (e.g. receipt row `mime_type`). */
  mimeType?: string;
};

export function inferAttachmentPreviewType(
  fileName: string,
  fileUrl: string
): AttachmentPreviewFileType {
  const n = (fileName ?? "").toLowerCase();
  const u = (fileUrl ?? "").toLowerCase();
  if (n.endsWith(".pdf") || /\.pdf(\?|#|$)/i.test(u)) return "pdf";
  return "image";
}

export function isReceiptPreviewDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEBUG_RECEIPT_PREVIEW === "1"
  );
}

function safeDownloadName(name: string): string {
  const n = (name || "file").replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return n;
}

export async function downloadPreviewBlob(fileUrl: string, fileName: string): Promise<void> {
  const res = await fetch(fileUrl, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeDownloadName(fileName);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const DRAG_THRESHOLD = 72;
const SWIPE_TOUCH_MIN = 56;

type PreflightPhase = "idle" | "checking" | "ok" | "error";

function ReceiptPreviewImageArea({
  displayUrl,
  fileName,
  mimeHint,
  onRefreshPreviewUrl,
  downloadBusy,
  onDownload,
  defaultDownload,
}: {
  displayUrl: string;
  fileName: string;
  mimeHint?: string;
  onRefreshPreviewUrl?: () => Promise<string | null>;
  downloadBusy: boolean;
  onDownload?: () => void | Promise<void>;
  defaultDownload: () => void | Promise<void>;
}) {
  const showDebug = isReceiptPreviewDebugEnabled();
  const [preflightPhase, setPreflightPhase] = React.useState<PreflightPhase>("idle");
  const [preflightResult, setPreflightResult] = React.useState<PreviewUrlPreflightResult | null>(
    null
  );
  const [imgPhase, setImgPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [imgErrorDetail, setImgErrorDetail] = React.useState<string | null>(null);
  const [naturalSize, setNaturalSize] = React.useState({ w: 0, h: 0 });
  const [retryKey, setRetryKey] = React.useState(0);
  const [localUrl, setLocalUrl] = React.useState(displayUrl);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerH, setContainerH] = React.useState(0);
  const onRefreshRef = React.useRef(onRefreshPreviewUrl);
  onRefreshRef.current = onRefreshPreviewUrl;

  React.useEffect(() => {
    setLocalUrl(displayUrl);
    setRetryKey(0);
    setImgPhase("loading");
    setImgErrorDetail(null);
    setNaturalSize({ w: 0, h: 0 });
    setPreflightPhase("idle");
    setPreflightResult(null);
  }, [displayUrl]);

  const effectiveUrl =
    retryKey > 0
      ? `${localUrl}${localUrl.includes("?") ? "&" : "?"}hh_retry=${retryKey}`
      : localUrl;

  React.useEffect(() => {
    if (!effectiveUrl.trim()) return;
    let cancelled = false;
    setPreflightPhase("checking");
    void (async () => {
      const runCheck = async (url: string) => {
        const r = await preflightPreviewUrl(url);
        if (cancelled) return null;
        setPreflightResult(r);
        return r;
      };

      let urlNow = effectiveUrl;
      let r = await runCheck(urlNow);
      if (cancelled || !r) return;

      if (r.ok) {
        setPreflightPhase("ok");
        return;
      }

      const stat = r.status;
      const refresh = onRefreshRef.current;
      if (refresh && (stat === 403 || stat === 404)) {
        const next = await refresh();
        if (cancelled) return;
        const nextTrim = (next ?? "").trim();
        if (nextTrim && nextTrim !== urlNow) {
          urlNow = nextTrim;
          setLocalUrl(nextTrim);
          r = await runCheck(urlNow);
          if (cancelled || !r) return;
        }
      }

      setPreflightPhase(r.ok ? "ok" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUrl]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setContainerH(el.clientHeight);
    });
    ro.observe(el);
    setContainerH(el.clientHeight);
    return () => ro.disconnect();
  }, [preflightPhase, imgPhase]);

  const inferredImage = inferAttachmentPreviewType(fileName, effectiveUrl) === "image";
  const inferredPdf = inferAttachmentPreviewType(fileName, effectiveUrl) === "pdf";
  const mime = (mimeHint ?? "").trim();
  const isImageMime = mime.startsWith("image/");
  const isPdfMime = mime === "application/pdf";

  const openTab = () => {
    window.open(effectiveUrl, "_blank", "noopener,noreferrer");
  };

  const runDownload = () => {
    if (onDownload) void onDownload();
    else void defaultDownload();
  };

  const preflightHardFail =
    preflightPhase === "error" && preflightResult != null && !preflightResult.ok;

  const failureActions = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="touch-manipulation"
        onClick={openTab}
      >
        <ExternalLink className="mr-2 h-3.5 w-3.5" />
        Open in new tab
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="touch-manipulation"
        disabled={downloadBusy || !effectiveUrl}
        onClick={() => void runDownload()}
      >
        <Download className="mr-2 h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  );

  return (
    <div className="flex w-full min-h-[280px] flex-col items-stretch gap-2">
      {showDebug ? (
        <div
          className="rounded-sm border border-dashed border-border/80 bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-muted-foreground"
          data-testid="receipt-preview-debug"
        >
          <div>fileUrl: {effectiveUrl ? `string(len=${effectiveUrl.length})` : "(missing)"}</div>
          <div>mime hint: {mime || "—"}</div>
          <div>
            infer: isPdf={String(inferredPdf)} isImage={String(inferredImage)} | mime: isPdf=
            {String(isPdfMime)} isImage={String(isImageMime)}
          </div>
          <div>URL prefix: {classifyStorageUrlPrefix(effectiveUrl)}</div>
          <div>
            preflight: {preflightPhase}
            {preflightResult?.status != null ? ` status=${preflightResult.status}` : ""}{" "}
            {preflightResult?.method ? `via ${preflightResult.method}` : ""}
            {preflightResult?.error ? ` err=${preflightResult.error}` : ""}
          </div>
          <div>
            img: phase={imgPhase} natural={naturalSize.w}×{naturalSize.h} | err=
            {imgErrorDetail ?? "—"}
          </div>
          <div>container clientHeight: {containerH}</div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="relative flex min-h-[280px] w-full flex-1 flex-col items-center justify-center gap-4 px-2 py-3"
      >
        {preflightPhase === "checking" ? (
          <div className="flex flex-col items-center gap-2" aria-busy>
            <Skeleton className="h-40 w-full max-w-md rounded-sm" />
            <span className="sr-only">Checking preview URL</span>
          </div>
        ) : null}

        {preflightHardFail ? (
          <div
            className="flex max-w-md flex-col items-center gap-3 text-center"
            data-testid="receipt-preview-preflight-error"
          >
            <p className="text-sm text-muted-foreground">
              Receipt could not be loaded
              {preflightResult?.status != null ? ` (HTTP ${preflightResult.status})` : ""}.
            </p>
            {failureActions}
            {onRefreshPreviewUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="touch-manipulation"
                onClick={() => {
                  setPreflightPhase("checking");
                  void (async () => {
                    const next = await onRefreshRef.current?.();
                    if (next?.trim()) {
                      setLocalUrl(next.trim());
                      setRetryKey((k) => k + 1);
                    }
                  })();
                }}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Retry signed URL
              </Button>
            ) : null}
          </div>
        ) : null}

        {preflightPhase === "ok" ? (
          <>
            {imgPhase === "loading" ? (
              <Skeleton className="pointer-events-none absolute inset-x-4 top-8 h-40 max-w-md rounded-sm opacity-90" />
            ) : null}
            {imgPhase === "error" ? (
              <div
                className="flex max-w-md flex-col items-center gap-3 text-center"
                data-testid="receipt-preview-img-error"
              >
                <p className="text-sm text-muted-foreground">Receipt image failed to load.</p>
                {failureActions}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="touch-manipulation"
                  onClick={() => {
                    setImgPhase("loading");
                    setImgErrorDetail(null);
                    setRetryKey((k) => k + 1);
                  }}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={effectiveUrl}
                alt=""
                data-no-image-preview
                decoding="async"
                loading="eager"
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                  setImgPhase("ready");
                  setImgErrorDetail(null);
                }}
                onError={() => {
                  setImgErrorDetail("img onError (decode / network / CORS)");
                  setImgPhase("error");
                }}
                className={cn(
                  "max-h-[70vh] max-w-full object-contain",
                  imgPhase === "ready" ? "opacity-100" : "opacity-0"
                )}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -100 : 100,
    opacity: 0,
  }),
};

export type AttachmentPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  files: AttachmentPreviewFileItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  /** Full-viewer loading (e.g. resolving signed URL). */
  sessionIsLoading?: boolean;
  onDownload?: () => void | Promise<void>;
  downloadBusy?: boolean;
  showReplace?: boolean;
  replaceInputRef?: React.Ref<HTMLInputElement>;
  onReplaceInputChange?: React.ChangeEventHandler<HTMLInputElement>;
  onReplaceClick?: () => void;
  replaceBusy?: boolean;
  replaceAccept?: string;
  extraFooter?: React.ReactNode;
  /** Re-resolve signed URL after HTTP 403/404 on preflight (receipt flows). */
  onRefreshPreviewUrl?: () => Promise<string | null>;
};

export function AttachmentPreviewModal({
  isOpen,
  onClose,
  files,
  currentIndex,
  onIndexChange,
  sessionIsLoading = false,
  onDownload,
  downloadBusy = false,
  showReplace = false,
  replaceInputRef,
  onReplaceInputChange,
  onReplaceClick,
  replaceBusy = false,
  replaceAccept = "image/*,.pdf,application/pdf",
  extraFooter,
  onRefreshPreviewUrl,
}: AttachmentPreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState(1);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const itemCount = files.length;
  const safeIndex = itemCount === 0 ? 0 : ((currentIndex % itemCount) + itemCount) % itemCount;
  const current = files[safeIndex] ?? {
    url: "",
    fileName: "File",
    fileType: "image" as AttachmentPreviewFileType,
  };
  const fileUrl = current.url;
  const fileName = current.fileName ?? "File";
  const fileType = current.fileType ?? inferAttachmentPreviewType(fileName, fileUrl);
  const unsupported = current.unsupported ?? false;
  const mimeHint = current.mimeType;

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!isOpen || itemCount === 0) return;
    const nextIdx = (safeIndex + 1) % itemCount;
    const next = files[nextIdx];
    const u = (next?.url ?? "").trim();
    if (
      !u ||
      next?.fileType === "pdf" ||
      inferAttachmentPreviewType(next?.fileName ?? "", u) === "pdf"
    ) {
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }, [isOpen, itemCount, safeIndex, files]);

  const goNext = React.useCallback(() => {
    if (itemCount <= 1) return;
    setNavDirection(1);
    onIndexChange((safeIndex + 1) % itemCount);
  }, [itemCount, onIndexChange, safeIndex]);

  const goPrev = React.useCallback(() => {
    if (itemCount <= 1) return;
    setNavDirection(-1);
    onIndexChange((safeIndex - 1 + itemCount) % itemCount);
  }, [itemCount, onIndexChange, safeIndex]);

  const handleDragEnd = React.useCallback(
    (_: unknown, info: PanInfo) => {
      if (itemCount <= 1) return;
      const { offset, velocity } = info;
      if (offset.x > DRAG_THRESHOLD || velocity.x > 400) {
        goPrev();
      } else if (offset.x < -DRAG_THRESHOLD || velocity.x < -400) {
        goNext();
      }
    },
    [goNext, goPrev, itemCount]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (itemCount <= 1) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, itemCount, goNext, goPrev]);

  React.useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleDownload = React.useCallback(() => {
    if (downloadBusy || !fileUrl || sessionIsLoading) return;
    if (onDownload) void onDownload();
    else void downloadPreviewBlob(fileUrl, fileName);
  }, [onDownload, downloadBusy, fileUrl, fileName, sessionIsLoading]);

  const onTouchStartCapture = React.useCallback(
    (e: React.TouchEvent) => {
      if (itemCount <= 1) return;
      if (e.touches.length !== 1) return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [itemCount]
  );

  const onTouchEndCapture = React.useCallback(
    (e: React.TouchEvent) => {
      if (itemCount <= 1) return;
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > SWIPE_TOUCH_MIN && Math.abs(dx) > Math.abs(dy) * 1.15) {
        if (dx > 0) goPrev();
        else goNext();
      }
    },
    [goNext, goPrev, itemCount]
  );

  if (!mounted) return null;

  const titleBase = fileName || "File";
  const title = itemCount > 1 ? `${titleBase} (${safeIndex + 1}/${itemCount})` : titleBase;

  const showNav = itemCount > 1;
  const enableMotionDrag = showNav;

  const dialogTransition = {
    opacity: { duration: 0.18, ease: "easeOut" as const },
    scale: { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.85 },
  };
  const dialogExitTransition = {
    opacity: { duration: 0.15, ease: "easeOut" as const },
    scale: { duration: 0.15, ease: "easeOut" as const },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen
        ? [
            <motion.div
              key="attachment-preview-backdrop"
              className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={onClose}
            />,
            <motion.div
              key="attachment-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="attachment-preview-title"
              data-attachment-preview-modal
              className="fixed left-1/2 top-1/2 z-[201] flex max-h-[90vh] w-full max-w-[90vw] flex-col overflow-hidden rounded-sm border border-border/60 bg-background shadow-none max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:left-0 max-md:right-0 max-md:max-h-[min(92dvh,calc(100vh-env(safe-area-inset-bottom)))] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-sm"
              style={{ transformOrigin: "center center" }}
              initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
              animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
              exit={{
                opacity: 0,
                scale: 0.95,
                x: "-50%",
                y: "-50%",
                transition: dialogExitTransition,
              }}
              transition={dialogTransition}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="relative flex shrink-0 flex-col gap-1 border-b border-border/60 px-4 py-3 pr-12">
                <div className="flex min-w-0 items-center gap-2">
                  <h2
                    id="attachment-preview-title"
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                    title={title}
                  >
                    <span className="sr-only">Receipt preview — </span>
                    {titleBase}
                  </h2>
                  {showNav ? (
                    <span
                      className="shrink-0 tabular-nums text-xs text-muted-foreground"
                      aria-live="polite"
                    >
                      {safeIndex + 1} / {itemCount}
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="btn-outline-ghost absolute right-2 top-2 h-9 w-9 shrink-0 rounded-sm touch-manipulation max-md:h-11 max-md:w-11"
                  aria-label="Close"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>

              <div
                className="relative flex min-h-[320px] min-w-0 flex-1 flex-col px-4 py-2"
                onTouchStartCapture={onTouchStartCapture}
                onTouchEndCapture={onTouchEndCapture}
              >
                {showNav ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="btn-outline-ghost absolute left-1 top-1/2 z-20 h-9 w-9 -translate-y-1/2 rounded-sm touch-manipulation max-md:h-11 max-md:w-11"
                      aria-label="Previous attachment"
                      onClick={goPrev}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="btn-outline-ghost absolute right-1 top-1/2 z-20 h-9 w-9 -translate-y-1/2 rounded-sm touch-manipulation max-md:h-11 max-md:w-11"
                      aria-label="Next attachment"
                      onClick={goNext}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                ) : null}

                <div className="flex w-full flex-1 min-h-[320px] max-h-[min(85vh,calc(90vh-8rem))] flex-col items-stretch justify-center overflow-auto">
                  {sessionIsLoading ? (
                    <div
                      className="flex w-full flex-col items-center justify-center gap-3 px-6 py-8"
                      aria-busy
                    >
                      <Skeleton className="h-[min(50vh,280px)] w-full max-w-2xl rounded-md" />
                      <span className="sr-only">Loading preview</span>
                    </div>
                  ) : unsupported ? (
                    <p className="px-4 text-center text-sm text-muted-foreground">
                      Preview not available for this file type.
                    </p>
                  ) : !fileUrl ? (
                    <p className="text-sm text-muted-foreground">Receipt not available.</p>
                  ) : (
                    <div className="relative flex min-h-[320px] w-full flex-1 flex-col">
                      <AnimatePresence initial={false} custom={navDirection} mode="wait">
                        <motion.div
                          key={`${safeIndex}-${fileUrl}`}
                          custom={navDirection}
                          variants={slideVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          drag={enableMotionDrag ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.12}
                          onDragEnd={handleDragEnd}
                          className="relative flex min-h-[320px] w-full flex-1 flex-col items-center justify-center"
                        >
                          {fileType === "pdf" ? (
                            <iframe
                              title={fileName}
                              src={fileUrl}
                              className="min-h-[280px] h-[min(70vh,720px)] w-full flex-1 border-0"
                            />
                          ) : (
                            <ReceiptPreviewImageArea
                              displayUrl={fileUrl}
                              fileName={fileName}
                              mimeHint={mimeHint}
                              onRefreshPreviewUrl={onRefreshPreviewUrl}
                              downloadBusy={downloadBusy}
                              onDownload={onDownload}
                              defaultDownload={() => void downloadPreviewBlob(fileUrl, fileName)}
                            />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {extraFooter}
                {showReplace && replaceInputRef && onReplaceClick && onReplaceInputChange ? (
                  <>
                    <input
                      ref={replaceInputRef}
                      type="file"
                      className="hidden"
                      accept={replaceAccept}
                      capture="environment"
                      onChange={onReplaceInputChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 max-md:min-h-11 touch-manipulation"
                      disabled={replaceBusy}
                      onClick={onReplaceClick}
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      {replaceBusy ? "Replacing…" : "Replace"}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="h-8 max-md:min-h-11 touch-manipulation"
                  disabled={!fileUrl || sessionIsLoading || unsupported || downloadBusy}
                  onClick={() => void handleDownload()}
                >
                  {downloadBusy ? (
                    <>
                      <InlineLoading className="mr-2" size="md" aria-hidden />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Download
                    </>
                  )}
                </Button>
              </footer>
            </motion.div>,
          ]
        : null}
    </AnimatePresence>,
    document.body
  );
}
