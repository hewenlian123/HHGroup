import {
  EstimatePreviewContent,
  type EstimatePreviewProps,
} from "@/app/estimates/[id]/preview/estimate-preview-content";

/** Compatibility wrapper: print must use the exact same Letter document renderer as preview. */
export function EstimatePrintDocument(props: EstimatePreviewProps) {
  return <EstimatePreviewContent {...props} />;
}
