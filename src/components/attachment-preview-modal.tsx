"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, X } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";

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

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="attachment-preview-root"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-preview-title"
            className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-sm border border-border/60 bg-background"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
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
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-9 w-9 shrink-0 rounded-sm"
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
                    variant="ghost"
                    size="icon"
                    className="absolute left-1 top-1/2 z-20 h-9 w-9 -translate-y-1/2 rounded-sm"
                    aria-label="Previous attachment"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 z-20 h-9 w-9 -translate-y-1/2 rounded-sm"
                    aria-label="Next attachment"
                    onClick={goNext}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              ) : null}

              <div className="flex h-[85vh] max-h-[calc(90vh-7.5rem)] w-full min-h-[200px] items-center justify-center overflow-hidden">
                {sessionIsLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
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
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
                          <TransformWrapper
                            key={`${safeIndex}-${fileUrl}`}
                            initialScale={1}
                            initialPositionX={0}
                            initialPositionY={0}
                            minScale={0.35}
                            maxScale={8}
                            wheel={{ step: 0.12 }}
                            panning={{ velocityDisabled: true }}
                            pinch={{ step: 5 }}
                            doubleClick={{ mode: "toggle", step: 0.85 }}
                            onTransformed={(_ref, st) => setPinchScale(st.scale)}
                          >
                            <TransformComponent
                              wrapperClass="!flex !h-full !w-full !items-center !justify-center"
                              contentClass="!flex !h-full !w-full !items-center !justify-center"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fileUrl}
                                alt=""
                                className="max-h-full max-w-full object-contain"
                                draggable={false}
                              />
                            </TransformComponent>
                          </TransformWrapper>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
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
                    className="h-8"
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
                className="h-8"
                disabled={!fileUrl || sessionIsLoading || unsupported || downloadBusy}
                onClick={() => void handleDownload()}
              >
                {downloadBusy ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
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
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
