import { describe, expect, it } from "vitest";

import {
  computeSummary,
  groupEstimateItemsByCategoryId,
  lineTotal,
  orderedCategoryEntriesForEstimateSave,
  type EstimateItemRow,
} from "@/lib/estimates-db";

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

describe("estimate category persistence ordering", () => {
  it("rebuilds persisted empty categories as zero-item sections", () => {
    const sections = groupEstimateItemsByCategoryId(
      [estimateItem({ costCode: "010000" })],
      [
        { costCode: "010000", displayName: "Site Work", orderIndex: 0 },
        { costCode: "020000", displayName: "Empty Finish Section", orderIndex: 1 },
      ]
    );

    expect(sections).toEqual([
      expect.objectContaining({ categoryId: "010000", title: "Site Work" }),
      {
        categoryId: "020000",
        title: "Empty Finish Section",
        rows: [],
        sectionTotal: 0,
      },
    ]);
  });

  it("keeps item order for six-digit cost codes that JavaScript objects reorder", () => {
    const categoryNames = {
      "010000": "Site Preparation",
      "020000": "Demolition",
      "030000": "Foundation",
      "060000": "Framing",
      "070000": "Roofing",
      "080000": "Window",
      "090000": "Drywall",
      "100000": "Insulation",
      "120000": "Rough In",
      "150000": "Paint",
      "160000": "Door",
      "170000": "Flooring",
      "180000": "Cabinet",
    };

    expect(Object.keys(categoryNames).slice(0, 2)).toEqual(["100000", "120000"]);

    const entries = orderedCategoryEntriesForEstimateSave(
      categoryNames,
      [
        "010000",
        "020000",
        "030000",
        "060000",
        "070000",
        "080000",
        "090000",
        "100000",
        "120000",
        "150000",
        "160000",
        "170000",
        "180000",
      ].map((costCode) => ({ costCode }))
    );

    expect(entries.map(([costCode]) => costCode)).toEqual([
      "010000",
      "020000",
      "030000",
      "060000",
      "070000",
      "080000",
      "090000",
      "100000",
      "120000",
      "150000",
      "160000",
      "170000",
      "180000",
    ]);
  });
});
