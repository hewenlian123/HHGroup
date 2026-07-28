export type ReceiptViewerTransformMetricsInput = {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  rotation: number;
  zoom: number;
};

export type ReceiptViewerTransformMetrics = {
  effectiveWidth: number;
  effectiveHeight: number;
  fitScale: number;
  renderScale: number;
  renderedWidth: number;
  renderedHeight: number;
  maxPanX: number;
  maxPanY: number;
  overflowX: boolean;
  overflowY: boolean;
};

const OVERFLOW_EPSILON_PX = 0.5;

function normalizedQuarterTurns(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360;
  return Math.round(normalized / 90) % 4;
}

export function getReceiptViewerTransformMetrics({
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
  rotation,
  zoom,
}: ReceiptViewerTransformMetricsInput): ReceiptViewerTransformMetrics {
  const cw = Math.max(0, containerWidth);
  const ch = Math.max(0, containerHeight);
  const nw = Math.max(0, naturalWidth);
  const nh = Math.max(0, naturalHeight);
  const safeZoom = Math.max(1, zoom);
  const swapsAxes = normalizedQuarterTurns(rotation) % 2 === 1;
  const effectiveWidth = swapsAxes ? nh : nw;
  const effectiveHeight = swapsAxes ? nw : nh;

  if (cw <= 0 || ch <= 0 || effectiveWidth <= 0 || effectiveHeight <= 0) {
    return {
      effectiveWidth,
      effectiveHeight,
      fitScale: 1,
      renderScale: safeZoom,
      renderedWidth: 0,
      renderedHeight: 0,
      maxPanX: 0,
      maxPanY: 0,
      overflowX: false,
      overflowY: false,
    };
  }

  const fitScale = Math.min(1, cw / effectiveWidth, ch / effectiveHeight);
  const renderScale = fitScale * safeZoom;
  const renderedWidth = effectiveWidth * renderScale;
  const renderedHeight = effectiveHeight * renderScale;
  const maxPanX = Math.max(0, (renderedWidth - cw) / 2);
  const maxPanY = Math.max(0, (renderedHeight - ch) / 2);

  return {
    effectiveWidth,
    effectiveHeight,
    fitScale,
    renderScale,
    renderedWidth,
    renderedHeight,
    maxPanX,
    maxPanY,
    overflowX: maxPanX > OVERFLOW_EPSILON_PX,
    overflowY: maxPanY > OVERFLOW_EPSILON_PX,
  };
}

export function clampReceiptViewerPan(
  metrics: ReceiptViewerTransformMetrics,
  tx: number,
  ty: number
): { tx: number; ty: number } {
  return {
    tx: metrics.overflowX ? Math.min(metrics.maxPanX, Math.max(-metrics.maxPanX, tx)) : 0,
    ty: metrics.overflowY ? Math.min(metrics.maxPanY, Math.max(-metrics.maxPanY, ty)) : 0,
  };
}
