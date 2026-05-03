"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, RefreshCw, X } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { InlineLoading, Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AttachmentPreviewFileType = "image" | "pdf";

export type AttachmentPreviewFileItem = {
  url: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
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

function AttachmentPreviewImage({
  fileUrl,
  onPinchScale,
}: {
  fileUrl: string;
  onPinchScale: (scale: number) => void;
}) {
  const [phase, setPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    setPhase("loading");
    setRetryKey(0);
  }, [fileUrl]);

  const src =
    retryKey > 0 ? `${fileUrl}${fileUrl.includes("?") ? "&" : "?"}hh_retry=${retryKey}` : fileUrl;

  return (
    <TransformWrapper
      key={`tw-${fileUrl}-${retryKey}`}
      initialScale={1}
      initialPositionX={0}
      initialPositionY={0}
      minScale={0.35}
      maxScale={8}
      wheel={{ step: 0.12 }}
      panning={{ velocityDisabled: true }}
      pinch={{ step: 5 }}
      doubleClick={{ mode: "toggle", step: 0.85 }}
      onTransformed={(_ref, st) => onPinchScale(st.scale)}
    >
      <TransformComponent
        wrapperClass="!flex !h-full !w-full !items-center !justify-center"
        contentClass="!flex !h-full !w-full !items-center !justify-center"
      >
        <div className="relative flex h-full min-h-[120px] w-full items-center justify-center">
          {phase === "loading" ? (
            <Skeleton
              className="pointer-events-none absolute inset-3 max-h-[min(70vh,560px)] w-[calc(100%-1.5rem)] rounded-sm opacity-90"
              aria-hidden
            />
          ) : null}
          {phase === "error" ? (
            <div className="flex max-w-sm flex-col items-center gap-3 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Could not load this image. Check your connection or try again.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="touch-manipulation"
                onClick={() => {
                  setPhase("loading");
                  setRetryKey((k) => k + 1);
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              data-no-image-preview
              decoding="async"
              loading="eager"
              draggable={false}
              onLoad={() => setPhase("ready")}
              onError={() => setPhase((p) => (p === "loading" ? "error" : p))}
              className={cn(
                "max-h-full max-w-full object-contain transition-opacity duration-200 ease-out",
                phase === "ready" ? "opacity-100" : "opacity-0"
              )}
            />
          )}
        </div>
      </TransformComponent>
    </TransformWrapper>
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
}: AttachmentPreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState(1);
  const [pinchScale, setPinchScale] = React.useState(1);
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

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    setPinchScale(1);
  }, [safeIndex, fileUrl]);

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
      if (itemCount <= 1 || pinchScale > 1.06) return;
      if (e.touches.length !== 1) return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [itemCount, pinchScale]
  );

  const onTouchEndCapture = React.useCallback(
    (e: React.TouchEvent) => {
      if (itemCount <= 1 || pinchScale > 1.06) return;
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
    [goNext, goPrev, itemCount, pinchScale]
  );

  if (!mounted) return null;

  const titleBase = fileName || "File";
  const title = itemCount > 1 ? `${titleBase} (${safeIndex + 1}/${itemCount})` : titleBase;

  const showNav = itemCount > 1;
  const enableMotionDrag = showNav && (fileType === "pdf" || pinchScale <= 1.02);

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
                className="relative flex min-h-0 min-w-0 flex-1 flex-col px-4 py-2"
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

                <div className="flex min-h-0 w-full flex-1 max-h-[min(85vh_calc(90vh-8rem))] items-center justify-center overflow-hidden">
                  {sessionIsLoading ? (
                    <div
                      className="flex w-full flex-col items-center justify-center gap-3 px-6 py-8"
                      aria-busy
                    >
                      <Skeleton className="h-[min(50vh_280px)] w-full max-w-2xl rounded-md" />
                      <span className="sr-only">Loading preview</span>
                    </div>
                  ) : unsupported ? (
                    <p className="px-4 text-center text-sm text-muted-foreground">
                      Preview not available for this file type.
                    </p>
                  ) : !fileUrl ? (
                    <p className="text-sm text-muted-foreground">Preview not available.</p>
                  ) : (
                    <div className="relative h-full w-full">
                      <AnimatePresence initial={false} custom={navDirection} mode="popLayout">
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
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          {fileType === "pdf" ? (
                            <iframe
                              title={fileName}
                              src={fileUrl}
                              className="h-full w-full border-0"
                            />
                          ) : (
                            <AttachmentPreviewImage
                              fileUrl={fileUrl}
                              onPinchScale={setPinchScale}
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
