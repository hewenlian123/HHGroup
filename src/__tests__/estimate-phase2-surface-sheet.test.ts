import { describe, expect, it } from "vitest";

import {
  estimateSurfaceSheetClassName,
  type EstimateSurfaceSheetKind,
} from "@/app/estimates/_components/estimate-surface-sheet-class";

const EXPECTED_WIDTHS: Record<EstimateSurfaceSheetKind, number> = {
  information: 440,
  pricing: 360,
  notes: 480,
  payment: 700,
  revision: 360,
  activity: 360,
};

describe("Estimate Phase 2 surface sheet presentation", () => {
  it.each(Object.entries(EXPECTED_WIDTHS) as Array<[EstimateSurfaceSheetKind, number]>)(
    "maps %s to the approved desktop width",
    (surface, width) => {
      const className = estimateSurfaceSheetClassName(surface);

      expect(className).toContain(`md:!w-[${width}px]`);
      expect(className).toContain(`md:!max-w-[${width}px]`);
    }
  );

  it("keeps every Estimate sheet full-width and viewport-bound on mobile", () => {
    const className = estimateSurfaceSheetClassName("notes");

    expect(className).toContain("max-md:!inset-0");
    expect(className).toContain("max-md:!w-full");
    expect(className).toContain("max-md:!max-w-none");
    expect(className).toContain("max-md:!h-[100dvh]");
  });

  it("preserves caller styling without changing the surface mapping", () => {
    const className = estimateSurfaceSheetClassName("activity", "caller-owned-class");

    expect(className).toContain("caller-owned-class");
    expect(className).toContain("md:!w-[360px]");
  });
});
