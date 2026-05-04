"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineLoading, Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { preflightPreviewUrl, type PreviewUrlPreflightResult } from "@/lib/preview-url-preflight";

export type AttachmentPreviewFileType = "image" | "pdf";

export type AttachmentPreviewFileItem = {
  url: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
  /** Optional MIME for debug (e.g. receipt row `mime_type`). */
  mimeType?: string;
  /** When set (e.g. Edit Expense), `onDeleteCurrent` may remove this attachment server-side. */
  attachmentId?: string;
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
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const WHEEL_ZOOM_SENS = 0.0015;

type PreflightPhase = "idle" | "checking" | "ok" | "error";

function ZoomableImageFrame({
  effectiveUrl,
  imgPhase,
  imgClassName,
  onImgLoad,
  onImgError,
  onZoomPanChange,
}: {
  effectiveUrl: string;
  imgPhase: "loading" | "ready" | "error";
  imgClassName: string;
  onImgLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onImgError: () => void;
  onZoomPanChange?: (zoomed: boolean) => void;
}) {
  const [scale, setScale] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const pinchStartDist = React.useRef<number | null>(null);
  const pinchStartScale = React.useRef(1);
  const panStart = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  React.useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    pinchStartDist.current = null;
    panStart.current = null;
  }, [effectiveUrl]);

  React.useEffect(() => {
    onZoomPanChange?.(scale > ZOOM_MIN + 0.02 || Math.abs(tx) > 2 || Math.abs(ty) > 2);
  }, [scale, tx, ty, onZoomPanChange]);

  const onWheel = React.useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s - e.deltaY * WHEEL_ZOOM_SENS));
      if (next <= ZOOM_MIN + 0.001) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }, []);

  const onDoubleClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => {
      if (s > ZOOM_MIN + 0.05) {
        setTx(0);
        setTy(0);
        return ZOOM_MIN;
      }
      return Math.min(2.25, ZOOM_MAX);
    });
  }, []);

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        pinchStartDist.current = Math.hypot(dx, dy);
        pinchStartScale.current = scale;
        panStart.current = null;
        return;
      }
      if (e.touches.length === 1 && scale > ZOOM_MIN + 0.02) {
        const t = e.touches[0];
        panStart.current = { x: t.clientX, y: t.clientY, tx, ty };
        e.stopPropagation();
      }
    },
    [scale, tx, ty]
  );

  const onTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist.current != null) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        const d = Math.hypot(dx, dy);
        const ratio = d / pinchStartDist.current;
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartScale.current * ratio));
        setScale(next);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.touches.length === 1 && panStart.current && scale > ZOOM_MIN + 0.02) {
        const t = e.touches[0];
        const p = panStart.current;
        setTx(p.tx + (t.clientX - p.x));
        setTy(p.ty + (t.clientY - p.y));
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [scale]
  );

  const onTouchEnd = React.useCallback(() => {
    pinchStartDist.current = null;
    panStart.current = null;
  }, []);

  return (
    <div
      className="relative flex max-h-[min(78dvh,78vh)] max-w-full touch-none items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        role="presentation"
        onDoubleClick={onDoubleClick}
        className="flex max-h-full max-w-full items-center justify-center"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={effectiveUrl}
          alt=""
          data-no-image-preview
          decoding="async"
          loading="eager"
          draggable={false}
          onLoad={onImgLoad}
          onError={onImgError}
          className={imgClassName}
        />
      </div>
      {imgPhase === "ready" && scale <= ZOOM_MIN + 0.02 ? (
        <p className="pointer-events-none absolute bottom-1 left-1/2 z-[1] -translate-x-1/2 rounded-sm bg-black/55 px-2 py-0.5 text-[10px] text-white/80 max-md:block md:hidden">
          Pinch to zoom · double-tap
        </p>
      ) : null}
    </div>
  );
}

