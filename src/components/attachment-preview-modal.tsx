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
import { ReceiptViewerDialog } from "@/components/receipt-viewer/receipt-viewer-dialog";
import {
  type ReceiptViewerCanvasHandle,
  type ReceiptViewerPresentation,
  type ReceiptViewerTransformState,
} from "@/components/receipt-viewer/types";
import {
  clampReceiptViewerPan,
  getReceiptViewerTransformMetrics,
  type ReceiptViewerTransformMetrics,
} from "@/components/receipt-viewer/transform-metrics";
import { useReceiptViewer } from "@/components/receipt-viewer/use-receipt-viewer";
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
const PREVIEW_IMAGE_WARM_CACHE_LIMIT = 80;
const PREVIEW_VIEWPORT_CLASS =
  "h-[min(72dvh,620px)] w-full max-w-[min(100vw-1rem,72rem)] max-md:h-[min(62dvh,520px)]";

const warmedPreviewImageUrls = new Set<string>();
const inflightPreviewImageWarmups = new Map<string, Promise<void>>();

type PreflightPhase = "idle" | "checking" | "ok" | "error";

function isImmediatePreviewUrl(url: string): boolean {
  return /^(blob|data):/i.test((url ?? "").trim());
}

function localPreflightResult(url: string): PreviewUrlPreflightResult {
  return {
    ok: true,
    method: isImmediatePreviewUrl(url) ? "local" : "memory",
  };
}

function rememberPreviewImageWarm(url: string): void {
  const u = (url ?? "").trim();
  if (!u) return;
  warmedPreviewImageUrls.delete(u);
  warmedPreviewImageUrls.add(u);
  while (warmedPreviewImageUrls.size > PREVIEW_IMAGE_WARM_CACHE_LIMIT) {
    const oldest = warmedPreviewImageUrls.values().next().value as string | undefined;
    if (!oldest) break;
    warmedPreviewImageUrls.delete(oldest);
  }
}

function isPreviewImageWarm(url: string): boolean {
  const u = (url ?? "").trim();
  return !!u && warmedPreviewImageUrls.has(u);
}

function warmPreviewImage(url: string): Promise<void> {
  const u = (url ?? "").trim();
  if (
    !u ||
    typeof window === "undefined" ||
    typeof Image === "undefined" ||
    warmedPreviewImageUrls.has(u)
  ) {
    return Promise.resolve();
  }
  const existing = inflightPreviewImageWarmups.get(u);
  if (existing) return existing;

  const p = new Promise<void>((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      if (loaded) rememberPreviewImageWarm(u);
      inflightPreviewImageWarmups.delete(u);
      resolve();
    };
    img.decoding = "async";
    img.loading = "eager";
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = u;
    if (img.complete && img.naturalWidth > 0) {
      finish(true);
    } else {
      void img
        .decode?.()
        .then(() => finish(true))
        .catch(() => undefined);
    }
  });
  inflightPreviewImageWarmups.set(u, p);
  return p;
}

export function prewarmAttachmentPreviewImages(
  files: AttachmentPreviewFileItem[],
  currentIndex: number
): void {
  if (typeof window === "undefined") return;
  const ordered = [currentIndex, currentIndex + 1, currentIndex - 1];
  for (const rawIndex of ordered) {
    if (files.length === 0) break;
    const index = ((rawIndex % files.length) + files.length) % files.length;
    const file = files[index];
    if (!file || file.unsupported || file.pendingSignedUrl) continue;
    const type = file.fileType ?? inferAttachmentPreviewType(file.fileName ?? "", file.url);
    if (type !== "image") continue;
    void warmPreviewImage(file.url);
  }
}

function useFastMobilePreviewMotion(): boolean {
  const [fast, setFast] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const coarse = window.matchMedia("(hover: none) and (pointer: coarse)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setFast(coarse.matches || reduced.matches);
    update();
    coarse.addEventListener?.("change", update);
    reduced.addEventListener?.("change", update);
    return () => {
      coarse.removeEventListener?.("change", update);
      reduced.removeEventListener?.("change", update);
    };
  }, []);

  return fast;
}

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

type ReceiptImageCanvasProps = {
  effectiveUrl: string;
  imgPhase: "loading" | "ready" | "error";
  imgClassName: string;
  onImgLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onImgError: () => void;
  onZoomPanChange?: (zoomed: boolean) => void;
  onTransformStateChange?: (state: ReceiptViewerTransformState) => void;
  showLoadingSkeleton?: boolean;
  viewerMode?: boolean;
};

