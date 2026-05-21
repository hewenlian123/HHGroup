import { describe, expect, it } from "vitest";

import { computeSummary, lineTotal, type EstimateItemRow } from "@/lib/estimates-db";

function estimateItem(overrides: Partial<EstimateItemRow>): EstimateItemRow {
  return {
    id: "item-1",
    estimateId: "estimate-1",
    costCode: "001",
    desc: "Test line",
    qty: 1,
    unit: "EA",
    unitCost: 0,
    markupPct: 0.1,
    hideAmountOnPdf: false,
    status: "included",
    sortOrder: 0,
    ...overrides,
  };
}

describe("estimate line item calculations", () => {
  it("uses qty times unit price for visible line totals", () => {
    expect(lineTotal(estimateItem({ qty: 1, unitCost: 110, markupPct: 0.1 }))).toBe(110);
    expect(lineTotal(estimateItem({ qty: 2, unitCost: 110, markupPct: 0.1 }))).toBe(220);
  });

  it("ignores legacy pricing percentage fields in estimate totals", () => {
    const summary = computeSummary(
      [estimateItem({ qty: 1, unitCost: 110, markupPct: 0.1 })],
      { overheadPct: 0.05, profitPct: 0.1, tax: 7.5, discount: 2.5 },
      () => "material"
    );

    expect(summary.subtotal).toBe(110);
    expect(summary.markup).toBe(0);
    expect(summary.total).toBe(115);
  });
});
