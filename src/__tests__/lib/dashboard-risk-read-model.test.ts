import { describe, expect, it } from "vitest";
import { buildProjectRiskOverview } from "@/lib/data";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";

describe("Dashboard project risk read model", () => {
  it("derives risk from the already-loaded project snapshot and canonical map", () => {
    const projects = [
      {
        id: "project-1",
        name: "Over Budget",
        status: "active" as const,
        budget: 1_000,
        spent: 0,
        updated: "2026-09-03",
        sourceEstimateId: "estimate-1",
        snapshotBudgetCost: 500,
        snapshotBudgetBreakdown: { materials: 100, labor: 100, vendor: 200, other: 100 },
      },
      {
        id: "project-2",
        name: "No Estimate Snapshot",
        status: "active" as const,
        budget: 800,
        spent: 0,
        updated: "2026-09-03",
      },
    ];
    const profitMap = new Map<string, CanonicalProjectProfit>([
      [
        "project-1",
        {
          revenue: 1_000,
          budget: 1_000,
          approvedChangeOrders: 0,
          laborCost: 150,
          expenseCost: 250,
          subcontractCost: 200,
          commissionCost: 0,
          actualCost: 600,
          profit: 400,
          margin: 0.4,
        },
      ],
      [
        "project-2",
        {
          revenue: 800,
          budget: 800,
          approvedChangeOrders: 0,
          laborCost: 0,
          expenseCost: 0,
          subcontractCost: 0,
          commissionCost: 0,
          actualCost: 0,
          profit: 800,
          margin: 1,
        },
      ],
    ]);

    const risk = buildProjectRiskOverview(projects, profitMap);

    expect(risk.summary).toEqual({
      highCount: 1,
      overBudgetCount: 1,
      laborOverCount: 1,
      lowRunwayCount: 0,
    });
    expect(risk.projects[0]).toMatchObject({
      projectId: "project-1",
      riskLevel: "HIGH",
      budgetVar: 100,
      laborVar: 50,
      sourceEstimateId: "estimate-1",
      triggers: expect.arrayContaining(["Over budget", "Labor over"]),
    });
    expect(risk.projects[1]).toMatchObject({
      projectId: "project-2",
      riskLevel: "LOW",
      budgetVar: null,
      laborVar: null,
    });
  });
});