const ReceiptImageCanvas = React.forwardRef<ReceiptViewerCanvasHandle, ReceiptImageCanvasProps>(
  function ReceiptImageCanvas(
    {
      effectiveUrl,
      imgPhase,
      imgClassName,
      onImgLoad,
      onImgError,
      onZoomPanChange,
      onTransformStateChange,
      showLoadingSkeleton = false,
      viewerMode = false,
    },
    ref
  ) {
    const [scale, setScale] = React.useState(1);
    const [tx, setTx] = React.useState(0);
    const [ty, setTy] = React.useState(0);
    const [rotation, setRotation] = React.useState(0);
    const [baseSize, setBaseSize] = React.useState({ w: 0, h: 0 });
    const [naturalSize, setNaturalSize] = React.useState({ w: 0, h: 0 });
    const [containerSize, setContainerSize] = React.useState({ w: 0, h: 0 });
    const [isDragging, setIsDragging] = React.useState(false);
    const [isInertia, setIsInertia] = React.useState(false);
    const [snapTransition, setSnapTransition] = React.useState(false);
    const [zoomIndicator, setZoomIndicator] = React.useState<string | null>(null);
    const [zoomIndicatorOpaque, setZoomIndicatorOpaque] = React.useState(true);
    const [panIndicatorVisible, setPanIndicatorVisible] = React.useState(false);

    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const stateRef = React.useRef({ scale: 1, tx: 0, ty: 0 });
    const pinchStartDist = React.useRef<number | null>(null);
    const pinchStartScale = React.useRef(1);
    const panStart = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
    const touchTapStartRef = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);
    const lastTouchTapRef = React.useRef<{ x: number; y: number; at: number } | null>(null);
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
    const panIndicatorTimerRef = React.useRef<number | null>(null);
    const mediaSessionRef = React.useRef(0);
    const transformMetrics = React.useMemo(
      () =>
        getReceiptViewerTransformMetrics({
          containerWidth: containerSize.w,
          containerHeight: containerSize.h,
          naturalWidth: viewerMode ? naturalSize.w : baseSize.w,
          naturalHeight: viewerMode ? naturalSize.h : baseSize.h,
          rotation,
          zoom: scale,
        }),
      [
        baseSize.h,
        baseSize.w,
        containerSize.h,
        containerSize.w,
        naturalSize.h,
        naturalSize.w,
        rotation,
        scale,
        viewerMode,
      ]
    );
    const metricsRef = React.useRef<ReceiptViewerTransformMetrics>(transformMetrics);

    React.useLayoutEffect(() => {
      stateRef.current = { scale, tx, ty };
    }, [scale, tx, ty]);

    React.useLayoutEffect(() => {
      metricsRef.current = transformMetrics;
    }, [transformMetrics]);

    React.useEffect(() => {
      mediaSessionRef.current += 1;
      setScale(1);
      setTx(0);
      setTy(0);
      setRotation(0);
      setNaturalSize({ w: 0, h: 0 });
      pinchStartDist.current = null;
      panStart.current = null;
      touchTapStartRef.current = null;
      lastTouchTapRef.current = null;
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
      setPanIndicatorVisible(false);
      if (panIndicatorTimerRef.current != null) {
        window.clearTimeout(panIndicatorTimerRef.current);
        panIndicatorTimerRef.current = null;
      }
    }, [effectiveUrl]);

    React.useEffect(() => {
      onZoomPanChange?.(scale > ZOOM_MIN + 0.02 || Math.abs(tx) > 2 || Math.abs(ty) > 2);
    }, [scale, tx, ty, onZoomPanChange]);

    React.useEffect(() => {
      onTransformStateChange?.({
        ready: imgPhase === "ready",
        zoomPercent: Math.round(scale * 100),
        rotation,
        zoomed: scale > ZOOM_MIN + 0.02 || Math.abs(tx) > 2 || Math.abs(ty) > 2,
      });
    }, [imgPhase, onTransformStateChange, rotation, scale, tx, ty]);

    const measureSizes = React.useCallback(() => {
      const c = containerRef.current;
      const im = imgRef.current;
      if (c) {
        setContainerSize({ w: c.clientWidth, h: c.clientHeight });
      }
      if (im && im.complete) {
        setBaseSize({ w: im.offsetWidth, h: im.offsetHeight });
        if (im.naturalWidth > 0 && im.naturalHeight > 0) {
          setNaturalSize({ w: im.naturalWidth, h: im.naturalHeight });
        }
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

    const hidePanIndicator = React.useCallback(() => {
      if (panIndicatorTimerRef.current != null) {
        window.clearTimeout(panIndicatorTimerRef.current);
        panIndicatorTimerRef.current = null;
      }
      setPanIndicatorVisible(false);
    }, []);

    const showPanIndicator = React.useCallback(
      (autoHide: boolean) => {
        if (!viewerMode) return;
        const metrics = metricsRef.current;
        if (!metrics.overflowX && !metrics.overflowY) {
          hidePanIndicator();
          return;
        }
        setPanIndicatorVisible(true);
        if (panIndicatorTimerRef.current != null) {
          window.clearTimeout(panIndicatorTimerRef.current);
          panIndicatorTimerRef.current = null;
        }
        if (autoHide) {
          panIndicatorTimerRef.current = window.setTimeout(() => {
            panIndicatorTimerRef.current = null;
            setPanIndicatorVisible(false);
          }, 850);
        }
      },
      [hidePanIndicator, viewerMode]
    );

    React.useEffect(
      () => () => {
        if (panIndicatorTimerRef.current != null) {
          window.clearTimeout(panIndicatorTimerRef.current);
        }
      },
      []
    );

    const applyPanScale = React.useCallback(
      (nextScale: number, nextTx: number, nextTy: number, nextRotation = rotation) => {
        const { w: cw, h: ch } = containerSize;
        const { w: bw, h: bh } = baseSize;
        let s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
        let nx = nextTx;
        let ny = nextTy;
        if (viewerMode) {
          const metrics = getReceiptViewerTransformMetrics({
            containerWidth: cw,
            containerHeight: ch,
            naturalWidth: naturalSize.w,
            naturalHeight: naturalSize.h,
            rotation: nextRotation,
            zoom: s,
          });
          metricsRef.current = metrics;
          const clamped =
            s <= ZOOM_MIN ? { tx: 0, ty: 0 } : clampReceiptViewerPan(metrics, nextTx, nextTy);
          nx = clamped.tx;
          ny = clamped.ty;
        } else if (s <= ZOOM_MIN) {
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
      [baseSize, containerSize, naturalSize, rotation, viewerMode]
    );

    React.useLayoutEffect(() => {
      if (!viewerMode || naturalSize.w <= 0 || naturalSize.h <= 0) return;
      const current = stateRef.current;
      const clamped =
        current.scale <= ZOOM_MIN
          ? { tx: 0, ty: 0 }
          : clampReceiptViewerPan(transformMetrics, current.tx, current.ty);
      metricsRef.current = transformMetrics;
      if (Math.abs(clamped.tx - current.tx) > 0.01 || Math.abs(clamped.ty - current.ty) > 0.01) {
        stateRef.current = { ...current, tx: clamped.tx, ty: clamped.ty };
        setTx(clamped.tx);
        setTy(clamped.ty);
      }
      if (!transformMetrics.overflowX && !transformMetrics.overflowY) {
        hidePanIndicator();
      }
    }, [hidePanIndicator, naturalSize.h, naturalSize.w, transformMetrics, viewerMode]);

    const fitView = React.useCallback(() => {
      cancelInertia();
      hidePanIndicator();
      setSnapTransition(true);
      window.setTimeout(() => setSnapTransition(false), 180);
      applyPanScale(ZOOM_MIN, 0, 0);
    }, [applyPanScale, cancelInertia, hidePanIndicator]);

    const resetView = React.useCallback(() => {
      setRotation(0);
      fitView();
    }, [fitView]);

    const rotateBy = React.useCallback(
      (degrees: number) => {
        cancelInertia();
        setSnapTransition(true);
        window.setTimeout(() => setSnapTransition(false), 180);
        const next = (rotation + degrees) % 360;
        const normalized = next < 0 ? next + 360 : next;
        setRotation(normalized);
        applyPanScale(ZOOM_MIN, 0, 0, normalized);
        hidePanIndicator();
      },
      [applyPanScale, cancelInertia, hidePanIndicator, rotation]
    );

    React.useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          cancelInertia();
          const current = stateRef.current;
          applyPanScale(Math.min(ZOOM_MAX, current.scale + 0.25), current.tx, current.ty);
        },
        zoomOut: () => {
          cancelInertia();
          const current = stateRef.current;
          applyPanScale(Math.max(ZOOM_MIN, current.scale - 0.25), current.tx, current.ty);
        },
        fit: fitView,
        reset: resetView,
        rotateLeft: () => rotateBy(-90),
        rotateRight: () => rotateBy(90),
      }),
      [applyPanScale, cancelInertia, fitView, resetView, rotateBy]
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
        hidePanIndicator();
        return;
      }
      const p = cursorCenteredPan(pcx, pcy, cx, cy, px, py, sc, nextScale);
      applyPanScale(nextScale, p.tx, p.ty);
      showPanIndicator(true);
    }, [applyPanScale, hidePanIndicator, showPanIndicator]);

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
        const image = e.currentTarget;
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          setNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
        }
        const session = mediaSessionRef.current;
        const reveal = () => {
          if (mediaSessionRef.current !== session || image.src !== effectiveUrl) return;
          onImgLoad(e);
          requestAnimationFrame(() => measureSizes());
        };
        if (typeof image.decode === "function") {
          void image
            .decode()
            .then(reveal)
            .catch(() => {
              if (image.complete && image.naturalWidth > 0) reveal();
              else onImgError();
            });
        } else {
          reveal();
        }
      },
      [effectiveUrl, measureSizes, onImgError, onImgLoad]
    );

    const toggleZoomAt = React.useCallback(
      (clientX: number, clientY: number) => {
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
          hidePanIndicator();
          return;
        }
        const nextScale = Math.min(2, ZOOM_MAX);
        const p = cursorCenteredPan(clientX, clientY, centerX, centerY, px, py, sc, nextScale);
        applyPanScale(nextScale, p.tx, p.ty);
        showPanIndicator(true);
      },
      [applyPanScale, cancelInertia, hidePanIndicator, showPanIndicator]
    );

    const onDoubleClick = React.useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggleZoomAt(e.clientX, e.clientY);
      },
      [toggleZoomAt]
    );

    const onPointerDown = React.useCallback(
      (e: React.PointerEvent) => {
        if (
          e.pointerType !== "mouse" ||
          e.button !== 0 ||
          stateRef.current.scale <= ZOOM_MIN + 0.02 ||
          (!metricsRef.current.overflowX && !metricsRef.current.overflowY)
        )
          return;
        cancelInertia();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setIsDragging(true);
        showPanIndicator(false);
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
      [cancelInertia, showPanIndicator]
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
        showPanIndicator(false);
      },
      [applyPanScale, showPanIndicator]
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
        if (v < MIN_VEL) {
          showPanIndicator(true);
          return;
        }
        setIsInertia(true);
        let vx = d.vx;
        let vy = d.vy;
        const tick = () => {
          vx *= FRICTION;
          vy *= FRICTION;
          if (Math.hypot(vx, vy) < MIN_VEL) {
            inertiaRafRef.current = null;
            setIsInertia(false);
            showPanIndicator(true);
            return;
          }
          const { scale: sc, tx: px, ty: py } = stateRef.current;
          applyPanScale(sc, px + vx, py + vy);
          inertiaRafRef.current = requestAnimationFrame(tick);
        };
        inertiaRafRef.current = requestAnimationFrame(tick);
      },
      [applyPanScale, showPanIndicator]
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
          touchTapStartRef.current = null;
          return;
        }
        if (e.touches.length === 1) {
          const t = e.touches[0];
          touchTapStartRef.current = { x: t.clientX, y: t.clientY, moved: false };
          if (
            stateRef.current.scale > ZOOM_MIN + 0.02 &&
            (metricsRef.current.overflowX || metricsRef.current.overflowY)
          ) {
            const { tx: px, ty: py } = stateRef.current;
            panStart.current = { x: t.clientX, y: t.clientY, tx: px, ty: py };
            showPanIndicator(false);
            e.stopPropagation();
          }
        }
      },
      [cancelInertia, showPanIndicator]
    );

    const onTouchMove = React.useCallback(
      (e: React.TouchEvent) => {
        if (e.touches.length === 1 && touchTapStartRef.current) {
          const touch = e.touches[0];
          if (
            Math.hypot(
              touch.clientX - touchTapStartRef.current.x,
              touch.clientY - touchTapStartRef.current.y
            ) > 8
          ) {
            touchTapStartRef.current.moved = true;
          }
        }
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
        if (
          e.touches.length === 1 &&
          panStart.current &&
          stateRef.current.scale > ZOOM_MIN + 0.02
        ) {
          const t = e.touches[0];
          const p = panStart.current;
          if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > 8 && touchTapStartRef.current) {
            touchTapStartRef.current.moved = true;
          }
          const { scale: sc } = stateRef.current;
          const nx = p.tx + (t.clientX - p.x);
          const ny = p.ty + (t.clientY - p.y);
          applyPanScale(sc, nx, ny);
          showPanIndicator(false);
          e.preventDefault();
          e.stopPropagation();
        }
      },
      [applyPanScale, showPanIndicator]
    );

    const onTouchEnd = React.useCallback(
      (e: React.TouchEvent) => {
        const tapStart = touchTapStartRef.current;
        if (
          pinchStartDist.current == null &&
          tapStart &&
          !tapStart.moved &&
          e.changedTouches.length === 1
        ) {
          const touch = e.changedTouches[0];
          const now = Date.now();
          const previous = lastTouchTapRef.current;
          if (
            previous &&
            now - previous.at <= 320 &&
            Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) <= 32
          ) {
            e.preventDefault();
            e.stopPropagation();
            lastTouchTapRef.current = null;
            toggleZoomAt(touch.clientX, touch.clientY);
          } else {
            lastTouchTapRef.current = { x: touch.clientX, y: touch.clientY, at: now };
          }
        }
        pinchStartDist.current = null;
        const { tx: px, ty: py, scale: sc } = stateRef.current;
        if (sc > ZOOM_MIN + 0.02) {
          applyPanScale(sc, px, py);
        }
        panStart.current = null;
        touchTapStartRef.current = null;
        showPanIndicator(true);
      },
      [applyPanScale, showPanIndicator, toggleZoomAt]
    );

    const zoomed = scale > ZOOM_MIN + 0.02;
    const transformTransition =
      snapTransition && !isDragging && !isInertia ? "transform 0.16s ease-out" : "none";

    return (
      <div
        ref={containerRef}
        data-testid={viewerMode ? "receipt-viewer-canvas" : "attachment-preview-viewport"}
        data-zoom={viewerMode ? Math.round(scale * 100) : undefined}
        data-rotation={viewerMode ? rotation : undefined}
        data-overflow-x={viewerMode ? String(transformMetrics.overflowX) : undefined}
        data-overflow-y={viewerMode ? String(transformMetrics.overflowY) : undefined}
        data-pan-x={viewerMode ? Math.round(tx * 100) / 100 : undefined}
        data-pan-y={viewerMode ? Math.round(ty * 100) / 100 : undefined}
        data-max-pan-x={viewerMode ? Math.round(transformMetrics.maxPanX * 100) / 100 : undefined}
        data-max-pan-y={viewerMode ? Math.round(transformMetrics.maxPanY * 100) / 100 : undefined}
        className={cn(
          "relative flex shrink-0 touch-none items-center justify-center overflow-hidden",
          viewerMode ? "h-full min-h-0 w-full max-w-none flex-1 shrink" : PREVIEW_VIEWPORT_CLASS,
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
        {showLoadingSkeleton ? (
          <Skeleton
            data-testid="attachment-preview-viewport-skeleton"
            className="pointer-events-none absolute inset-0 z-[2] rounded-sm bg-zinc-800/90"
          />
        ) : null}
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
        {viewerMode && transformMetrics.overflowX ? (
          <div
            data-testid="receipt-pan-indicator-x"
            data-visible={panIndicatorVisible ? "true" : "false"}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-2 z-[3] h-[3px] rounded-full bg-zinc-500/65 transition-opacity duration-200 ease-out motion-reduce:transition-none",
              panIndicatorVisible ? "opacity-100" : "opacity-0"
            )}
            style={{
              width: `${Math.max(
                24,
                (containerSize.w / transformMetrics.renderedWidth) *
                  Math.max(0, containerSize.w - 24)
              )}px`,
              left: `${(() => {
                const track = Math.max(0, containerSize.w - 24);
                const thumb = Math.max(
                  24,
                  (containerSize.w / transformMetrics.renderedWidth) * track
                );
                const progress =
                  transformMetrics.maxPanX > 0
                    ? (transformMetrics.maxPanX - tx) / (transformMetrics.maxPanX * 2)
                    : 0.5;
                return 12 + Math.max(0, Math.min(1, progress)) * Math.max(0, track - thumb);
              })()}px`,
            }}
          />
        ) : null}
        {viewerMode && transformMetrics.overflowY ? (
          <div
            data-testid="receipt-pan-indicator-y"
            data-visible={panIndicatorVisible ? "true" : "false"}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-2 z-[3] w-[3px] rounded-full bg-zinc-500/65 transition-opacity duration-200 ease-out motion-reduce:transition-none",
              panIndicatorVisible ? "opacity-100" : "opacity-0"
            )}
            style={{
              height: `${Math.max(
                24,
                (containerSize.h / transformMetrics.renderedHeight) *
                  Math.max(0, containerSize.h - 24)
              )}px`,
              top: `${(() => {
                const track = Math.max(0, containerSize.h - 24);
                const thumb = Math.max(
                  24,
                  (containerSize.h / transformMetrics.renderedHeight) * track
                );
                const progress =
                  transformMetrics.maxPanY > 0
                    ? (transformMetrics.maxPanY - ty) / (transformMetrics.maxPanY * 2)
                    : 0.5;
                return 12 + Math.max(0, Math.min(1, progress)) * Math.max(0, track - thumb);
              })()}px`,
            }}
          />
        ) : null}
        <div className="relative z-[1] h-full w-full rounded-sm bg-zinc-900/35 p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_22px_56px_-14px_rgba(0,0,0,0.72)] ring-1 ring-white/10">
          <div
            role="presentation"
            onDoubleClick={onDoubleClick}
            className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-sm"
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
              style={{
                width: viewerMode && naturalSize.w > 0 ? `${naturalSize.w}px` : undefined,
                height: viewerMode && naturalSize.h > 0 ? `${naturalSize.h}px` : undefined,
                maxWidth: viewerMode ? "none" : undefined,
                maxHeight: viewerMode ? "none" : undefined,
                position: viewerMode ? "absolute" : undefined,
                left: viewerMode ? "50%" : undefined,
                top: viewerMode ? "50%" : undefined,
                transform: viewerMode
                  ? `translate3d(calc(-50% + ${tx}px), calc(-50% + ${ty}px), 0) scale(${transformMetrics.renderScale}) rotate(${rotation}deg)`
                  : `translate3d(${tx}px, ${ty}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                willChange: "transform",
                transition: transformTransition,
              }}
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
);
ReceiptImageCanvas.displayName = "ReceiptImageCanvas";

function PdfPreviewFrame({
  src,
  title,
  viewerMode = false,
}: {
  src: string;
  title: string;
  viewerMode?: boolean;
}) {
  const loadedRef = React.useRef(false);
  const [loaded, setLoaded] = React.useState(false);
  const [showFallback, setShowFallback] = React.useState(false);
  React.useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setShowFallback(false);
    const t = window.setTimeout(() => {
      if (!loadedRef.current) setShowFallback(true);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [src]);

  return (
    <div
      data-testid="attachment-preview-viewport"
      className={cn(
        "relative flex shrink-0 flex-col rounded-sm bg-zinc-900/40 p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_22px_56px_-14px_rgba(0,0,0,0.72)] ring-1 ring-white/10",
        viewerMode ? "h-full min-h-0 w-full max-w-none" : PREVIEW_VIEWPORT_CLASS
      )}
    >
      <iframe
        title={title}
        src={src}
        onLoad={() => {
          loadedRef.current = true;
          setLoaded(true);
          setShowFallback(false);
        }}
        className={cn(
          "h-full w-full flex-1 rounded-sm border-0 bg-zinc-950 transition-opacity duration-200 ease-out",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
      {!loaded && !showFallback ? (
        <Skeleton className="pointer-events-none absolute inset-[1px] rounded-sm bg-zinc-800/90" />
      ) : null}
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
  canvasRef,
  onTransformStateChange,
  fastMotion,
  viewerMode = false,
}: {
  displayUrl: string;
  fileName: string;
  mimeHint?: string;
  onRefreshPreviewUrl?: () => Promise<string | null>;
  downloadBusy: boolean;
  onDownload?: () => void | Promise<void>;
  defaultDownload: () => void | Promise<void>;
  onZoomPanChange?: (zoomed: boolean) => void;
  canvasRef?: React.Ref<ReceiptViewerCanvasHandle>;
  onTransformStateChange?: (state: ReceiptViewerTransformState) => void;
  fastMotion: boolean;
  viewerMode?: boolean;
}) {
  const initialPreflight = isImmediatePreviewUrl(displayUrl) || isPreviewImageWarm(displayUrl);
  const [preflightPhase, setPreflightPhase] = React.useState<PreflightPhase>(
    initialPreflight ? "ok" : "checking"
  );
  const [preflightResult, setPreflightResult] = React.useState<PreviewUrlPreflightResult | null>(
    initialPreflight ? localPreflightResult(displayUrl) : null
  );
  const [imgPhase, setImgPhase] = React.useState<"loading" | "ready" | "error">(
    isPreviewImageWarm(displayUrl) ? "ready" : "loading"
  );
  const [retryKey, setRetryKey] = React.useState(0);
  const [localUrl, setLocalUrl] = React.useState(displayUrl);
  const autoRefreshAttemptedRef = React.useRef(false);
  const onRefreshRef = React.useRef(onRefreshPreviewUrl);
  onRefreshRef.current = onRefreshPreviewUrl;

  React.useEffect(() => {
    const warmed = isPreviewImageWarm(displayUrl);
    const local = isImmediatePreviewUrl(displayUrl);
    setLocalUrl(displayUrl);
    autoRefreshAttemptedRef.current = false;
    setRetryKey(0);
    setImgPhase(warmed ? "ready" : "loading");
    setPreflightPhase(local || warmed ? "ok" : "checking");
    setPreflightResult(local || warmed ? localPreflightResult(displayUrl) : null);
  }, [displayUrl]);

  const effectiveUrl =
    retryKey > 0
      ? `${localUrl}${localUrl.includes("?") ? "&" : "?"}hh_retry=${retryKey}`
      : localUrl;

  React.useEffect(() => {
    if (!effectiveUrl.trim()) return;
    if (isImmediatePreviewUrl(effectiveUrl) || isPreviewImageWarm(effectiveUrl)) {
      setPreflightResult(localPreflightResult(effectiveUrl));
      setPreflightPhase("ok");
      return;
    }
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
  const previewStage =
    preflightPhase === "checking" ? "checking" : preflightHardFail ? "preflight-error" : imgPhase;
  const previewViewportClass = viewerMode
    ? "h-full min-h-0 w-full max-w-none"
    : PREVIEW_VIEWPORT_CLASS;

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
    <div
      className={cn("flex w-full min-h-0 flex-1 flex-col items-stretch", viewerMode && "h-full")}
      data-testid="receipt-preview-image-area"
      data-preview-stage={previewStage}
    >
      <div
        data-testid="attachment-preview-viewport"
        className={cn(
          "relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-2 py-2",
          viewerMode && "h-full"
        )}
      >
        {preflightPhase === "checking" ? (
          <div
            data-testid="attachment-preview-viewport"
            className={cn(
              "relative flex shrink-0 items-center justify-center overflow-hidden",
              previewViewportClass
            )}
            aria-busy
          >
            <Skeleton className="pointer-events-none absolute inset-0 rounded-sm bg-zinc-800/90" />
            <span className="sr-only">Checking preview URL</span>
          </div>
        ) : null}

        {preflightHardFail ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 px-4 text-center",
              previewViewportClass
            )}
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
            {imgPhase === "loading" ? (
              <span className="sr-only">Loading receipt preview</span>
            ) : null}
            {imgPhase === "error" ? (
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 px-4 text-center",
                  previewViewportClass
                )}
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
            ) : (
              <ReceiptImageCanvas
                ref={canvasRef}
                effectiveUrl={effectiveUrl}
                imgPhase={imgPhase}
                onZoomPanChange={onZoomPanChange}
                onTransformStateChange={onTransformStateChange}
                showLoadingSkeleton={imgPhase === "loading"}
                viewerMode={viewerMode}
                imgClassName={cn(
                  "select-none object-contain",
                  viewerMode ? "max-h-full max-w-full" : "h-full w-full",
                  viewerMode
                    ? "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-opacity motion-reduce:duration-75"
                    : fastMotion
                      ? "transition-opacity duration-75 ease-out"
                      : "transition-opacity duration-300 ease-out",
                  imgPhase === "ready" ? "opacity-100" : "opacity-0"
                )}
                onImgLoad={() => {
                  rememberPreviewImageWarm(effectiveUrl);
                  setImgPhase("ready");
                }}
                onImgError={() => {
                  const refresh = onRefreshRef.current;
                  if (!refresh || autoRefreshAttemptedRef.current) {
                    setImgPhase("error");
                    return;
                  }
                  autoRefreshAttemptedRef.current = true;
                  setImgPhase("loading");
                  void refresh()
                    .then((next) => {
                      const nextUrl = (next ?? "").trim();
                      if (!nextUrl) {
                        setImgPhase("error");
                        return;
                      }
                      setLocalUrl(nextUrl);
                      setRetryKey((value) => value + 1);
                    })
                    .catch(() => {
                      setImgPhase("error");
                    });
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
  /** Retry batch signed-URL resolution after failure. */
  onRetrySignedUrlResolve?: () => void;
  /** Receipt-specific accessible presentation; omitted for the legacy generic attachment viewer. */
  presentation?: ReceiptViewerPresentation;
  /** Exact element that launched the preview. */
  returnFocusTarget?: HTMLElement | null;
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
  presentation,
  returnFocusTarget,
}: AttachmentPreviewModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState(1);
  const [imageZoomed, setImageZoomed] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const fastPreviewMotion = useFastMobilePreviewMotion();
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const {
    controlsRef: viewerControlsRef,
    transformState: viewerTransformState,
    onTransformStateChange: setViewerTransformState,
    resetSession: resetReceiptViewerSession,
  } = useReceiptViewer();

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
    resetReceiptViewerSession();
  }, [safeIndex, fileUrl, resetReceiptViewerSession]);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!isOpen || itemCount === 0) return;
    prewarmAttachmentPreviewImages(files, safeIndex);
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
    if (!isOpen || presentation?.kind === "receipt") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, presentation?.kind]);

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

  if (presentation?.kind === "receipt") {
    const receiptMedia = sessionIsLoading ? (
      <div
        data-testid="attachment-preview-viewport"
        className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden"
        aria-busy
      >
        <Skeleton className="absolute inset-0 rounded-xl bg-zinc-800/80" />
        <span className="sr-only">Loading preview</span>
      </div>
    ) : unsupported ? (
      <div className="flex h-full w-full items-center justify-center px-5 text-center">
        <p className="text-sm text-[var(--neo-canvas-text-tertiary)]">
          Preview is not available for this file type.
        </p>
      </div>
    ) : !fileUrl && pendingSignedUrl ? (
      <div
        data-testid="attachment-preview-viewport"
        className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden"
        aria-busy
      >
        <Skeleton className="absolute inset-0 rounded-xl bg-zinc-800/80" />
        <span className="sr-only">Loading receipt preview</span>
      </div>
    ) : !fileUrl && signedUrlResolveFailed ? (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-sm text-[var(--neo-canvas-text-tertiary)]">Unable to load receipt</p>
        {onRetrySignedUrlResolve ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 touch-manipulation border-white/15 bg-white/5 text-[var(--neo-canvas-text-primary)] hover:bg-white/10"
            onClick={onRetrySignedUrlResolve}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Retry
          </Button>
        ) : null}
      </div>
    ) : !fileUrl ? (
      <div className="flex h-full w-full items-center justify-center px-5 text-center">
        <p className="text-sm text-[var(--neo-canvas-text-tertiary)]">Receipt not available.</p>
      </div>
    ) : fileType === "pdf" ? (
      <PdfPreviewFrame src={fileUrl} title={fileName} viewerMode />
    ) : (
      <ReceiptPreviewImageArea
        key={`${safeIndex}-${fileUrl}`}
        displayUrl={fileUrl}
        fileName={fileName}
        mimeHint={mimeHint}
        onRefreshPreviewUrl={onRefreshPreviewUrl}
        downloadBusy={downloadBusy}
        onDownload={onDownload}
        defaultDownload={() => void downloadPreviewBlob(fileUrl, fileName)}
        onZoomPanChange={setImageZoomed}
        canvasRef={viewerControlsRef}
        onTransformStateChange={setViewerTransformState}
        fastMotion={false}
        viewerMode
      />
    );

    const replaceControl =
      showReplace && replaceInputRef && onReplaceClick && onReplaceInputChange ? (
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
            className="min-h-11 touch-manipulation border-white/15 bg-white/5 text-[var(--neo-canvas-text-primary)] hover:bg-white/10 lg:min-h-9"
            disabled={replaceBusy}
            onClick={onReplaceClick}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
            {replaceBusy ? "Replacing…" : "Replace"}
          </Button>
        </>
      ) : null;

    return (
      <ReceiptViewerDialog
        isOpen={isOpen}
        onClose={onClose}
        returnFocusTarget={returnFocusTarget}
        fileName={fileName}
        attachmentLabel={itemCount > 1 ? `Attachment ${safeIndex + 1} of ${itemCount}` : null}
        metadata={{ ...presentation.metadata, uploadFileName: fileName }}
        media={receiptMedia}
        controls={viewerControlsRef}
        transformState={viewerTransformState}
        onDownload={handleDownload}
        downloadBusy={downloadBusy}
        downloadDisabled={!fileUrl || sessionIsLoading || unsupported}
        onPrevious={itemCount > 1 ? goPrev : undefined}
        onNext={itemCount > 1 ? goNext : undefined}
        footerTrailing={
          <>
            {extraFooter}
            {replaceControl}
          </>
        }
      />
    );
  }

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
    "h-12 w-12 shrink-0 touch-manipulation rounded-lg border border-white/15 bg-[rgb(10_13_16_/_0.72)] text-[var(--neo-canvas-text-primary)] shadow-[0_2px_12px_rgba(0,0,0,0.35)] backdrop-blur-sm hover:border-[rgb(184_137_45_/_0.35)] hover:bg-[rgb(184_137_45_/_0.12)] max-md:h-[3.35rem] max-md:w-[3.35rem]";

  const toolbarIconBtn =
    "h-12 w-12 min-h-12 min-w-12 touch-manipulation text-[var(--neo-canvas-text-primary)] hover:bg-white/10 hover:text-[var(--neo-gold-soft)] max-md:h-[3.35rem] max-md:w-[3.35rem] max-md:min-h-[3.35rem] max-md:min-w-[3.35rem]";

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="attachment-preview-shell"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-preview-title"
          data-attachment-preview-modal
          className="fixed inset-0 z-[201] flex min-h-0 flex-col bg-[var(--neo-graphite-950)] text-[var(--neo-canvas-text-primary)]"
          style={{ zIndex: 10000, pointerEvents: "auto" }}
          initial={fastPreviewMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={
            fastPreviewMotion
              ? { opacity: 0, transition: { duration: 0.08, ease: "linear" } }
              : { opacity: 0, transition: { duration: 0.16, ease: "easeOut" } }
          }
          transition={
            fastPreviewMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[var(--neo-graphite-900)]/70 px-3 py-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <h2
                id="attachment-preview-title"
                className="truncate text-base font-semibold tracking-normal text-[var(--neo-canvas-text-primary)] md:text-[1.05rem]"
                title={headerTitleAttr}
              >
                <span className="sr-only">Receipt preview — </span>
                {primaryLabel}
              </h2>
              {attachmentMeta ? (
                <p
                  className="mt-0.5 tabular-nums text-xs font-medium text-[var(--neo-canvas-text-tertiary)]"
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
                  <Skeleton className={cn("rounded-sm bg-zinc-800/90", PREVIEW_VIEWPORT_CLASS)} />
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
                  <Skeleton className={cn("rounded-sm bg-zinc-800/90", PREVIEW_VIEWPORT_CLASS)} />
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
                      className="touch-manipulation border-white/15 bg-white/5 text-[var(--neo-canvas-text-primary)] hover:bg-[rgb(184_137_45_/_0.12)]"
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
                      initial={fastPreviewMotion ? false : "enter"}
                      animate="center"
                      exit="exit"
                      transition={
                        fastPreviewMotion
                          ? { duration: 0.08, ease: "linear" }
                          : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                      }
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
                          fastMotion={fastPreviewMotion}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {showFooter ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[var(--neo-graphite-900)]/70 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-md">
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
                    className="h-9 touch-manipulation border-white/15 bg-white/5 text-[var(--neo-canvas-text-primary)] hover:bg-[rgb(184_137_45_/_0.12)] max-md:min-h-11"
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
