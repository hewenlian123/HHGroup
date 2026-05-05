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

export const ATTACHMENT_PREVIEW_MODAL_SELECTOR = "[data-attachment-preview-modal]";

export function eventTargetsAttachmentPreviewModal(
  event: Event & { detail?: { originalEvent?: Event } }
): boolean {
  const targets = [event.target, event.detail?.originalEvent?.target];
  return targets.some((target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(ATTACHMENT_PREVIEW_MODAL_SELECTOR));
  });
}

export type AttachmentPreviewFileItem = {
  url: string;
  fileName?: string;
  fileType?: AttachmentPreviewFileType;
  unsupported?: boolean;
  /** Optional MIME for debug (e.g. receipt row `mime_type`). */
  mimeType?: string;
  /** When set (e.g. Edit Expense), `onDeleteCurrent` may remove this attachment server-side. */
  attachmentId?: string;
  /** Signed URL not ready yet — show inline skeleton; modal stays open immediately. */
  pendingSignedUrl?: boolean;
  /** Batch signed-URL resolve failed before any URL was shown. */
  signedUrlResolveFailed?: boolean;
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

/** Primary header line for receipt-style review (uses filename only; no extra data). */
function receiptViewerPrimaryLabel(rawName: string): string {
  const n = (rawName ?? "").trim();
  if (!n) return "Receipt";
  const lower = n.toLowerCase();
  if (
    lower === "receipt" ||
    lower === "attachment" ||
    lower === "file" ||
    lower === "photo" ||
    lower === "photo.jpg"
  ) {
    return "Receipt";
  }
  return n;
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
const ZOOM_MAX = 5;
/** Wheel deltaY → multiplicative factor via exp(-deltaY * WHEEL_EXP). */
const WHEEL_EXP = 0.00115;
const FRICTION = 0.93;
const MIN_VEL = 0.42;
const INERTIA_MULT = 1.45;

type PreflightPhase = "idle" | "checking" | "ok" | "error";

function clampPan(
  tx: number,
  ty: number,
  scale: number,
  cw: number,
  ch: number,
  bw: number,
  bh: number
): { tx: number; ty: number } {
  if (bw <= 0 || bh <= 0 || cw <= 0 || ch <= 0) return { tx: 0, ty: 0 };
  const sw = bw * scale;
  const sh = bh * scale;
  const maxX = Math.max(0, (sw - cw) / 2);
  const maxY = Math.max(0, (sh - ch) / 2);
  return {
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  };
}

function cursorCenteredPan(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  tx: number,
  ty: number,
  scale: number,
  nextScale: number
): { tx: number; ty: number } {
  const imageX = (clientX - centerX - tx) / scale;
  const imageY = (clientY - centerY - ty) / scale;
  return {
    tx: clientX - centerX - imageX * nextScale,
    ty: clientY - centerY - imageY * nextScale,
  };
}

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
  const [baseSize, setBaseSize] = React.useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = React.useState({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [isInertia, setIsInertia] = React.useState(false);
  const [snapTransition, setSnapTransition] = React.useState(false);
  const [zoomIndicator, setZoomIndicator] = React.useState<string | null>(null);
  const [zoomIndicatorOpaque, setZoomIndicatorOpaque] = React.useState(true);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const stateRef = React.useRef({ scale: 1, tx: 0, ty: 0 });
  const pinchStartDist = React.useRef<number | null>(null);
  const pinchStartScale = React.useRef(1);
  const panStart = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const wheelAccumRef = React.useRef(0);
  const wheelClientRef = React.useRef({ x: 0, y: 0 });
  const wheelRafRef = React.useRef<number | null>(null);
  const pointerDragRef = React.useRef<{
    id: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
  } | null>(null);
  const inertiaRafRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    stateRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  React.useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
    pinchStartDist.current = null;
    panStart.current = null;
    pointerDragRef.current = null;
    wheelAccumRef.current = 0;
    if (wheelRafRef.current != null) {
      cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
    if (inertiaRafRef.current != null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    setIsInertia(false);
    setIsDragging(false);
  }, [effectiveUrl]);

  React.useEffect(() => {
    onZoomPanChange?.(scale > ZOOM_MIN + 0.02 || Math.abs(tx) > 2 || Math.abs(ty) > 2);
  }, [scale, tx, ty, onZoomPanChange]);

  const measureSizes = React.useCallback(() => {
    const c = containerRef.current;
    const im = imgRef.current;
    if (c) {
      setContainerSize({ w: c.clientWidth, h: c.clientHeight });
    }
    if (im && im.complete) {
      setBaseSize({ w: im.offsetWidth, h: im.offsetHeight });
    }
  }, []);

  React.useEffect(() => {
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureSizes());
    ro.observe(c);
    measureSizes();
    return () => ro.disconnect();
  }, [measureSizes, imgPhase, effectiveUrl]);

  React.useEffect(() => {
    if (imgPhase !== "ready") return;
    setZoomIndicatorOpaque(true);
    setZoomIndicator(`${Math.round(scale * 100)}%`);
    const tFade = window.setTimeout(() => setZoomIndicatorOpaque(false), 750);
    const tHide = window.setTimeout(() => setZoomIndicator(null), 1050);
    return () => {
      clearTimeout(tFade);
      clearTimeout(tHide);
    };
  }, [scale, imgPhase]);

  const cancelInertia = React.useCallback(() => {
    if (inertiaRafRef.current != null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    setIsInertia(false);
  }, []);

  const applyPanScale = React.useCallback(
    (nextScale: number, nextTx: number, nextTy: number) => {
      const { w: cw, h: ch } = containerSize;
      const { w: bw, h: bh } = baseSize;
      let s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
      let nx = nextTx;
      let ny = nextTy;
      if (s <= ZOOM_MIN) {
        s = ZOOM_MIN;
        nx = 0;
        ny = 0;
      } else {
        const cl = clampPan(nx, ny, s, cw, ch, bw, bh);
        nx = cl.tx;
        ny = cl.ty;
      }
      stateRef.current = { scale: s, tx: nx, ty: ny };
      setScale(s);
      setTx(nx);
      setTy(ny);
    },
    [containerSize, baseSize]
  );

  const flushWheel = React.useCallback(() => {
    wheelRafRef.current = null;
    const dy = wheelAccumRef.current;
    wheelAccumRef.current = 0;
    if (dy === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const { x: pcx, y: pcy } = wheelClientRef.current;
    const zoomFactor = Math.exp(-dy * WHEEL_EXP);
    const { scale: sc, tx: px, ty: py } = stateRef.current;
    let nextScale = sc * zoomFactor;
    nextScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
    if (nextScale <= ZOOM_MIN) {
      applyPanScale(ZOOM_MIN, 0, 0);
      return;
    }
    const p = cursorCenteredPan(pcx, pcy, cx, cy, px, py, sc, nextScale);
    applyPanScale(nextScale, p.tx, p.ty);
  }, [applyPanScale]);

  const scheduleWheel = React.useCallback(() => {
    if (wheelRafRef.current != null) return;
    wheelRafRef.current = requestAnimationFrame(() => {
      flushWheel();
    });
  }, [flushWheel]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cancelInertia();
      wheelAccumRef.current += e.deltaY;
      wheelClientRef.current = { x: e.clientX, y: e.clientY };
      scheduleWheel();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scheduleWheel, cancelInertia]);

  const onImgLoadWrapped = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      onImgLoad(e);
      requestAnimationFrame(() => measureSizes());
    },
    [onImgLoad, measureSizes]
  );

  const onDoubleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cancelInertia();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const { scale: sc, tx: px, ty: py } = stateRef.current;
      setSnapTransition(true);
      window.setTimeout(() => setSnapTransition(false), 220);
      if (sc > ZOOM_MIN + 0.02) {
        applyPanScale(ZOOM_MIN, 0, 0);
        return;
      }
      const nextScale = Math.min(2, ZOOM_MAX);
      const p = cursorCenteredPan(e.clientX, e.clientY, centerX, centerY, px, py, sc, nextScale);
      applyPanScale(nextScale, p.tx, p.ty);
    },
    [applyPanScale, cancelInertia]
  );

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || stateRef.current.scale <= ZOOM_MIN + 0.02)
        return;
      cancelInertia();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      const now = performance.now();
      pointerDragRef.current = {
        id: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: now,
        vx: 0,
        vy: 0,
      };
    },
    [cancelInertia]
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const d = pointerDragRef.current;
      if (!d || d.id !== e.pointerId) return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      const rawVx = (dx / dt) * 16.67 * INERTIA_MULT;
      const rawVy = (dy / dt) * 16.67 * INERTIA_MULT;
      d.vx = d.vx * 0.45 + rawVx * 0.55;
      d.vy = d.vy * 0.45 + rawVy * 0.55;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      d.lastT = now;
      const { scale: sc, tx: px, ty: py } = stateRef.current;
      const nx = px + dx;
      const ny = py + dy;
      applyPanScale(sc, nx, ny);
    },
    [applyPanScale]
  );

  const endPointerDrag = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const d = pointerDragRef.current;
      if (!d || d.id !== e.pointerId) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pointerDragRef.current = null;
      setIsDragging(false);
      const v = Math.hypot(d.vx, d.vy);
      if (v < MIN_VEL) return;
      setIsInertia(true);
      let vx = d.vx;
      let vy = d.vy;
      const tick = () => {
        vx *= FRICTION;
        vy *= FRICTION;
        if (Math.hypot(vx, vy) < MIN_VEL) {
          inertiaRafRef.current = null;
          setIsInertia(false);
          return;
        }
        const { scale: sc, tx: px, ty: py } = stateRef.current;
        applyPanScale(sc, px + vx, py + vy);
        inertiaRafRef.current = requestAnimationFrame(tick);
      };
      inertiaRafRef.current = requestAnimationFrame(tick);
    },
    [applyPanScale]
  );

  const onTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      cancelInertia();
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        pinchStartDist.current = Math.hypot(dx, dy);
        pinchStartScale.current = stateRef.current.scale;
        panStart.current = null;
        return;
      }
      if (e.touches.length === 1 && stateRef.current.scale > ZOOM_MIN + 0.02) {
        const t = e.touches[0];
        const { tx: px, ty: py } = stateRef.current;
        panStart.current = { x: t.clientX, y: t.clientY, tx: px, ty: py };
        e.stopPropagation();
      }
    },
    [cancelInertia]
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
        const { tx: px, ty: py } = stateRef.current;
        applyPanScale(next, px, py);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.touches.length === 1 && panStart.current && stateRef.current.scale > ZOOM_MIN + 0.02) {
        const t = e.touches[0];
        const p = panStart.current;
        const { scale: sc } = stateRef.current;
        const nx = p.tx + (t.clientX - p.x);
        const ny = p.ty + (t.clientY - p.y);
        const cl = clampPan(nx, ny, sc, containerSize.w, containerSize.h, baseSize.w, baseSize.h);
        applyPanScale(sc, cl.tx, cl.ty);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [applyPanScale, containerSize, baseSize]
  );

  const onTouchEnd = React.useCallback(() => {
    pinchStartDist.current = null;
    const { tx: px, ty: py, scale: sc } = stateRef.current;
    if (sc > ZOOM_MIN + 0.02) {
      const cl = clampPan(px, py, sc, containerSize.w, containerSize.h, baseSize.w, baseSize.h);
      applyPanScale(sc, cl.tx, cl.ty);
    }
    panStart.current = null;
  }, [containerSize, baseSize, applyPanScale]);

  const zoomed = scale > ZOOM_MIN + 0.02;
  const transformTransition =
    snapTransition && !isDragging && !isInertia ? "transform 0.16s ease-out" : "none";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex max-h-[min(92dvh,calc(100dvh-6.5rem))] w-full max-w-[min(100vw-1rem,72rem)] touch-none items-center justify-center overflow-hidden",
        zoomed ? "cursor-grab active:cursor-grabbing" : ""
      )}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {zoomIndicator ? (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-3 z-[2] -translate-x-1/2 rounded-sm bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-100 transition-opacity duration-300 ease-out",
            zoomIndicatorOpaque ? "opacity-100" : "opacity-0"
          )}
          aria-live="polite"
        >
          {zoomIndicator}
        </div>
      ) : null}
      <div className="rounded-sm bg-zinc-900/35 p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_22px_56px_-14px_rgba(0,0,0,0.72)] ring-1 ring-white/10">
        <div
          role="presentation"
          onDoubleClick={onDoubleClick}
          className="flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-sm"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: "center center",
            willChange: "transform",
            transition: transformTransition,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={effectiveUrl}
            alt=""
            data-no-image-preview
            decoding="async"
            loading="eager"
            draggable={false}
            onLoad={onImgLoadWrapped}
            onError={onImgError}
            className={imgClassName}
          />
        </div>
      </div>
      {imgPhase === "ready" && scale <= ZOOM_MIN + 0.02 ? (
        <p className="pointer-events-none absolute bottom-1 left-1/2 z-[1] max-w-[90vw] -translate-x-1/2 rounded-sm bg-black/50 px-2.5 py-1 text-center text-[10px] leading-snug text-zinc-300/95">
          <span className="md:hidden">Pinch to zoom · double-tap</span>
          <span className="hidden md:inline">
            Scroll wheel to zoom (cursor-centered) · double-click · drag when zoomed
          </span>
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
    <div className="relative flex min-h-[50dvh] w-full max-w-[min(100vw-1rem,72rem)] flex-1 flex-col rounded-sm bg-zinc-900/40 p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_22px_56px_-14px_rgba(0,0,0,0.72)] ring-1 ring-white/10">
      <iframe
        title={title}
        src={src}
        onLoad={() => {
          loadedRef.current = true;
          setShowFallback(false);
        }}
        className="min-h-[50dvh] h-[min(88dvh,calc(100dvh-6.5rem))] w-full flex-1 rounded-sm border-0 bg-zinc-950"
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
  const [bitmapReady, setBitmapReady] = React.useState(false);
  const onRefreshRef = React.useRef(onRefreshPreviewUrl);
  onRefreshRef.current = onRefreshPreviewUrl;

  React.useEffect(() => {
    setLocalUrl(displayUrl);
    setRetryKey(0);
    setImgPhase("loading");
    setPreflightPhase("idle");
    setPreflightResult(null);
    setBitmapReady(false);
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
    if (preflightPhase !== "ok" || !effectiveUrl.trim()) {
      setBitmapReady(false);
      return;
    }
    let cancelled = false;
    setBitmapReady(false);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setBitmapReady(true);
    };
    img.onerror = () => {
      if (!cancelled) setBitmapReady(true);
    };
    img.src = effectiveUrl;
    return () => {
      cancelled = true;
    };
  }, [preflightPhase, effectiveUrl]);

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
        className="touch-manipulation border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10"
        onClick={openTab}
      >
        <ExternalLink className="mr-2 h-3.5 w-3.5" />
        Open in new tab
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="touch-manipulation border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10"
        disabled={downloadBusy || !effectiveUrl}
        onClick={() => void runDownload()}
      >
        <Download className="mr-2 h-3.5 w-3.5" />
        Download
      </Button>
    </div>
  );

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col items-stretch">
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-2 py-2">
        {preflightPhase === "checking" ? (
          <div
            className="flex w-full max-w-[min(100vw-2rem,56rem)] flex-col items-center gap-2"
            aria-busy
          >
            <Skeleton className="h-[min(72dvh,560px)] w-full rounded-sm bg-zinc-800/90" />
            <span className="sr-only">Checking preview URL</span>
          </div>
        ) : null}

        {preflightHardFail ? (
          <div
            className="flex max-w-md flex-col items-center gap-3 text-center"
            data-testid="receipt-preview-preflight-error"
          >
            <p className="text-sm text-zinc-400">
              Receipt could not be loaded
              {preflightResult?.status != null ? ` (HTTP ${preflightResult.status})` : ""}.
            </p>
            {failureActions}
            {onRefreshPreviewUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="touch-manipulation text-zinc-200 hover:bg-white/10 hover:text-white"
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
            {(!bitmapReady || imgPhase === "loading") && imgPhase !== "error" ? (
              <Skeleton className="pointer-events-none absolute inset-x-2 top-6 h-[min(68dvh,520px)] w-[min(calc(100%-1rem),56rem)] max-w-full rounded-sm bg-zinc-800/90" />
            ) : null}
            {imgPhase === "error" ? (
              <div
                className="flex max-w-md flex-col items-center gap-3 text-center"
                data-testid="receipt-preview-img-error"
              >
                <p className="text-sm text-zinc-400">Unable to load receipt</p>
                {failureActions}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="touch-manipulation text-zinc-200 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setImgPhase("loading");
                    setRetryKey((k) => k + 1);
                  }}
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : bitmapReady ? (
              <ZoomableImageFrame
                effectiveUrl={effectiveUrl}
                imgPhase={imgPhase}
                onZoomPanChange={onZoomPanChange}
                imgClassName={cn(
                  "max-h-[min(92dvh,calc(100dvh-6.5rem))] max-w-[min(100vw-1rem,100%)] object-contain select-none transition-opacity duration-300 ease-out",
                  imgPhase === "ready" ? "opacity-100" : "opacity-0"
                )}
                onImgLoad={() => {
                  setImgPhase("ready");
                }}
                onImgError={() => {
                  setImgPhase("error");
                }}
              />
            ) : null}
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
  /** Retry batch signed-URL resolution after failure. */
  onRetrySignedUrlResolve?: () => void;
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
  onRetrySignedUrlResolve,
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
  const pendingSignedUrl = current.pendingSignedUrl ?? false;
  const signedUrlResolveFailed = current.signedUrlResolveFailed ?? false;

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

  const primaryLabel = receiptViewerPrimaryLabel(fileName);
  const headerTitleAttr =
    itemCount > 1 ? `${primaryLabel} · Attachment ${safeIndex + 1} of ${itemCount}` : primaryLabel;
  const attachmentMeta = itemCount > 1 ? `Attachment ${safeIndex + 1} of ${itemCount}` : null;

  const showNav = itemCount > 1;
  const enableMotionDrag = showNav && !imageZoomed;

  const showFooter =
    Boolean(extraFooter) ||
    Boolean(showReplace && replaceInputRef && onReplaceClick && onReplaceInputChange);

  const navBtnClass =
    "h-12 w-12 shrink-0 touch-manipulation rounded-sm border border-white/15 bg-black/45 text-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.35)] backdrop-blur-sm hover:bg-white/10 max-md:h-[3.35rem] max-md:w-[3.35rem]";

  const toolbarIconBtn =
    "h-12 w-12 min-h-12 min-w-12 touch-manipulation text-zinc-100 hover:bg-white/10 max-md:h-[3.35rem] max-md:w-[3.35rem] max-md:min-h-[3.35rem] max-md:min-w-[3.35rem]";

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="attachment-preview-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-preview-title"
          data-attachment-preview-modal
          className="fixed inset-0 z-[201] flex min-h-0 flex-col bg-gradient-to-b from-zinc-900 via-zinc-950 to-black text-zinc-100 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_85%_65%_at_50%_35%,rgba(255,255,255,0.06),transparent_58%)]"
          style={{ zIndex: 10000, pointerEvents: "auto" }}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: "easeOut" } }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <h2
                id="attachment-preview-title"
                className="truncate text-base font-semibold tracking-tight text-zinc-50 md:text-[1.05rem]"
                title={headerTitleAttr}
              >
                <span className="sr-only">Receipt preview — </span>
                {primaryLabel}
              </h2>
              {attachmentMeta ? (
                <p
                  className="mt-0.5 tabular-nums text-xs font-medium text-zinc-500"
                  aria-live="polite"
                >
                  {attachmentMeta}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={toolbarIconBtn}
                aria-label="Download"
                disabled={!fileUrl || sessionIsLoading || unsupported || downloadBusy}
                onClick={() => void handleDownload()}
              >
                {downloadBusy ? (
                  <InlineLoading className="text-zinc-100" size="md" aria-label="Downloading" />
                ) : (
                  <Download className="h-5 w-5 max-md:h-6 max-md:w-6" />
                )}
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(toolbarIconBtn, "hover:bg-red-500/20 hover:text-red-200")}
                  aria-label="Delete attachment"
                  disabled={!fileUrl || sessionIsLoading || unsupported || deleteBusy}
                  onClick={() => void handleDelete()}
                >
                  {deleteBusy ? (
                    <InlineLoading className="text-zinc-100" size="md" aria-label="Deleting" />
                  ) : (
                    <Trash2 className="h-5 w-5 max-md:h-6 max-md:w-6" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={toolbarIconBtn}
                aria-label="Close"
                onClick={onClose}
              >
                <X className="h-5 w-5 max-md:h-6 max-md:w-6" />
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
                  <ChevronLeft className="h-6 w-6 max-md:h-7 max-md:w-7" />
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
                  <ChevronRight className="h-6 w-6 max-md:h-7 max-md:w-7" />
                </Button>
              </>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-1 max-md:px-2">
              {sessionIsLoading ? (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4"
                  aria-busy
                >
                  <Skeleton className="h-[min(72dvh,560px)] w-full max-w-[min(100vw-2rem,56rem)] rounded-sm bg-zinc-800/90" />
                  <span className="sr-only">Loading preview</span>
                </div>
              ) : unsupported ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
                  <p className="text-sm text-zinc-400">Preview not available for this file type.</p>
                </div>
              ) : !fileUrl && pendingSignedUrl ? (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4"
                  aria-busy
                >
                  <Skeleton className="h-[min(72dvh,560px)] w-full max-w-[min(100vw-2rem,56rem)] rounded-sm bg-zinc-800/90" />
                  <span className="sr-only">Loading receipt preview</span>
                </div>
              ) : !fileUrl && signedUrlResolveFailed ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
                  <p className="text-sm text-zinc-400">Unable to load receipt</p>
                  {onRetrySignedUrlResolve ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="touch-manipulation border-white/20 bg-white/10 text-zinc-100 hover:bg-white/15"
                      onClick={() => onRetrySignedUrlResolve()}
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  ) : null}
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
