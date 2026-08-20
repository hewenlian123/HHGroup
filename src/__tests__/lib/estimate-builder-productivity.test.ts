import { describe, expect, it } from "vitest";

import {
  buildOrderedEstimateCategoryNames,
  buildEstimateSectionCollapseState,
  filterEstimateScopeSearchResults,
  isEstimateDescriptionLong,
  isEstimateSaveShortcut,
  reconcileEstimateSectionOrder,
  shouldCommitEstimateLineFromPrice,
} from "@/app/estimates/_components/estimate-builder-productivity";

describe("Estimate Builder productivity keyboard contracts", () => {
  it("recognizes only the standard Cmd/Ctrl+S save shortcut", () => {
    expect(isEstimateSaveShortcut({ key: "s", metaKey: true })).toBe(true);
    expect(isEstimateSaveShortcut({ key: "S", ctrlKey: true })).toBe(true);
    expect(isEstimateSaveShortcut({ key: "s", ctrlKey: true, altKey: true })).toBe(false);
    expect(isEstimateSaveShortcut({ key: "s", metaKey: true, shiftKey: true })).toBe(false);
    expect(isEstimateSaveShortcut({ key: "s" })).toBe(false);
  });

  it("commits a line only from an unmodified, non-composing Enter key", () => {
    expect(shouldCommitEstimateLineFromPrice({ key: "Enter" })).toBe(true);
    expect(shouldCommitEstimateLineFromPrice({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldCommitEstimateLineFromPrice({ key: "Enter", metaKey: true })).toBe(false);
    expect(shouldCommitEstimateLineFromPrice({ key: "Enter", isComposing: true })).toBe(false);
    expect(shouldCommitEstimateLineFromPrice({ key: "Tab" })).toBe(false);
  });
});

describe("Estimate Section Outline collapse contracts", () => {
  it("builds complete collapse and expand state without inventing section ids", () => {
    expect(buildEstimateSectionCollapseState(["demo", "paint"], true)).toEqual({
      demo: true,
      paint: true,
    });
    expect(buildEstimateSectionCollapseState(["demo", "paint"], false)).toEqual({
      demo: false,
      paint: false,
    });
  });

  it("keeps an explicitly created empty Section in order and save metadata", () => {
    const categoryNames = {
      framing: "Structural Framing",
      closeout: "Closeout",
    };
    const sectionOrder = reconcileEstimateSectionOrder(["framing", "closeout"], categoryNames, [
      "framing",
    ]);

    expect(sectionOrder).toEqual(["framing", "closeout"]);
    expect(
      buildOrderedEstimateCategoryNames(sectionOrder, categoryNames, ["framing"], {
        framing: "Framing catalog fallback",
      })
    ).toEqual({
      framing: "Structural Framing",
      closeout: "Closeout",
    });
  });
});

describe("Estimate Scope toolbar search contracts", () => {
  const entries = [
    {
      id: "section-sitework",
      sectionId: "sitework",
      label: "Sitework",
      detail: "2 items",
      searchText: "Sitework",
    },
    {
      id: "line-excavation",
      sectionId: "sitework",
      lineItemId: "excavation",
      label: "Excavation",
      detail: "Sitework",
      searchText: "Excavation excavate footing trenches Sitework",
    },
    {
      id: "line-paint",
      sectionId: "finishes",
      lineItemId: "paint",
      label: "Interior paint",
      detail: "Finishes",
      searchText: "Interior paint walls ceilings Finishes",
    },
  ];

  it("returns only current-estimate matches and supports multi-token queries", () => {
    expect(filterEstimateScopeSearchResults(entries, "foot trench")).toEqual([entries[1]]);
    expect(filterEstimateScopeSearchResults(entries, "paint ceilings")).toEqual([entries[2]]);
  });

  it("does not open a noisy result list for an empty query", () => {
    expect(filterEstimateScopeSearchResults(entries, "   ")).toEqual([]);
  });
});

describe("Estimate line description density contract", () => {
  it("keeps short descriptions inline and discloses longer content", () => {
    expect(isEstimateDescriptionLong("Install base cabinets.")).toBe(false);
    expect(
      isEstimateDescriptionLong(
        "<p>Protect adjacent finishes and install the complete cabinet package in accordance with approved shop drawings.</p><p>Include fillers, scribes, hardware, adjustments, and final cleaning.</p>"
      )
    ).toBe(true);
  });
});
