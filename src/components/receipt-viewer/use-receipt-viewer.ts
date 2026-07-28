"use client";

import * as React from "react";
import {
  DEFAULT_RECEIPT_VIEWER_TRANSFORM_STATE,
  type ReceiptViewerCanvasHandle,
  type ReceiptViewerTransformState,
} from "./types";

/**
 * Coordinates the canvas' local transform controller with dialog toolbar state.
 * Receipt data, signed URLs, and persistence intentionally remain outside this hook.
 */
export function useReceiptViewer() {
  const controlsRef = React.useRef<ReceiptViewerCanvasHandle | null>(null);
  const [transformState, setTransformState] = React.useState<ReceiptViewerTransformState>(
    DEFAULT_RECEIPT_VIEWER_TRANSFORM_STATE
  );

  const resetSession = React.useCallback(() => {
    setTransformState(DEFAULT_RECEIPT_VIEWER_TRANSFORM_STATE);
  }, []);

  return {
    controlsRef,
    transformState,
    onTransformStateChange: setTransformState,
    resetSession,
  };
}
