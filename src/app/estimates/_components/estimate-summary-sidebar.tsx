import type { ReactElement } from "react";
import type { EstimateSummaryResult } from "@/lib/data";
import { EstimateBuilderSummary } from "./estimate-builder-summary";

export function EstimateSummarySidebar({
  summary,
  showInternal = false,
}: {
  summary: EstimateSummaryResult | null;
  /** Internal cost breakdown — never use on customer preview. */
  showInternal?: boolean;
}): ReactElement {
  return <EstimateBuilderSummary summary={summary} showInternal={showInternal} />;
}
