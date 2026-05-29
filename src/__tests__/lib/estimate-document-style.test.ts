import { describe, expect, it } from "vitest";

import {
  DEFAULT_ESTIMATE_DOCUMENT_STYLE,
  mergeDocumentStyleIntoCostCategoryNames,
  readEstimateDocumentStyleFromCostCategoryNames,
} from "@/lib/estimate-document-style";

describe("estimate document style meta json", () => {
  it("defaults missing meta to proposal", () => {
    expect(readEstimateDocumentStyleFromCostCategoryNames(null)).toBe(
      DEFAULT_ESTIMATE_DOCUMENT_STYLE
    );
    expect(readEstimateDocumentStyleFromCostCategoryNames({})).toBe("proposal");
  });

  it("reads and writes documentStyle in cost_category_names namespace", () => {
    const merged = mergeDocumentStyleIntoCostCategoryNames({}, "itemized");
    expect(readEstimateDocumentStyleFromCostCategoryNames(merged)).toBe("itemized");
    const roundTrip = mergeDocumentStyleIntoCostCategoryNames(merged, "proposal");
    expect(readEstimateDocumentStyleFromCostCategoryNames(roundTrip)).toBe("proposal");
  });
});
