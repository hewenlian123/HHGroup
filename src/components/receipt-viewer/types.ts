export type ReceiptViewerMetadata = {
  merchant?: string;
  expenseDate?: string;
  amount?: string;
  project?: string;
  category?: string;
  paymentSource?: string;
  status?: string;
  uploadFileName?: string;
};

export type ReceiptViewerPresentation = {
  kind: "receipt";
  metadata: ReceiptViewerMetadata;
};

export type ReceiptViewerTransformState = {
  ready: boolean;
  zoomPercent: number;
  rotation: number;
  zoomed: boolean;
};

export type ReceiptViewerCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
};

export const DEFAULT_RECEIPT_VIEWER_TRANSFORM_STATE: ReceiptViewerTransformState = {
  ready: false,
  zoomPercent: 100,
  rotation: 0,
  zoomed: false,
};
