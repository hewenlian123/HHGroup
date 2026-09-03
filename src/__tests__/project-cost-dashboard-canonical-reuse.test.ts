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

const canonicalFixture = {
  revenue: 1_275.5,
  actualCost: 630.25,
  profit: 645.25,
  margin: 645.25 / 1_275.5,
  budget: 1_200,
  approvedChangeOrders: 75.5,
  laborCost: 280.25,
  expenseCost: 150,
  subcontractCost: 125,
  commissionCost: 75,
};

function financialOutput(value: {
  breakdown: unknown;
  profit: number;
  margin: number;
  revenue: number;
}) {
  return JSON.stringify({
    breakdown: value.breakdown,
    profit: value.profit,
    margin: value.margin,
    revenue: value.revenue,
  });
}

describe("project cost dashboard canonical result reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectExpenseLinesBundle.mockResolvedValue({
      doneCostLines: [
        {
          lineId: "line-material",
          expenseId: "expense-material",
          date: "2026-09-02",
          vendorName: "Material Vendor",
          category: "Materials",
          memo: "Fixed fixture material",
          amount: 110.5,
          paymentMethod: "Card",
          expenseStatus: "approved",
        },
        {
          lineId: "line-other",
          expenseId: "expense-other",
          date: "2026-09-03",
          vendorName: "Permit Office",
          category: "Permit",
          memo: null,
          amount: 39.5,
          paymentMethod: "Check",
          expenseStatus: "paid",
        },
      ],
      allDisplayLines: [],
      alerts: { needsReviewCount: 0, missingReceiptCount: 1, missingClassificationCount: 0 },
    });
    mocks.getCanonicalProjectProfit.mockResolvedValue(canonicalFixture);
    mocks.sumPaidWorkerReimbursementsForProject.mockResolvedValue(20);
  });

  it("uses a supplied in-flight canonical result without a second canonical read and preserves exact financial output", async () => {
    const { getProjectCostDashboard } = await import("@/lib/project-cost-dashboard");

    const baseline = await getProjectCostDashboard("project-reuse");
    expect(mocks.getCanonicalProjectProfit).toHaveBeenCalledTimes(1);

    mocks.getCanonicalProjectProfit.mockClear();
    mocks.getCanonicalProjectProfit.mockRejectedValue(
      new Error("an internal canonical read must not run")
    );

    const reused = await getProjectCostDashboard(
      "project-reuse",
      undefined,
      Promise.resolve(canonicalFixture)
    );

    const expectedFinancialOutput =
      '{"breakdown":{"totalCost":650.25,"materials":110.5,"labor":280.25,"bills":125,"commission":75,"other":59.5},"profit":625.25,"margin":0.4901999215993728,"revenue":1275.5}';
    expect(financialOutput(baseline)).toBe(expectedFinancialOutput);
    expect(financialOutput(reused)).toBe(expectedFinancialOutput);
    expect(mocks.getCanonicalProjectProfit).not.toHaveBeenCalled();
  });
});
