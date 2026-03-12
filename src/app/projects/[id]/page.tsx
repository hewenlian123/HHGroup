import { notFound } from "next/navigation";
import {
  getProjectById,
  getProjectDetailFinancial,
  getProjectTransactions,
  getProjectExpenseLines,
  getSourceForProject,
  getProjectBillingSummary,
  getChangeOrdersByProject,
  getProjectLaborBreakdown,
  getLaborEntriesWithJoins,
  getSubcontractsByProject,
  getBillsBySubcontractIds,
  getPaymentsBySubcontractIds,
  getDocumentsByProject,
  getApBillsByProject,
} from "@/lib/data";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import {
  ProjectDetailTabsClient,
  type SummaryRow,
  type RecentExpenseRow,
  type BudgetRow,
  type ChangeOrderRow,
  type SubcontractSummaryRow,
  type ProjectLaborSummary,
} from "./project-detail-tabs-client";

type TabKey = "overview" | "financial" | "budget" | "expenses" | "documents" | "activity" | "change-orders" | "labor" | "subcontracts" | "bills";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tabParam = (sp.tab ?? "overview").toString().toLowerCase();
  const tab: TabKey =
    tabParam === "financial" || tabParam === "budget" || tabParam === "expenses" || tabParam === "documents" || tabParam === "activity" || tabParam === "change-orders" || tabParam === "labor" || tabParam === "subcontracts" || tabParam === "bills"
      ? tabParam
      : "overview";

  const project = await getProjectById(id);
  if (!project) notFound();

  const [canonical, financial, transactions, projectExpenseLines, sourceFromEstimate, billingSummary] = await Promise.all([
    getCanonicalProjectProfit(id),
    getProjectDetailFinancial(id),
    Promise.resolve(getProjectTransactions(id)),
    getProjectExpenseLines(id),
    getSourceForProject(id),
    getProjectBillingSummary(id),
  ]);
  if (!financial) notFound();

  // Summary uses canonical profit: revenue = budget + approved CO, actual cost = labor + expense + approved subcontract bills.
  const actualRevenue = canonical.revenue;
  const actualCost = canonical.actualCost;
  const actualProfit = canonical.profit;
  const actualMarginPct = canonical.margin * 100;

  const financialSummary = {
    budget: project.budget ?? 0,
    revenue: actualRevenue,
    spent: actualCost,
    profit: actualProfit,
    marginPct: actualMarginPct,
    collected: billingSummary.paidTotal,
    outstanding: Math.max(0, billingSummary.invoicedTotal - billingSummary.paidTotal),
    cashflow: billingSummary.paidTotal - actualCost,
  };

  const summaryRows: SummaryRow[] = [
    { id: "budget", metric: "Total budget", value: `$${financial.totalBudget.toLocaleString()}` },
    { id: "revenue", metric: "Total revenue", value: `$${actualRevenue.toLocaleString()}` },
    { id: "spent", metric: "Total spent", value: `$${actualCost.toLocaleString()}` },
    { id: "labor", metric: "Labor cost", value: `$${Math.abs(financial.laborCost).toLocaleString()}` },
    {
      id: "profit",
      metric: "Profit",
      value: `${actualProfit >= 0 ? "" : "−"}$${Math.abs(actualProfit).toLocaleString()}`,
    },
    { id: "margin", metric: "Margin %", value: `${actualMarginPct.toFixed(1)}%` },
    { id: "invoiced", metric: "Invoiced", value: `$${billingSummary.invoicedTotal.toLocaleString()}` },
    { id: "collected", metric: "Collected", value: `$${billingSummary.paidTotal.toLocaleString()}` },
    { id: "ar", metric: "AR", value: `$${billingSummary.arBalance.toLocaleString()}` },
  ];

  const recentExpenseRows: RecentExpenseRow[] = projectExpenseLines
    .slice(0, 8)
    .map(({ date, vendorName, line }) => ({
      id: line.id,
      date,
      vendorName,
      category: line.category ?? "Other",
      memo: line.memo ?? null,
      amount: line.amount ?? 0,
    }));

  const budgetRevenue = sourceFromEstimate?.snapshotRevenue ?? project.budget;
  const breakdown = sourceFromEstimate?.snapshotBudgetBreakdown;
  const budgetCost =
    sourceFromEstimate?.snapshotBudgetCost ??
    (breakdown ? breakdown.materials + breakdown.labor + breakdown.vendor + breakdown.other : project.budget);
  const budgetProfit = budgetRevenue - budgetCost;
  const budgetMarginPct = budgetRevenue > 0 ? (budgetProfit / budgetRevenue) * 100 : 0;
  const revenueVar = actualRevenue - budgetRevenue;
  const costVar = actualCost - budgetCost;
  const profitVar = actualProfit - budgetProfit;
  const marginVar = actualMarginPct - budgetMarginPct;

  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const varStr = (v: number, isPct = false) =>
    `${v >= 0 ? "+" : "−"}${isPct ? Math.abs(v).toFixed(1) + "%" : fmt(Math.abs(v))}`;

  const budgetRows: BudgetRow[] = [
    {
      id: "revenue",
      metric: "Revenue",
      budget: fmt(budgetRevenue),
      actual: fmt(actualRevenue),
      variance: varStr(revenueVar),
    },
    {
      id: "cost",
      metric: "Cost",
      budget: fmt(budgetCost),
      actual: fmt(actualCost),
      variance: varStr(costVar),
    },
    {
      id: "profit",
      metric: "Profit",
      budget: `${budgetProfit < 0 ? "−" : ""}${fmt(Math.abs(budgetProfit))}`,
      actual: `${actualProfit < 0 ? "−" : ""}${fmt(Math.abs(actualProfit))}`,
      variance: varStr(profitVar),
    },
    {
      id: "margin",
      metric: "Margin %",
      budget: fmtPct(budgetMarginPct),
      actual: fmtPct(actualMarginPct),
      variance: varStr(marginVar, true),
    },
  ];

  const expenseRows: RecentExpenseRow[] = projectExpenseLines.map(({ date, vendorName, line }) => ({
    id: line.id,
    date,
    vendorName,
    category: line.category ?? "Other",
    memo: line.memo ?? null,
    amount: line.amount ?? 0,
  }));

  const projectDocuments = await getDocumentsByProject(id);

  const projectBills = await getApBillsByProject(id).catch(() => []);

  const changeOrders = await getChangeOrdersByProject(id);
  const changeOrderRows: ChangeOrderRow[] = changeOrders.map((co) => ({
    id: co.id,
    number: co.number,
    status: co.status,
    total: co.total,
    date: co.date,
  }));

  const laborBreakdownRows = await getProjectLaborBreakdown(id);

  const laborEntries = await getLaborEntriesWithJoins({ project_id: id }).catch(() => []);
  const byStatus: Record<"Draft" | "Submitted" | "Approved" | "Locked", number> = {
    Draft: 0,
    Submitted: 0,
    Approved: 0,
    Locked: 0,
  };
  const byStatusHours = { Draft: 0, Submitted: 0, Approved: 0, Locked: 0 };
  let totalHours = 0;
  let totalLaborCost = 0;
  const approvedByWorker = new Map<string, { worker_name: string; days: number; totalLaborCost: number }>();
  for (const e of laborEntries) {
    totalHours += e.hours;
    byStatus[e.status]++;
    const hrs = e.hours ?? 0;
    if (e.status === "Draft") byStatusHours.Draft += hrs;
    else if (e.status === "Submitted") byStatusHours.Submitted += hrs;
    else if (e.status === "Approved") byStatusHours.Approved += hrs;
    else if (e.status === "Locked") byStatusHours.Locked += hrs;
    if (e.status === "Approved" || e.status === "Locked") {
      totalLaborCost += e.cost_amount ?? 0;
      const cur = approvedByWorker.get(e.worker_id);
      const name = e.worker_name ?? "—";
      if (cur) {
        cur.days += 1;
        cur.totalLaborCost += e.cost_amount ?? 0;
      } else {
        approvedByWorker.set(e.worker_id, { worker_name: name, days: 1, totalLaborCost: e.cost_amount ?? 0 });
      }
    }
  }
  const laborSummary: ProjectLaborSummary = {
    totalHours,
    totalLaborCost,
    byStatus: { ...byStatus },
    byStatusHours: { ...byStatusHours },
    approvedLaborRows: Array.from(approvedByWorker.entries()).map(([worker_id, v]) => ({
      worker_id,
      worker_name: v.worker_name,
      days: v.days,
      total_labor_cost: v.totalLaborCost,
    })),
  };

  const subcontracts = await getSubcontractsByProject(id);
  const subcontractIds = subcontracts.map((s) => s.id);
  const [bills, payments] = await Promise.all([
    getBillsBySubcontractIds(subcontractIds),
    getPaymentsBySubcontractIds(subcontractIds),
  ]);
  const approvedBySubcontractId = new Map<string, number>();
  for (const b of bills) {
    if (b.status !== "Approved" && b.status !== "Paid") continue;
    approvedBySubcontractId.set(b.subcontract_id, (approvedBySubcontractId.get(b.subcontract_id) ?? 0) + b.amount);
  }
  const paidBySubcontractId = new Map<string, number>();
  for (const p of payments) {
    paidBySubcontractId.set(p.subcontract_id, (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount);
  }
  const subcontractSummaryRows: SubcontractSummaryRow[] = subcontracts.map((s) => {
    const approved = approvedBySubcontractId.get(s.id) ?? 0;
    const paid = paidBySubcontractId.get(s.id) ?? 0;
    const balanceDue = approved - paid;
    return {
      id: s.id,
      subcontractor_name: s.subcontractor_name,
      contract_amount: s.contract_amount,
      approved,
      paid,
      retainage_held: 0,
      balance_due: balanceDue,
    };
  });

  return (
    <div className="page-container py-6">
      <ProjectDetailTabsClient
        projectId={id}
        project={project}
        financial={financial}
        financialSummary={financialSummary}
        tab={tab}
        summaryRows={summaryRows}
        recentExpenseRows={recentExpenseRows}
        transactions={transactions}
        budgetRows={budgetRows}
        expenseRows={expenseRows}
        projectDocuments={projectDocuments}
        billingSummary={billingSummary}
        changeOrderRows={changeOrderRows}
        laborBreakdownRows={laborBreakdownRows}
        laborSummary={laborSummary}
        subcontractSummaryRows={subcontractSummaryRows}
        projectBills={projectBills}
        canonicalProfit={canonical}
      />
    </div>
  );
}
