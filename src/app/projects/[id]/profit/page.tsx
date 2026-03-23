import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import {
  getProjectById,
  getLaborEntriesWithJoins,
  getLaborActualByProject,
  getApprovedSubcontractBillsTotalByProject,
  getExpenseTotalsByProject,
  getProjectEstimate,
  getSubcontractsByProject,
  getProjectBudgetItems,
  getPaymentsBySubcontractIds,
  getBillsBySubcontractIds,
  getProjectExpenseLines,
  getWorkers,
} from "@/lib/data";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectProfitPage({ params }: Props) {
  const { id } = await params;
  const [
    project,
    canonical,
    laborEntries,
    laborActual,
    subcontractTotal,
    expenseTotal,
    estimate,
    subcontracts,
    budgetItems,
    expenseLines,
    workers,
  ] = await Promise.all([
    getProjectById(id),
    getCanonicalProjectProfit(id),
    getLaborEntriesWithJoins({ project_id: id }),
    getLaborActualByProject(id),
    getApprovedSubcontractBillsTotalByProject(id),
    getExpenseTotalsByProject(id),
    getProjectEstimate(id),
    getSubcontractsByProject(id),
    getProjectBudgetItems(id),
    getProjectExpenseLines(id),
    getWorkers(),
  ]);
  const rateByWorker = new Map(workers.map((w) => [w.id, w.halfDayRate / 4]));
  const subcontractIds = subcontracts.map((s) => s.id);
  const [payments, bills] = await Promise.all([
    subcontractIds.length > 0 ? getPaymentsBySubcontractIds(subcontractIds) : Promise.resolve([]),
    subcontractIds.length > 0 ? getBillsBySubcontractIds(subcontractIds) : Promise.resolve([]),
  ]);

  if (!project) notFound();

  // Canonical formula: revenue = projects.budget + approved change orders; actual cost = labor + expense + approved subcontract bills.
  const revenue = canonical.revenue;
  const totalCost = canonical.actualCost;
  const profit = canonical.profit;
  const marginPct = canonical.margin * 100;

  const totalSubcontractContractAmount = subcontracts.reduce((s, c) => s + c.contract_amount, 0);
  const remainingCommitment = totalSubcontractContractAmount - subcontractTotal;
  const forecastFinalCost = totalCost + remainingCommitment;
  const forecastProfit = revenue - forecastFinalCost;
  const forecastMarginPct = revenue > 0 ? (forecastProfit / revenue) * 100 : 0;

  const approvedCoByCostCode = new Map<string, number>();
  for (const item of budgetItems) {
    const code = item.costCode ?? "";
    approvedCoByCostCode.set(code, (approvedCoByCostCode.get(code) ?? 0) + item.total);
  }
  const paidBySubcontractId = new Map<string, number>();
  for (const p of payments) {
    paidBySubcontractId.set(
      p.subcontract_id,
      (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount
    );
  }
  const subcontractRows = subcontracts.map((s) => {
    const revised = s.contract_amount + (approvedCoByCostCode.get(s.cost_code ?? "") ?? 0);
    const paid = paidBySubcontractId.get(s.id) ?? 0;
    const exposure = revised - paid;
    return { ...s, revised, paid, exposure };
  });

  const budgetByCostCode = new Map<string, number>();
  for (const item of budgetItems) {
    const code = item.costCode ?? "";
    budgetByCostCode.set(code, (budgetByCostCode.get(code) ?? 0) + item.total);
  }
  const laborByCostCode = new Map<string, number>();
  for (const e of laborEntries) {
    const code = e.cost_code ?? "";
    const hours = Number(e.hours) || 0;
    const hourlyRate = rateByWorker.get(e.worker_id) ?? 0;
    laborByCostCode.set(code, (laborByCostCode.get(code) ?? 0) + hours * hourlyRate);
  }
  const subcontractIdToCostCode = new Map(subcontracts.map((s) => [s.id, s.cost_code ?? ""]));
  const approvedBillsByCostCode = new Map<string, number>();
  for (const b of bills) {
    if (b.status !== "Approved" && b.status !== "Paid") continue;
    const code = subcontractIdToCostCode.get(b.subcontract_id) ?? "";
    approvedBillsByCostCode.set(code, (approvedBillsByCostCode.get(code) ?? 0) + b.amount);
  }
  const expenseByCostCode = new Map<string, number>();
  for (const { line } of expenseLines) {
    const code = line.costCode ?? "";
    expenseByCostCode.set(code, (expenseByCostCode.get(code) ?? 0) + line.amount);
  }
  const contractAmountByCostCode = new Map<string, number>();
  for (const s of subcontracts) {
    const code = s.cost_code ?? "";
    contractAmountByCostCode.set(
      code,
      (contractAmountByCostCode.get(code) ?? 0) + s.contract_amount
    );
  }
  const costCodesForForecast = Array.from(new Set(budgetItems.map((b) => b.costCode ?? ""))).sort();
  const forecastByCostCodeRows = costCodesForForecast.map((code) => {
    const budget = budgetByCostCode.get(code) ?? 0;
    const labor = laborByCostCode.get(code) ?? 0;
    const billsApproved = approvedBillsByCostCode.get(code) ?? 0;
    const expense = expenseByCostCode.get(code) ?? 0;
    const actual = labor + billsApproved + expense;
    const contractAmount = contractAmountByCostCode.get(code) ?? 0;
    const remaining = contractAmount - billsApproved;
    const forecast = actual + remaining;
    const variance = forecast - budget;
    return { costCode: code || "—", budget, actual, remaining, forecast, variance };
  });

  type Row = {
    category: string;
    budget: number | null;
    actual: number;
    variance: number | null;
    impactOnProfit: number;
  };
  const laborBudget = estimate?.laborCost ?? null;
  const subcontractBudget = estimate?.vendorCost ?? null;
  const expenseBudget =
    estimate != null ? (estimate.materialsCost ?? 0) + (estimate.otherCost ?? 0) : null;
  const rows: Row[] = [
    {
      category: "Labor",
      budget: laborBudget ?? null,
      actual: laborActual,
      variance: laborBudget != null ? laborActual - laborBudget : null,
      impactOnProfit: -laborActual,
    },
    {
      category: "Subcontract",
      budget: subcontractBudget ?? null,
      actual: subcontractTotal,
      variance: subcontractBudget != null ? subcontractTotal - subcontractBudget : null,
      impactOnProfit: -subcontractTotal,
    },
    {
      category: "Expense",
      budget: expenseBudget,
      actual: expenseTotal,
      variance: expenseBudget != null ? expenseTotal - expenseBudget : null,
      impactOnProfit: -expenseTotal,
    },
  ];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Profit"
          description={`Revenue, cost, and margin for ${project.name}.`}
          actions={
            <Link
              href={`/projects/${id}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Revenue</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(revenue)}</span>
        <span className="text-sm text-muted-foreground">Total Cost</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(totalCost)}</span>
        <span className="text-sm text-muted-foreground">Profit</span>
        <span
          className={`text-lg font-medium tabular-nums ${profit >= 0 ? "text-foreground" : "text-destructive"}`}
        >
          ${fmtUsd(profit)}
        </span>
        <span className="text-sm text-muted-foreground">Margin</span>
        <span
          className={`text-lg font-medium tabular-nums ${marginPct >= 0 ? "text-foreground" : "text-destructive"}`}
        >
          {marginPct.toFixed(1)}%
        </span>
      </div>
      <Divider />
      <SectionHeader label="Forecast" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Revenue</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(revenue)}</span>
        <span className="text-sm text-muted-foreground">Actual Cost</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(totalCost)}</span>
        <span className="text-sm text-muted-foreground">Remaining Commitment</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(remainingCommitment)}</span>
        <span className="text-sm text-muted-foreground">Forecast Final Cost</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(forecastFinalCost)}</span>
        <span className="text-sm text-muted-foreground">Forecast Profit</span>
        <span
          className={`text-lg font-medium tabular-nums ${forecastProfit < 0 ? "text-destructive" : forecastProfit > 0 ? "text-green-600 dark:text-green-400" : ""}`}
        >
          ${fmtUsd(forecastProfit)}
        </span>
        <span className="text-sm text-muted-foreground">Forecast Margin %</span>
        <span
          className={`text-lg font-medium tabular-nums ${forecastProfit < 0 ? "text-destructive" : forecastProfit > 0 ? "text-green-600 dark:text-green-400" : ""}`}
        >
          {forecastMarginPct.toFixed(1)}%
        </span>
      </div>
      <Divider />
      <SectionHeader label="Forecast by Cost Code" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Budget
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Actual
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Remaining
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Forecast
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Variance
              </th>
            </tr>
          </thead>
          <tbody>
            {forecastByCostCodeRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={6} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No budget items.
                </td>
              </tr>
            ) : (
              forecastByCostCodeRows.map((r) => {
                const variancePositive = r.variance > 0;
                const varianceClass = variancePositive
                  ? "text-destructive"
                  : "text-green-600 dark:text-green-400";
                return (
                  <tr key={r.costCode} className="border-b border-border/40">
                    <td className="py-1.5 px-3">{r.costCode}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.budget)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.actual)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.remaining)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.forecast)}</td>
                    <td className={`py-1.5 px-3 text-right tabular-nums ${varianceClass}`}>
                      ${fmtUsd(r.variance)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Divider />
      <SectionHeader label="Cost breakdown" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Budget
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Actual
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Variance
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Impact on Profit
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-b border-border/40">
                <td className="py-1.5 px-3">{r.category}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  {r.budget != null ? `$${fmtUsd(r.budget)}` : "—"}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.actual)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  {r.variance != null ? `$${fmtUsd(r.variance)}` : "—"}
                </td>
                <td
                  className={`py-1.5 px-3 text-right tabular-nums ${r.impactOnProfit <= 0 ? "text-destructive" : ""}`}
                >
                  ${fmtUsd(r.impactOnProfit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Divider />
      <SectionHeader label="Subcontracts" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subcontractor
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Revised Contract
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Paid
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Exposure
              </th>
            </tr>
          </thead>
          <tbody>
            {subcontractRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No subcontracts.
                </td>
              </tr>
            ) : (
              subcontractRows.map((s) => {
                const exposurePositive = s.exposure > 0;
                const paidInFull = s.paid >= s.revised;
                const rowClass = paidInFull
                  ? "bg-green-500/10 dark:bg-green-500/10"
                  : exposurePositive
                    ? "bg-orange-500/10 dark:bg-orange-500/10"
                    : "";
                return (
                  <tr key={s.id} className={`border-b border-border/40 ${rowClass}`}>
                    <td className="py-1.5 px-3">{s.subcontractor_name}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(s.revised)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(s.paid)}</td>
                    <td
                      className={`py-1.5 px-3 text-right tabular-nums ${exposurePositive ? "text-orange-600 dark:text-orange-400" : paidInFull ? "text-green-600 dark:text-green-400" : ""}`}
                    >
                      ${fmtUsd(s.exposure)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
