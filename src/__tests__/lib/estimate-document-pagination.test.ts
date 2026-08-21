import { describe, expect, it } from "vitest";

import {
  buildEstimatePageIdentity,
  estimateDocumentIdentity,
  paginateEstimatePaymentSchedule,
} from "@/app/estimates/_components/estimate-document-pagination";

describe("Estimate customer document pagination", () => {
  it("keeps the observed historical seven-milestone shape on one payment page", () => {
    const productionShape = [
      { titleChars: 12, descriptionChars: 51 },
      { titleChars: 18, descriptionChars: 70 },
      { titleChars: 19, descriptionChars: 42 },
      { titleChars: 35, descriptionChars: 63 },
      { titleChars: 56, descriptionChars: 137 },
      { titleChars: 22, descriptionChars: 104 },
      { titleChars: 37, descriptionChars: 113 },
    ];
    const milestones = productionShape.map((shape, index) => ({
      id: `historical-milestone-${index + 1}`,
      title: "T".repeat(shape.titleChars),
      description: "D".repeat(shape.descriptionChars),
    }));

    expect(paginateEstimatePaymentSchedule(milestones).map((page) => page.length)).toEqual([7]);
  });

  it("balances an unavoidable split instead of isolating the final milestone", () => {
    const milestones = Array.from({ length: 7 }, (_, index) => ({
      id: `balanced-milestone-${index + 1}`,
      title: `Milestone ${index + 1}`,
      description: "D".repeat(index === 6 ? 1_500 : 100),
    }));

    const pages = paginateEstimatePaymentSchedule(milestones);

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.length)).toEqual([4, 3]);
    expect(pages.flat().map((milestone) => milestone.id)).toEqual(
      milestones.map((milestone) => milestone.id)
    );
  });

  it("keeps five normal construction milestones on one payment page", () => {
    const milestones = [
      {
        id: "deposit",
        title: "Contract deposit and mobilization",
        description: "Due upon signed acceptance and before mobilization or field work begins.",
      },
      {
        id: "demolition",
        title: "Demolition and framing progress",
        description:
          "Due after selective demolition and primary structural framing are substantially complete.",
      },
      {
        id: "rough-mep",
        title: "Rough MEP and enclosure progress",
        description:
          "Due after rough electrical, plumbing, windows, exterior doors, and dry-in coordination.",
      },
      {
        id: "interior-finishes",
        title: "Interior finishes progress",
        description:
          "Due after drywall, flooring, painting, cabinetry, and finish carpentry reach substantial completion.",
      },
      {
        id: "closeout",
        title: "Final completion and turnover",
        description:
          "Due at substantial completion after punch coordination, closeout documents, and owner turnover.",
      },
    ];

    expect(paginateEstimatePaymentSchedule(milestones)).toHaveLength(1);
  });

  it("splits long milestones without losing or duplicating their order", () => {
    const milestones = Array.from({ length: 6 }, (_, index) => ({
      id: `milestone-${index + 1}`,
      title: `Milestone ${index + 1}`,
      description:
        "Coordinate procurement, field verification, installation sequencing, inspections, owner review, documentation, and closeout evidence before this milestone is invoiced. ".repeat(
          3
        ),
    }));

    const pages = paginateEstimatePaymentSchedule(milestones);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length > 0)).toBe(true);
    expect(pages.flat().map((milestone) => milestone.id)).toEqual(
      milestones.map((milestone) => milestone.id)
    );
  });

  it("preserves Proposal identity and clearly identifies Itemized output", () => {
    expect(estimateDocumentIdentity("proposal")).toMatchObject({
      title: "Project Proposal",
      descriptor: "Luxury Design-Build Proposal",
    });
    expect(estimateDocumentIdentity("itemized")).toMatchObject({
      title: "Itemized Estimate",
      descriptor: "Detailed Construction Estimate",
    });
  });

  it("builds restrained continuation-page identity", () => {
    expect(buildEstimatePageIdentity("EST-0079", 3, 12)).toBe("EST-0079 · Page 3 of 12");
  });
});
