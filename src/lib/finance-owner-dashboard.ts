import * as apBillsDb from "@/lib/ap-bills-db";
import * as expensesDb from "@/lib/expenses-db";
import * as invoicesDb from "@/lib/invoices-db";
import * as laborDb from "@/lib/labor-db";
import * as projectsDb from "@/lib/projects-db";
import * as workerReimbursementsDb from "@/lib/worker-reimbursements-db";
import { getCanonicalProjectProfitBatch, type CanonicalProjectProfit } from "@/lib/profit-engine";
import { getServerSupabaseInternal } from "@/lib/supabase-server";
import { fetchWorkerBalances } from "@/lib/worker-balances-list";

export type FinanceOwnerCashFlowPoint = {
  label: string;
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
    /** cashCollectedThisMonth − expenseThisMonth */
    profitThisMonth: number;
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
  cashFlow: FinanceOwnerCashFlowPoint[];
  topProjects: FinanceOwnerProjectRow[];
  /** Negative-profit projects (worst first), max 5 — surfaces losses when topProjects are all winners. */
  underwaterProjects: FinanceOwnerProjectRow[];
  alerts: {
    overdueInvoiceAmount: number;
    overdueInvoiceCount: number;
    unpaidWorkersCount: number;
    unpaidWorkersAmount: number;
    missingReceiptsCount: number;
    projectsInLossCount: number;
  };
};

