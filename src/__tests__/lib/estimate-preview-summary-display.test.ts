import { describe, expect, it } from "vitest";

import {
  buildEstimatePreviewTaxLabel,
  formatEstimateTaxRatePct,
  matchEstimateTaxPresetByRate,
} from "@/app/estimates/_components/estimate-tax-presets";
import { resolveEstimatePreviewSummaryDisplay } from "@/lib/estimate-preview-summary-display";

describe("estimate preview summary display", () => {
  it("hides zero discount and zero tax rows", () => {
    const display = resolveEstimatePreviewSummaryDisplay({
      subtotal: 5000,
      tax: 0,
      discount: 0,
      isProposalStyle: true,
    });
    expect(display.showDiscount).toBe(false);
    expect(display.showTax).toBe(false);
    expect(display.totalLabel).toBe("Contract Price");
  });

  it("shows discount only when amount is positive", () => {
    const display = resolveEstimatePreviewSummaryDisplay({
      subtotal: 5000,
      tax: 0,
      discount: 250,
      isProposalStyle: false,
    });
    expect(display.showDiscount).toBe(true);
    expect(display.totalLabel).toBe("Grand Total");
  });

  it("builds tax label from matched preset rate", () => {
    expect(buildEstimatePreviewTaxLabel(10_000, 471.2)).toBe("Tax (Hawaii GET 4.712%)");
    expect(matchEstimateTaxPresetByRate(4.712)).not.toBeNull();
    expect(formatEstimateTaxRatePct(4.712)).toBe("4.712%");
  });

  it("builds tax label from implied rate when no preset matches", () => {
    expect(buildEstimatePreviewTaxLabel(10_000, 450)).toBe("Tax (4.5%)");
  });

  it("can show zero tax with explicit selected rate", () => {
    const display = resolveEstimatePreviewSummaryDisplay({
      subtotal: 0,
      tax: 0,
      discount: 0,
      isProposalStyle: true,
      selectedTaxRatePct: 4.712,
      selectedTaxLabel: "HI",
    });
    expect(display.showTax).toBe(true);
    expect(display.taxLabel).toBe("Tax (HI 4.712%)");
  });
});
