import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import {
  getInvoicesWithDerived,
  getPaymentsSummaryAll,
  getBillsAll,
  getSubcontractPaymentsAll,
  getLaborPayments,
  getTotalExpenses,
  getProjects,
  getSubcontractsWithDetailsAll,
  getExpenseTotalsByProject,
  getDeposits,
  getTotalDepositsAmount,
} from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function CashflowPage() {
  let invoicesWithDerived: Awaited<ReturnType<typeof getInvoicesWithDerived>> = [];
  let subcontractPaymentsSummary: Awaited<ReturnType<typeof getPaymentsSummaryAll>> = [];
  let billsAll: Awaited<ReturnType<typeof getBillsAll>> = [];
  let subcontractPaymentsAll: Awaited<ReturnType<typeof getSubcontractPaymentsAll>> = [];
  let laborPayments: Awaited<ReturnType<typeof getLaborPayments>> = [];
  let totalExpenses = 0;
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let subcontractsDetails: Awaited<ReturnType<typeof getSubcontractsWithDetailsAll>> = [];
  let depositsTotal = 0;
  let depositsList: Awaited<ReturnType<typeof getDeposits>> = [];
  let dataLoadWarning: string | null = null;

  try {
    [
      invoicesWithDerived,
      subcontractPaymentsSummary,
      billsAll,
      subcontractPaymentsAll,
      laborPayments,
      totalExpenses,
      projects,
      subcontractsDetails,
      depositsTotal,
      depositsList,
    ] = await Promise.all([
      getInvoicesWithDerived(),
      getPaymentsSummaryAll(),
      getBillsAll(),
      getSubcontractPaymentsAll(),
      getLaborPayments(),
      getTotalExpenses(),
      getProjects(),
      getSubcontractsWithDetailsAll().catch(() => []),
      getTotalDepositsAmount(),
      getDeposits(),
    ]);
  } catch (e) {
    logServerPageDataError("dashboard/cashflow", e);
    dataLoadWarning = serverDataLoadWarning(e, "cashflow data");
  }

  const cashIn = depositsTotal;
  const subcontractOut = subcontractPaymentsSummary.reduce((s, p) => s + p.amount, 0);
  const laborOut = laborPayments.reduce((s, p) => s + p.amount, 0);
  const expenseOut = totalExpenses;
  const cashOut = subcontractOut + laborOut + expenseOut;
  const netCash = cashIn - cashOut;

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expectedInflow = invoicesWithDerived
    .filter((i) => i.status !== "Void" && i.dueDate >= today && i.dueDate <= in30Days)
    .reduce((s, i) => s + i.balanceDue, 0);

  const approvedBills = billsAll.filter((b) => b.status === "Approved");
  const approvedBillIds = new Set(approvedBills.map((b) => b.id));
  const approvedBillsTotal = approvedBills.reduce((s, b) => s + b.amount, 0);
  const paidOnApproved = subcontractPaymentsAll
    .filter((p) => p.bill_id != null && approvedBillIds.has(p.bill_id))
    .reduce((s, p) => s + p.amount, 0);
  const expectedOutflow = Math.max(0, approvedBillsTotal - paidOnApproved);

  const cashInByProject = new Map<string, number>();
  for (const d of depositsList) {
    const projectId = d.project_id ?? "";
    cashInByProject.set(projectId, (cashInByProject.get(projectId) ?? 0) + d.amount);
  }
  const subcontractIdToProjectId = new Map(subcontractsDetails.map((s) => [s.id, s.project_id]));
  const cashOutByProject = new Map<string, number>();
  for (const p of subcontractPaymentsSummary) {
    const projectId = subcontractIdToProjectId.get(p.subcontract_id) ?? "";
    cashOutByProject.set(projectId, (cashOutByProject.get(projectId) ?? 0) + p.amount);
  }
  let projectExpenseTotals: number[] = [];
  if (projects.length > 0) {
    try {
      projectExpenseTotals = await Promise.all(
        projects.map((p) => getExpenseTotalsByProject(p.id))
      );
    } catch (e) {
      logServerPageDataError("dashboard/cashflow expense totals", e);
      dataLoadWarning = dataLoadWarning ?? serverDataLoadWarning(e, "expense totals by project");
      projectExpenseTotals = projects.map(() => 0);
    }
  }
  projects.forEach((p, i) => {
    const exp = projectExpenseTotals[i] ?? 0;
    cashOutByProject.set(p.id, (cashOutByProject.get(p.id) ?? 0) + exp);
  });
  const breakdownRows = projects.map((p) => {
    const inVal = cashInByProject.get(p.id) ?? 0;
    const outVal = cashOutByProject.get(p.id) ?? 0;
    return { id: p.id, name: p.name, cashIn: inVal, cashOut: outVal, net: inVal - outVal };
  });
  const laborRow = { id: "_labor", name: "Labor", cashIn: 0, cashOut: laborOut, net: -laborOut };
  const allBreakdownRows = [...breakdownRows, laborRow];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Cashflow"
          description="Current position, 30-day projection, and project breakdown."
          actions={
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          }
        />
      }
    >
      {dataLoadWarning ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      <SectionHeader label="Current Position" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Cash In</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(cashIn)}</span>
        <span className="text-sm text-muted-foreground">Cash Out</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(cashOut)}</span>
        <span className="text-sm text-muted-foreground">Net Cash</span>
        <span
          className={`text-lg font-medium tabular-nums ${netCash >= 0 ? "text-foreground" : "text-destructive"}`}
        >
          ${fmtUsd(netCash)}
        </span>
      </div>
      <Divider />

      <SectionHeader label="30 Day Projection" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Expected Inflow</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(expectedInflow)}</span>
        <span className="text-sm text-muted-foreground">Expected Outflow</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(expectedOutflow)}</span>
      </div>
      <Divider />

      <SectionHeader label="Project Breakdown" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Cash In
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Cash Out
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {allBreakdownRows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="py-1.5 px-3">{r.name}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.cashIn)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.cashOut)}</td>
                <td
                  className={`py-1.5 px-3 text-right tabular-nums ${r.net >= 0 ? "" : "text-destructive"}`}
                >
                  ${fmtUsd(r.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