function monthRangeUtc(year: number, month1Based: number): { start: string; end: string } {
  const lastDay = new Date(year, month1Based, 0).getDate();
  const y = String(year);
  const m = String(month1Based).padStart(2, "0");
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

function shiftMonth(year: number, month1Based: number, delta: number): { y: number; m: number } {
  const d = new Date(year, month1Based - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/**
 * Owner-focused finance snapshot: this month KPIs, 6-month cash flow (received vs spend),
 * top projects by profit, and alert counts. Batches shared queries to limit round-trips.
 */
export async function getFinanceOwnerDashboard(): Promise<FinanceOwnerDashboard> {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const { start: monthStart, end: monthEnd } = monthRangeUtc(cy, cm);
  const ymPrefix = `${cy}-${String(cm).padStart(2, "0")}`;
  const receiptWindowStart = new Date(now);
  receiptWindowStart.setDate(receiptWindowStart.getDate() - 90);
  const receiptStartStr = receiptWindowStart.toISOString().slice(0, 10);

  const [
    invoices,
    payments,
    apSummary,
    projects,
    missingReceiptsCount,
    cashFlowMonths,
    approvedReimbursementsUnpaid,
  ] = await Promise.all([
    invoicesDb.getInvoicesWithDerived(),
    invoicesDb.getInvoicePayments(),
    apBillsDb.getApBillsSummary().catch(() => ({
      totalOutstanding: 0,
      overdueCount: 0,
      overdueAmount: 0,
      dueThisWeekCount: 0,
      dueThisWeekAmount: 0,
      paidThisMonthAmount: 0,
    })),
    projectsDb.getProjects().catch(() => [] as Awaited<ReturnType<typeof projectsDb.getProjects>>),
    expensesDb.countExpensesWithoutReceiptUrlInRange(receiptStartStr, monthEnd).catch(() => 0),
    Promise.all(
      [5, 4, 3, 2, 1, 0]
        .map((back) => {
          const { y, m } = shiftMonth(cy, cm, -back);
          return { y, m, ...monthRangeUtc(y, m) };
        })
        .map(async ({ y, m, start, end }) => {
          const [ex, lab] = await Promise.all([
            expensesDb.getExpensesTotalForMonth(y, m).catch(() => 0),
            laborDb.getLaborCostForDateRange(start, end).catch(() => 0),
          ]);
          return { y, m, start, end, monthSpend: ex + lab };
        })
    ),
    workerReimbursementsDb.sumUnpaidApprovedWorkerReimbursements().catch(() => 0),
  ]);

  const today = now.toISOString().slice(0, 10);

  let invoicedThisMonth = 0;
  let unpaidInvoices = 0;
  let overdueInvoiceAmount = 0;
  let overdueInvoiceCount = 0;

  for (const inv of invoices) {
    if (inv.computedStatus === "Void") continue;
    const issueYm = inv.issueDate.slice(0, 7);
    if (issueYm === ymPrefix) {
      invoicedThisMonth += inv.total;
    }
    if (
      inv.computedStatus === "Unpaid" ||
      inv.computedStatus === "Partial" ||
      inv.computedStatus === "Overdue"
    ) {
      unpaidInvoices += inv.balanceDue;
      if (inv.dueDate < today && inv.balanceDue > 0.005) {
        overdueInvoiceCount += 1;
        overdueInvoiceAmount += inv.balanceDue;
      }
    }
  }

  const [expenseLinesMonth, laborMonth] = await Promise.all([
    expensesDb.getExpensesTotalForMonth(cy, cm).catch(() => 0),
    laborDb.getLaborCostForDateRange(monthStart, monthEnd).catch(() => 0),
  ]);
  const expenseThisMonth = expenseLinesMonth + laborMonth;

  const paymentMonthKey = (d: string) => d.slice(0, 7);
  const incomeByMonth = new Map<string, number>();
  let cashCollectedThisMonth = 0;
  for (const p of payments) {
    if (p.status === "Voided" || !p.date) continue;
    const k = paymentMonthKey(p.date);
    incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + p.amount);
    if (p.date >= monthStart && p.date <= monthEnd) {
      cashCollectedThisMonth += p.amount;
    }
  }
  const profitThisMonth = cashCollectedThisMonth - expenseThisMonth;

  const cashFlow: FinanceOwnerCashFlowPoint[] = cashFlowMonths.map(({ y, m, monthSpend }) => {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
    return {
      label,
      income: incomeByMonth.get(key) ?? 0,
      expense: monthSpend,
    };
  });

  const projectIds = projects.map((p) => p.id);
  const profitMap = await getCanonicalProjectProfitBatch(projectIds).catch(
    () => new Map<string, CanonicalProjectProfit>()
  );

  let projectsInLossCount = 0;
  const projectRows: FinanceOwnerProjectRow[] = [];
  for (const p of projects) {
    const c = profitMap.get(p.id);
    if (!c) continue;
    const revenue = c.revenue;
    const expense = c.actualCost;
    const profit = c.profit;
    if (profit < 0) projectsInLossCount += 1;
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : profit < 0 ? -100 : 0;
    projectRows.push({
      projectId: p.id,
      name: (p.name ?? "").trim() || "Untitled project",
      revenue,
      expense,
      profit,
      profitPct,
    });
  }
  projectRows.sort((a, b) => b.profit - a.profit);
  const topProjects = projectRows.slice(0, 5);
  const topIds = new Set(topProjects.map((p) => p.projectId));
  const underwaterProjects = projectRows
    .filter((r) => r.profit < 0 && !topIds.has(r.projectId))
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const sb = getServerSupabaseInternal();
  let unpaidWorkersCount = 0;
  let unpaidWorkersAmount = 0;
  if (sb) {
    try {
      const balances = await fetchWorkerBalances(sb);
      for (const row of balances) {
        if (row.balance > 0.01) {
          unpaidWorkersCount += 1;
          unpaidWorkersAmount += row.balance;
        }
      }
    } catch {
      // balances optional for dashboard
    }
  }

  const apOutstanding = apSummary.totalOutstanding;
  const workerOwed = unpaidWorkersAmount;
  const pendingPayments = apOutstanding + workerOwed;

  return {
    kpis: {
      cashCollectedThisMonth,
      invoicedThisMonth,
      expenseThisMonth,
      profitThisMonth,
      unpaidInvoices,
      pendingPayments,
      pendingPaymentsBreakdown: {
        apOutstanding,
        workerOwed,
        approvedReimbursementsUnpaid,
      },
    },
    cashFlow,
    topProjects,
    underwaterProjects,
    alerts: {
      overdueInvoiceAmount,
      overdueInvoiceCount,
      unpaidWorkersCount,
      unpaidWorkersAmount,
      missingReceiptsCount,
      projectsInLossCount,
    },
  };
}