function PdfPreviewFrame({ src, title }: { src: string; title: string }) {
  const loadedRef = React.useRef(false);
  const [showFallback, setShowFallback] = React.useState(false);
  React.useEffect(() => {
    loadedRef.current = false;
    setShowFallback(false);
    const t = window.setTimeout(() => {
      if (!loadedRef.current) setShowFallback(true);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [src]);

  return (
    <div className="relative flex min-h-[50dvh] w-full flex-1 flex-col bg-black">
      <iframe
        title={title}
        src={src}
        onLoad={() => {
          loadedRef.current = true;
          setShowFallback(false);
        }}
        className="min-h-[50dvh] h-[min(78dvh,78vh)] w-full flex-1 border-0 bg-zinc-900"
      />
      {showFallback ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
          <p className="text-sm text-zinc-300">PDF preview is unavailable in-app.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              onClick={() => void downloadPreviewBlob(src, title)}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptPreviewImageArea({
  displayUrl,
  onRefreshPreviewUrl,
  downloadBusy,
  onDownload,
  defaultDownload,
  onZoomPanChange,
}: {
  displayUrl: string;
  fileName: string;
  mimeHint?: string;
  onRefreshPreviewUrl?: () => Promise<string | null>;
  downloadBusy: boolean;
  onDownload?: () => void | Promise<void>;
  defaultDownload: () => void | Promise<void>;
  onZoomPanChange?: (zoomed: boolean) => void;
}) {
  const [preflightPhase, setPreflightPhase] = React.useState<PreflightPhase>("idle");
  const [preflightResult, setPreflightResult] = React.useState<PreviewUrlPreflightResult | null>(
    null
  );
  const [imgPhase, setImgPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = React.useState(0);
  const [localUrl, setLocalUrl] = React.useState(displayUrl);
  const onRefreshRef = React.useRef(onRefreshPreviewUrl);
  onRefreshRef.current = onRefreshPreviewUrl;

  React.useEffect(() => {
    setLocalUrl(displayUrl);
    setRetryKey(0);
    setImgPhase("loading");
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
    <div className="flex w-full min-h-[280px] flex-col items-stretch">
      <div className="relative flex min-h-[280px] w-full flex-1 flex-col items-center justify-center gap-4 px-2 py-3">
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
                    setRetryKey((k) => k + 1);
                  }}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : (
              <ZoomableImageFrame
                effectiveUrl={effectiveUrl}
                imgPhase={imgPhase}
                onZoomPanChange={onZoomPanChange}
                imgClassName={cn(
                  "max-h-[min(78dvh,78vh)] max-w-[min(100vw-1.5rem,100%)] object-contain select-none",
                  imgPhase === "ready" ? "opacity-100" : "opacity-0"
                )}
                onImgLoad={() => {
                  setImgPhase("ready");
                }}
                onImgError={() => {
                  setImgPhase("error");
                }}
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
  /** Edit Expense only: delete attachment row after confirm; hidden when current slide has no `attachmentId`. */
  onDeleteCurrent?: (attachmentId: string) => Promise<void>;
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
  onDeleteCurrent,
}: AttachmentPreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState(1);
  const [imageZoomed, setImageZoomed] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
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

  React.useEffect(() => {
    setImageZoomed(false);
  }, [safeIndex, fileUrl]);

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

  const attachmentId = current.attachmentId;
  const canDelete = Boolean(onDeleteCurrent && attachmentId);

  const handleDelete = React.useCallback(async () => {
    if (!onDeleteCurrent || !attachmentId || deleteBusy || sessionIsLoading) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete “${fileName}” from this expense?`)
    ) {
      return;
    }
    setDeleteBusy(true);
    try {
      await onDeleteCurrent(attachmentId);
    } finally {
      setDeleteBusy(false);
    }
  }, [onDeleteCurrent, attachmentId, deleteBusy, sessionIsLoading, fileName]);

  const onTouchStartCapture = React.useCallback(
    (e: React.TouchEvent) => {
      if (imageZoomed || itemCount <= 1) return;
      if (e.touches.length !== 1) return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [imageZoomed, itemCount]
  );

  const onTouchEndCapture = React.useCallback(
    (e: React.TouchEvent) => {
      if (imageZoomed || itemCount <= 1) return;
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
    [imageZoomed, goNext, goPrev, itemCount]
  );

  if (!mounted) return null;

  const titleBase = fileName || "File";
  const headerTitle = itemCount > 1 ? `${titleBase} · ${safeIndex + 1} / ${itemCount}` : titleBase;

  const showNav = itemCount > 1;
  const enableMotionDrag = showNav && !imageZoomed;

  const showFooter =
    Boolean(extraFooter) ||
    Boolean(showReplace && replaceInputRef && onReplaceClick && onReplaceInputChange);

  const navBtnClass =
    "h-11 w-11 shrink-0 touch-manipulation rounded-sm border border-white/15 bg-black/50 text-zinc-100 hover:bg-white/10 max-md:h-12 max-md:w-12";

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="attachment-preview-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-preview-title"
          data-attachment-preview-modal
          className="fixed inset-0 z-[201] flex min-h-0 flex-col bg-black text-zinc-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeOut" } }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <h2
                id="attachment-preview-title"
                className="truncate text-sm font-medium text-zinc-50"
                title={headerTitle}
              >
                <span className="sr-only">Attachment preview — </span>
                {titleBase}
              </h2>
              {showNav ? (
                <p className="tabular-nums text-xs text-zinc-500" aria-live="polite">
                  {safeIndex + 1} / {itemCount}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 touch-manipulation text-zinc-100 hover:bg-white/10 max-md:h-12 max-md:w-12"
                aria-label="Download"
                disabled={!fileUrl || sessionIsLoading || unsupported || downloadBusy}
                onClick={() => void handleDownload()}
              >
                {downloadBusy ? (
                  <InlineLoading className="text-zinc-100" size="md" aria-label="Downloading" />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 touch-manipulation text-zinc-100 hover:bg-red-500/20 hover:text-red-200 max-md:h-12 max-md:w-12"
                  aria-label="Delete attachment"
                  disabled={!fileUrl || sessionIsLoading || unsupported || deleteBusy}
                  onClick={() => void handleDelete()}
                >
                  {deleteBusy ? (
                    <InlineLoading className="text-zinc-100" size="md" aria-label="Deleting" />
                  ) : (
                    <Trash2 className="h-5 w-5" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 touch-manipulation text-zinc-100 hover:bg-white/10 max-md:h-12 max-md:w-12"
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <div
            className="relative flex min-h-0 flex-1 flex-col"
            onTouchStartCapture={onTouchStartCapture}
            onTouchEndCapture={onTouchEndCapture}
          >
            {showNav ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    navBtnClass,
                    "absolute left-2 top-1/2 z-20 -translate-y-1/2 max-md:left-1"
                  )}
                  aria-label="Previous attachment"
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    navBtnClass,
                    "absolute right-2 top-1/2 z-20 -translate-y-1/2 max-md:right-1"
                  )}
                  aria-label="Next attachment"
                  onClick={goNext}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-1 max-md:px-2">
              {sessionIsLoading ? (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4"
                  aria-busy
                >
                  <Skeleton className="h-[min(55dvh,420px)] w-full max-w-3xl rounded-sm bg-zinc-800" />
                  <span className="sr-only">Loading preview</span>
                </div>
              ) : unsupported ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
                  <p className="text-sm text-zinc-400">Preview not available for this file type.</p>
                </div>
              ) : !fileUrl ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
                  <p className="text-sm text-zinc-400">Receipt not available.</p>
                </div>
              ) : (
                <div className="relative flex min-h-0 w-full flex-1 flex-col">
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
                      className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden"
                    >
                      {fileType === "pdf" ? (
                        <PdfPreviewFrame src={fileUrl} title={fileName} />
                      ) : (
                        <ReceiptPreviewImageArea
                          displayUrl={fileUrl}
                          fileName={fileName}
                          mimeHint={mimeHint}
                          onRefreshPreviewUrl={onRefreshPreviewUrl}
                          downloadBusy={downloadBusy}
                          onDownload={onDownload}
                          defaultDownload={() => void downloadPreviewBlob(fileUrl, fileName)}
                          onZoomPanChange={setImageZoomed}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {showFooter ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
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
                    className="h-9 touch-manipulation border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10 max-md:min-h-11"
                    disabled={replaceBusy}
                    onClick={onReplaceClick}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    {replaceBusy ? "Replacing…" : "Replace"}
                  </Button>
                </>
              ) : null}
            </footer>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
