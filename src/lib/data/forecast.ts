/**
 * Project forecast summary — Supabase only. No mock. Throws on error.
 */

import * as invoicesDb from "../invoices-db";
import * as expensesDb from "../expenses-db";
import * as dailyLaborDb from "../daily-labor-db";
import * as laborDb from "../labor-db";
import * as subcontractsDb from "../subcontracts-db";
import * as subcontractPaymentsDb from "../subcontract-payments-db";
import * as commitmentsDb from "../commitments-db";
import * as coDb from "../change-orders-db";

export type ProjectForecastSummaryResult = {
  revenue: number;
  actualCost: number;
  forecastFinalCost: number;
  forecastProfit: number;
  forecastMargin: number;
};

/**
 * Computes project forecast summary:
 * - Revenue: sum(invoices.total) excluding void
 * - Actual Cost: expenses + labor cost + subcontract payments (paid)
 * - Remaining Commitments: commitments where status = Open (paid < amount)
 * - Remaining Subcontract Balance: sum over subcontracts of max(0, contract_amount - paid)
 * - Forecast Final Cost = Actual Cost + Remaining Commitments + Remaining Subcontract Balance
 * - Forecast Profit = Revenue - Forecast Final Cost
 * - Forecast Margin = Forecast Profit / Revenue (0 when revenue is 0)
 */
export async function getProjectForecastSummary(projectId: string): Promise<ProjectForecastSummaryResult> {
  const [revenueCollected, expenseTotal, laborCost, subcontracts, commitments] = await Promise.all([
    invoicesDb.getProjectRevenueAndCollected(projectId),
    expensesDb.getExpenseTotalsByProject(projectId),
    laborDb.getLaborAllocatedByProject(projectId),
    subcontractsDb.getSubcontractsByProject(projectId),
    commitmentsDb.getCommitments(projectId),
  ]);

  const revenue = revenueCollected.revenue;

  const subcontractIds = subcontracts.map((s) => s.id);
  const payments =
    subcontractIds.length > 0 ? await subcontractPaymentsDb.getPaymentsBySubcontractIds(subcontractIds) : [];
  const paidBySubcontractId = new Map<string, number>();
  for (const p of payments) {
    paidBySubcontractId.set(p.subcontract_id, (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount);
  }
  const subcontractPaid = payments.reduce((s, p) => s + p.amount, 0);

  const actualCost = expenseTotal + laborCost + subcontractPaid;

  const remainingCommitments = commitments
    .filter((c) => c.status === "Open")
    .reduce((s, c) => s + c.amount, 0);

  let remainingSubcontractBalance = 0;
  for (const s of subcontracts) {
    const paid = paidBySubcontractId.get(s.id) ?? 0;
    if (paid < s.contract_amount) {
      remainingSubcontractBalance += s.contract_amount - paid;
    }
  }

  const forecastFinalCost = actualCost + remainingCommitments + remainingSubcontractBalance;
  const forecastProfit = revenue - forecastFinalCost;
  const forecastMargin = revenue !== 0 ? forecastProfit / revenue : 0;

  return {
    revenue,
    actualCost,
    forecastFinalCost,
    forecastProfit,
    forecastMargin,
  };
}

export type ProjectCostCodeSummaryItem = {
  costCode: string;
  budget: number;
  actual: number;
  forecast: number;
  variance: number;
};

/**
 * Per cost-code summary for a project:
 * - Budget: sum(project_budget_items.total) grouped by cost_code
 * - Actual: expense_lines (by cost_code) + labor_entries (by cost_code) + subcontract payments (by subcontract cost_code)
 * - Remaining commitment: open commitments (no cost_code on commitments table → single bucket "")
 * - Forecast = actual + remaining commitment
 * - Variance = budget - forecast
 * Supabase only. No mock. Throws on error.
 */
export async function getProjectCostCodeSummary(projectId: string): Promise<ProjectCostCodeSummaryItem[]> {
  const [budgetItems, expenseLines, laborEntries, subcontracts, commitments] = await Promise.all([
    coDb.getProjectBudgetItems(projectId),
    expensesDb.getProjectExpenseLines(projectId),
    dailyLaborDb.getLaborEntriesWithJoins({ project_id: projectId }),
    subcontractsDb.getSubcontractsByProject(projectId),
    commitmentsDb.getCommitments(projectId),
  ]);

  const subcontractIds = subcontracts.map((s) => s.id);
  const payments =
    subcontractIds.length > 0 ? await subcontractPaymentsDb.getPaymentsBySubcontractIds(subcontractIds) : [];

  const budgetByCode = new Map<string, number>();
  for (const item of budgetItems) {
    const code = (item as { cost_code?: string }).cost_code ?? "";
    budgetByCode.set(code, (budgetByCode.get(code) ?? 0) + Number((item as { total?: number }).total ?? 0));
  }

  const expenseByCode = new Map<string, number>();
  for (const { line } of expenseLines) {
    const code = line.costCode ?? "";
    expenseByCode.set(code, (expenseByCode.get(code) ?? 0) + line.amount);
  }

  const laborByCode = new Map<string, number>();
  for (const e of laborEntries) {
    const code = (e as { cost_code: string | null }).cost_code ?? "";
    const amount = Number((e as { cost_amount?: number | null }).cost_amount) || 0;
    laborByCode.set(code, (laborByCode.get(code) ?? 0) + amount);
  }

  const subcontractIdToCostCode = new Map(subcontracts.map((s) => [s.id, (s as { cost_code: string | null }).cost_code ?? ""]));
  const subcontractPaidByCode = new Map<string, number>();
  for (const p of payments) {
    const code = subcontractIdToCostCode.get(p.subcontract_id) ?? "";
    subcontractPaidByCode.set(code, (subcontractPaidByCode.get(code) ?? 0) + p.amount);
  }

  const openCommitmentTotal = commitments
    .filter((c) => c.status === "Open")
    .reduce((s, c) => s + c.amount, 0);
  const commitmentByCode = new Map<string, number>();
  if (openCommitmentTotal !== 0) commitmentByCode.set("", openCommitmentTotal);

  const allCodes = new Set<string>([
    ...Array.from(budgetByCode.keys()),
    ...Array.from(expenseByCode.keys()),
    ...Array.from(laborByCode.keys()),
    ...Array.from(subcontractPaidByCode.keys()),
    ...Array.from(commitmentByCode.keys()),
  ]);

  const result: ProjectCostCodeSummaryItem[] = [];
  for (const costCode of Array.from(allCodes).sort()) {
    const budget = budgetByCode.get(costCode) ?? 0;
    const actual =
      (expenseByCode.get(costCode) ?? 0) +
      (laborByCode.get(costCode) ?? 0) +
      (subcontractPaidByCode.get(costCode) ?? 0);
    const remainingCommitment = commitmentByCode.get(costCode) ?? 0;
    const forecast = actual + remainingCommitment;
    const variance = budget - forecast;
    result.push({
      costCode: costCode || "—",
      budget,
      actual,
      forecast,
      variance,
    });
  }
  return result;
}
