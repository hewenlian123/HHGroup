import { describe, expect, it } from "vitest";

import {
  clampReceiptViewerPan,
  getReceiptViewerTransformMetrics,
} from "@/components/receipt-viewer/transform-metrics";

describe("receipt viewer transform metrics", () => {
  it("fits a wide image after a 90 degree rotation by swapping its effective dimensions", () => {
    const metrics = getReceiptViewerTransformMetrics({
      containerWidth: 800,
      containerHeight: 600,
      naturalWidth: 1600,
      naturalHeight: 400,
      rotation: 90,
      zoom: 1,
    });

    expect(metrics.effectiveWidth).toBe(400);
    expect(metrics.effectiveHeight).toBe(1600);
    expect(metrics.fitScale).toBeCloseTo(0.375);
    expect(metrics.renderedWidth).toBeCloseTo(150);
    expect(metrics.renderedHeight).toBeCloseTo(600);
    expect(metrics.overflowX).toBe(false);
    expect(metrics.overflowY).toBe(false);
    expect(clampReceiptViewerPan(metrics, 250, -250)).toEqual({ tx: 0, ty: 0 });
  });

  it("uses swapped dimensions for a tall image rotated 90 degrees", () => {
    const metrics = getReceiptViewerTransformMetrics({
      containerWidth: 800,
      containerHeight: 600,
      naturalWidth: 400,
      naturalHeight: 1600,
      rotation: 90,
      zoom: 1,
    });

    expect(metrics.effectiveWidth).toBe(1600);
    expect(metrics.effectiveHeight).toBe(400);
    expect(metrics.fitScale).toBeCloseTo(0.5);
    expect(metrics.renderedWidth).toBeCloseTo(800);
    expect(metrics.renderedHeight).toBeCloseTo(200);
    expect(metrics.overflowX).toBe(false);
    expect(metrics.overflowY).toBe(false);
  });

  it("clamps each axis independently for a zoomed rotated image", () => {
    const portraitAfterRotation = getReceiptViewerTransformMetrics({
      containerWidth: 800,
      containerHeight: 600,
      naturalWidth: 1600,
      naturalHeight: 400,
      rotation: 90,
      zoom: 2,
    });
    expect(portraitAfterRotation.maxPanX).toBe(0);
    expect(portraitAfterRotation.maxPanY).toBeCloseTo(300);
    expect(clampReceiptViewerPan(portraitAfterRotation, 180, 900)).toEqual({
      tx: 0,
      ty: 300,
    });

    const landscapeAfterRotation = getReceiptViewerTransformMetrics({
      containerWidth: 800,
      containerHeight: 600,
      naturalWidth: 400,
      naturalHeight: 1600,
      rotation: 90,
      zoom: 2,
    });
    expect(landscapeAfterRotation.maxPanX).toBeCloseTo(400);
    expect(landscapeAfterRotation.maxPanY).toBe(0);
    expect(clampReceiptViewerPan(landscapeAfterRotation, -900, 180)).toEqual({
      tx: -400,
      ty: 0,
    });
  });

  it("keeps 0 and 180 degree dimensions equivalent and clears stale pan at Fit", () => {
    const input = {
      containerWidth: 900,
      containerHeight: 620,
      naturalWidth: 1800,
      naturalHeight: 1200,
      zoom: 1,
    };
    const zero = getReceiptViewerTransformMetrics({ ...input, rotation: 0 });
    const oneEighty = getReceiptViewerTransformMetrics({ ...input, rotation: 180 });

    expect(oneEighty.effectiveWidth).toBe(zero.effectiveWidth);
    expect(oneEighty.effectiveHeight).toBe(zero.effectiveHeight);
    expect(oneEighty.renderedWidth).toBeCloseTo(zero.renderedWidth);
    expect(oneEighty.renderedHeight).toBeCloseTo(zero.renderedHeight);
    expect(clampReceiptViewerPan(oneEighty, 333, -222)).toEqual({ tx: 0, ty: 0 });
  });

  it("recalculates fit and pan bounds after a canvas resize", () => {
    const before = getReceiptViewerTransformMetrics({
      containerWidth: 800,
      containerHeight: 600,
      naturalWidth: 1600,
      naturalHeight: 400,
      rotation: 0,
      zoom: 2,
    });
    const after = getReceiptViewerTransformMetrics({
      containerWidth: 1200,
      containerHeight: 600,
      naturalWidth: 1600,
      naturalHeight: 400,
      rotation: 0,
      zoom: 2,
    });

    expect(before.fitScale).toBeCloseTo(0.5);
    expect(before.maxPanX).toBeCloseTo(400);
    expect(before.maxPanY).toBe(0);
    expect(after.fitScale).toBeCloseTo(0.75);
    expect(after.maxPanX).toBeCloseTo(600);
    expect(after.maxPanY).toBe(0);
    expect(clampReceiptViewerPan(after, 900, 200)).toEqual({ tx: 600, ty: 0 });
  });
});
