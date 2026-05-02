import {
  getProjectExpenseLinesBundle,
  type ProjectExpenseAlertSummary,
  type ProjectExpenseCostLineRow,
} from "@/lib/expenses-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { sumPaidWorkerReimbursementsForProject } from "@/lib/worker-reimbursements-db";

export type ProjectCostBreakdown = {
  totalCost: number;
  materials: number;
  labor: number;
  bills: number;
  other: number;
};

export type ProjectCostTableRow = {
  lineId: string;
  expenseId: string;
  date: string;
  vendorName: string;
  category: string;
  memo: string | null;
  amount: number;
  paymentSource: string;
};

export type ProjectCostDashboardPayload = {
  breakdown: ProjectCostBreakdown;
  spentTotal: number;
  profit: number;
  margin: number;
  revenue: number;
  doneCostRows: ProjectCostTableRow[];
  recentDoneRows: ProjectCostTableRow[];
  allExpenseLineRows: Array<{
    id: string;
    expenseId: string;
    date: string;
    vendorName: string;
    category: string;
    memo: string | null;
    amount: number;
  }>;
  alerts: ProjectExpenseAlertSummary;
};

/** Maps an expense line category to the Materials bucket for breakdown + table filters. */
export function categoryLooksMaterials(category: string): boolean {
  const c = category.toLowerCase();
  return /material|lumber|supply|supplies|paint|hardware|tile|drywall|concrete|roof|cabinet|flooring|insulation|window|door|electrical|plumbing|fixture|landscape|fence/.test(
    c
  );
}

function toCostTableRow(r: ProjectExpenseCostLineRow): ProjectCostTableRow {
  return {
    lineId: r.lineId,
    expenseId: r.expenseId,
    date: r.date,
    vendorName: r.vendorName,
    category: r.category,
    memo: r.memo,
    amount: r.amount,
    paymentSource: r.paymentMethod,
  };
}

/**
 * Project detail cost model (no schema changes):
 * Spent = sum(confirmed-status expense lines on this project) + canonical labor + approved subcontract bills
 *   + paid worker reimbursements.
 * Confirmed expense statuses: done, reviewed, approved, paid (see isConfirmedExpenseStatus).
 */
export async function getProjectCostDashboard(
  projectId: string
): Promise<ProjectCostDashboardPayload> {
  const [bundle, canonical, reimb] = await Promise.all([
    getProjectExpenseLinesBundle(projectId),
    getCanonicalProjectProfit(projectId),
    sumPaidWorkerReimbursementsForProject(projectId),
  ]);

  let expenseMaterials = 0;
  let expenseOther = 0;
  for (const row of bundle.doneCostLines) {
    if (categoryLooksMaterials(row.category)) expenseMaterials += row.amount;
    else expenseOther += row.amount;
  }

  const labor = canonical.laborCost;
  const bills = canonical.subcontractCost;
  const other = expenseOther + reimb;
  const materials = expenseMaterials;
  const totalCost = materials + labor + bills + other;

  const revenue = canonical.revenue;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? profit / revenue : 0;

  const doneCostRows = bundle.doneCostLines.map(toCostTableRow);

  return {
    breakdown: {
      totalCost,
      materials,
      labor,
      bills,
      other,
    },
    spentTotal: totalCost,
    profit,
    margin,
    revenue,
    doneCostRows,
    recentDoneRows: doneCostRows.slice(0, 5),
    allExpenseLineRows: bundle.allDisplayLines,
    alerts: bundle.alerts,
  };
}

export { isConfirmedExpenseStatus } from "./project-expense-cost-status";
