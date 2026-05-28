import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectExpenseLinesBundle: vi.fn(),
  getCanonicalProjectProfit: vi.fn(),
  sumPaidWorkerReimbursementsForProject: vi.fn(),
}));

vi.mock("@/lib/expenses-db", () => ({
  getProjectExpenseLinesBundle: mocks.getProjectExpenseLinesBundle,
}));

vi.mock("@/lib/profit-engine", () => ({
  getCanonicalProjectProfit: mocks.getCanonicalProjectProfit,
}));

vi.mock("@/lib/worker-reimbursements-db", () => ({
  sumPaidWorkerReimbursementsForProject: mocks.sumPaidWorkerReimbursementsForProject,
}));

describe("project cost dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectExpenseLinesBundle.mockResolvedValue({
      doneCostLines: [
        {
          lineId: "line-material",
          expenseId: "expense-1",
          date: "2026-01-01",
          vendorName: "Materials Vendor",
          category: "Materials",
          memo: null,
          amount: 100,
          paymentMethod: "Check",
        },
        {
          lineId: "line-other",
          expenseId: "expense-2",
          date: "2026-01-02",
          vendorName: "Permit Office",
          category: "Permit",
          memo: null,
          amount: 50,
          paymentMethod: "Card",
        },
      ],
      allDisplayLines: [],
      alerts: { needsReviewCount: 0, missingReceiptCount: 0, missingClassificationCount: 0 },
    });
    mocks.getCanonicalProjectProfit.mockResolvedValue({
      revenue: 1000,
      actualCost: 380,
      profit: 620,
      margin: 0.62,
      budget: 1000,
      approvedChangeOrders: 0,
      laborCost: 200,
      expenseCost: 150,
      subcontractCost: 75,
      commissionCost: 125,
    });
    mocks.sumPaidWorkerReimbursementsForProject.mockResolvedValue(25);
  });

  it("includes commission as a separate selling cost bucket in spent, profit, and margin", async () => {
    const { getProjectCostDashboard } = await import("@/lib/project-cost-dashboard");

    const dashboard = await getProjectCostDashboard("project-1");

    expect(dashboard.breakdown).toEqual(
      expect.objectContaining({
        materials: 100,
        labor: 200,
        bills: 75,
        commission: 125,
        other: 75,
        totalCost: 575,
      })
    );
    expect(dashboard.spentTotal).toBe(575);
    expect(dashboard.profit).toBe(425);
    expect(dashboard.margin).toBe(0.425);
  });
});
