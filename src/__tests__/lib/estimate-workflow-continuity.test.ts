import { describe, expect, it } from "vitest";

import {
  appendEstimateReturnPath,
  buildCreateDraftInvoiceHref,
  buildEstimateDetailReturnHref,
  buildEstimateMilestoneReturnHref,
  buildEstimatePreviewHref,
  chooseEstimateReturnSectionId,
  readEstimateBuilderReturnContext,
  safeEstimateReturnPath,
} from "@/app/estimates/_components/estimate-workflow-continuity";

describe("Estimate Builder and Preview continuity", () => {
  it("carries the originating section and scroll position into persisted Preview", () => {
    expect(
      buildEstimatePreviewHref("estimate 1", {
        sectionId: "03 10 00",
        scrollTop: 428.7,
      })
    ).toBe(
      "/estimates/estimate%201/preview?origin=builder&returnSection=03+10+00&returnScroll=429"
    );
  });

  it("rebuilds the Estimate return route without allowing arbitrary query data", () => {
    const params = new URLSearchParams(
      "origin=builder&returnSection=03+10+00&returnScroll=429&ignored=value"
    );
    const context = readEstimateBuilderReturnContext(params);

    expect(context).toEqual({ sectionId: "03 10 00", scrollTop: 429 });
    expect(buildEstimateDetailReturnHref("estimate 1", context)).toBe(
      "/estimates/estimate%201?returnSection=03+10+00&returnScroll=429"
    );
  });

  it("drops invalid scroll positions but keeps a valid section", () => {
    expect(
      readEstimateBuilderReturnContext(new URLSearchParams("returnSection=paint&returnScroll=-10"))
    ).toEqual({ sectionId: "paint", scrollTop: null });
  });

  it("prefers an explicitly selected Section over scroll inference", () => {
    expect(chooseEstimateReturnSectionId("closeout", "framing")).toBe("closeout");
    expect(chooseEstimateReturnSectionId("  ", "framing")).toBe("framing");
  });
});

describe("Estimate milestone and Invoice continuity", () => {
  it("builds a milestone-specific Estimate return path and carries it to Invoice creation", () => {
    const returnTo = buildEstimateMilestoneReturnHref("estimate-1", "milestone-2");
    expect(returnTo).toBe(
      "/estimates/estimate-1?returnMilestone=milestone-2#estimate-payment-milestone-milestone-2"
    );
    expect(buildCreateDraftInvoiceHref("estimate-1", "milestone-2", returnTo)).toBe(
      "/financial/invoices/new?estimateId=estimate-1&paymentScheduleItemId=milestone-2&returnTo=%2Festimates%2Festimate-1%3FreturnMilestone%3Dmilestone-2%23estimate-payment-milestone-milestone-2"
    );
  });

  it("accepts only local Estimate return paths", () => {
    expect(safeEstimateReturnPath("/estimates/estimate-1?returnMilestone=m-1")).toBe(
      "/estimates/estimate-1?returnMilestone=m-1"
    );
    expect(safeEstimateReturnPath("https://example.com/estimates/1")).toBeNull();
    expect(safeEstimateReturnPath("//example.com/estimates/1")).toBeNull();
    expect(safeEstimateReturnPath("/financial/invoices")).toBeNull();
    expect(safeEstimateReturnPath("/estimates/../financial/invoices")).toBeNull();
  });

  it("appends the safe Estimate return path to downstream Invoice routes", () => {
    expect(
      appendEstimateReturnPath(
        "/financial/invoices/invoice-1/preview?download=1",
        "/estimates/estimate-1?returnMilestone=m-1#estimate-payment-milestone-m-1"
      )
    ).toBe(
      "/financial/invoices/invoice-1/preview?download=1&returnTo=%2Festimates%2Festimate-1%3FreturnMilestone%3Dm-1%23estimate-payment-milestone-m-1"
    );
    expect(
      appendEstimateReturnPath(
        "/financial/invoices/invoice-1",
        "https://example.com/estimates/estimate-1"
      )
    ).toBe("/financial/invoices/invoice-1");
  });
});
