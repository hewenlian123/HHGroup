import { getReportsData, getReportDateRange } from "@/lib/reports-db";
import * as projectsDb from "@/lib/projects-db";
import * as workerReimbursementsDb from "@/lib/worker-reimbursements-db";
import { getProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import { fetchWorkerBalances } from "@/lib/worker-balances-list";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FinanceOwnerCashFlowPoint = {
  label: string;
  start: string;
  end: string;
  income: number;
  expense: number;
};

export type FinanceOwnerProjectRow = {
  projectId: string;
  name: string;
  revenue: number;
  expense: number;
  profit: number;
  profitPct: number;
};

export type FinanceOwnerDashboard = {
  kpis: {
    /** Cash collected: sum invoice_payments.amount with payment date in current calendar month (non-void). */
    cashCollectedThisMonth: number;
    /** Sum of non-void invoice totals with issue date in current month. */
    invoicedThisMonth: number;
    expenseThisMonth: number;
    /** Canonical accrued labor for the current calendar month. */
    laborCostThisMonth: number;
    unpaidInvoices: number;
    /**
     * AP bills outstanding + sum of positive worker balances (labor + open reimbursements net of
     * payments/advances per balances list). Does not add approved-reimb total again — that bucket
     * is usually already inside worker balances; see `pendingPaymentsBreakdown`.
     */
    pendingPayments: number;
    pendingPaymentsBreakdown: {
      apOutstanding: number;
      workerOwed: number;
      /** Status approved, not yet paid; may overlap amounts included in workerOwed. */
      approvedReimbursementsUnpaid: number;
    };
  };
  reportWarnings?: string[];
  cashFlow: FinanceOwnerCashFlowPoint[];
  topProjects: FinanceOwnerProjectRow[];
  /** Negative-profit projects (worst first), max 5 — surfaces losses when topProjects are all winners. */
  underwaterProjects: FinanceOwnerProjectRow[];
  contractReview: ProjectContractReviewSummary;
  alerts: {
    overdueInvoiceAmount: number;
    overdueInvoiceCount: number;
    unpaidWorkersCount: number;
    unpaidWorkersAmount: number;
    missingReceiptsCount: number;
    projectsInLossCount: number;
  };
};

/**
 * Owner-focused finance snapshot: this month KPIs, 6-month cash flow (received vs spend),
 * top projects by profit, and alert counts. Batches shared queries to limit round-trips.
 */
export async function getFinanceOwnerDashboard(
  explicitClient: SupabaseClient
): Promise<FinanceOwnerDashboard> {
  const now = new Date();
  const reporting = await getReportsData(getReportDateRange({ now }), explicitClient);
  const metric = (key: string) => reporting.monthly.kpis.find((k) => k.key === key)!.value;
  const [projects, approvedReimbursementsUnpaid] = await Promise.all([
    projectsDb.getProjects(explicitClient),
    workerReimbursementsDb.sumUnpaidApprovedWorkerReimbursements(explicitClient),
  ]);
  const today = now.toISOString().slice(0, 10);
  const overdue = reporting.records.outstandingAr.filter(
    (row) => row.dueDate && row.dueDate < today
  );
  const overdueInvoiceAmount = overdue.reduce((n, row) => n + row.amount, 0);
  const overdueInvoiceCount = overdue.length;
  const invoicedThisMonth = metric("invoicedRevenue");
  const cashCollectedThisMonth = metric("cashCollected");
  const expenseThisMonth = metric("expenses");
  const laborCostThisMonth = metric("laborCost");
  const unpaidInvoices = metric("outstandingAr");
  const cashFlow = reporting.cashFlow;

  const contractReview = getProjectContractReviewSummary(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      budget: project.budget,
      contractAmount: project.contractAmount ?? null,
    }))
  );
  const projectRows: FinanceOwnerProjectRow[] = reporting.projectProfitability.rows.map((row) => ({
    projectId: row.projectId,
    name: row.project,
    revenue: row.invoiceContractAmount,
    expense: row.totalCost,
    profit: row.profit,
    profitPct: row.marginPct,
  }));
  const projectsInLossCount = projectRows.filter((row) => row.profit < 0).length;
  projectRows.sort((a, b) => b.profit - a.profit);
  const topProjects = projectRows.slice(0, 5);
  const topIds = new Set(topProjects.map((p) => p.projectId));
  const underwaterProjects = projectRows
    .filter((r) => r.profit < 0 && !topIds.has(r.projectId))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  let unpaidWorkersCount = 0;
  let unpaidWorkersAmount = 0;
  const balances = await fetchWorkerBalances(explicitClient);
  for (const row of balances) {
    if (row.balance > 0.01) {
      unpaidWorkersCount += 1;
      unpaidWorkersAmount += row.balance;
    }
  }

  const apOutstanding = metric("billsAp");
  const workerOwed = unpaidWorkersAmount;
  const pendingPayments = apOutstanding + workerOwed;

  return {
    kpis: {
      cashCollectedThisMonth,
      invoicedThisMonth,
      expenseThisMonth,
      laborCostThisMonth,
      unpaidInvoices,
      pendingPayments,
      pendingPaymentsBreakdown: {
        apOutstanding,
        workerOwed,
        approvedReimbursementsUnpaid,
      },
    },
    reportWarnings: reporting.warnings,
    cashFlow,
    topProjects,
    underwaterProjects,
    contractReview,
    alerts: {
      overdueInvoiceAmount,
      overdueInvoiceCount,
      unpaidWorkersCount,
      unpaidWorkersAmount,
      missingReceiptsCount: metric("missingReceipts"),
      projectsInLossCount,
    },
  };
}
