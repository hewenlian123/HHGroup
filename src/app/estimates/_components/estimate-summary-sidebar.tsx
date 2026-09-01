import type { ReactElement } from "react";
import type { EstimateSummaryResult } from "@/lib/data";
import { EstimateBuilderSummary } from "./estimate-builder-summary";

export function EstimateSummarySidebar({
  summary,
}: {
  summary: EstimateSummaryResult | null;
}): ReactElement {
  return <EstimateBuilderSummary summary={summary} />;
}
