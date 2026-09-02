import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
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
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  ProjectFinancialTable,
  ProjectFinancialTableCell,
  ProjectFinancialTableHead,
  ProjectFinancialTableHeader,
} from "../_components/project-financial-responsive-table";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectProfitPage({ params }: Props) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const projectSupabase = await createServerSupabaseClient();
  if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
  const supabase = getServerSupabaseInternalNoStore();
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
    getProjectById(id, projectSupabase),
    getCanonicalProjectProfit(id, projectSupabase),
    getLaborEntriesWithJoins({ project_id: id }, supabase ?? undefined),
    getLaborActualByProject(id, supabase ?? undefined),
    getApprovedSubcontractBillsTotalByProject(id),
    getExpenseTotalsByProject(id),
    getProjectEstimate(id),
    getSubcontractsByProject(id),
    getProjectBudgetItems(id),
    getProjectExpenseLines(id, supabase ?? undefined),
    getWorkers(),
  ]);
  const rateByWorker = new Map(workers.map((w) => [w.id, w.halfDayRate / 4]));
  const subcontractIds = subcontracts.map((s) => s.id);
  const [payments, bills] = await Promise.all([
    subcontractIds.length > 0 ? getPaymentsBySubcontractIds(subcontractIds) : Promise.resolve([]),
    subcontractIds.length > 0 ? getBillsBySubcontractIds(subcontractIds) : Promise.resolve([]),
  ]);

  if (!project) notFound();

  // Canonical formula: revenue = projects.budget + approved change orders; actual cost = labor + expense + approved subcontract bills + accrued commission.
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
    {
      category: "Commission / Selling Cost",
      budget: null,
      actual: canonical.commissionCost,
      variance: null,
      impactOnProfit: -canonical.commissionCost,
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
              className="inline-flex min-h-[44px] items-center text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Revenue</span>
        <span className="text-hh-section-title font-medium tabular-nums">${fmtUsd(revenue)}</span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Total Cost</span>
        <span className="text-hh-section-title font-medium tabular-nums">${fmtUsd(totalCost)}</span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Profit</span>
        <span
          className={`text-hh-section-title font-medium tabular-nums ${profit >= 0 ? "text-[var(--hh-text-primary)]" : "text-destructive"}`}
        >
          ${fmtUsd(profit)}
        </span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Margin</span>
        <span
          className={`text-hh-section-title font-medium tabular-nums ${marginPct >= 0 ? "text-[var(--hh-text-primary)]" : "text-destructive"}`}
        >
          {marginPct.toFixed(1)}%
        </span>
      </div>
      <Divider />
      <SectionHeader label="Forecast" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Revenue</span>
        <span className="text-hh-section-title font-medium tabular-nums">${fmtUsd(revenue)}</span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Actual Cost</span>
        <span className="text-hh-section-title font-medium tabular-nums">${fmtUsd(totalCost)}</span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Remaining Commitment</span>
        <span className="text-hh-section-title font-medium tabular-nums">
          ${fmtUsd(remainingCommitment)}
        </span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Forecast Final Cost</span>
        <span className="text-hh-section-title font-medium tabular-nums">
          ${fmtUsd(forecastFinalCost)}
        </span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Forecast Profit</span>
        <span
          className={`text-hh-section-title font-medium tabular-nums ${forecastProfit < 0 ? "text-destructive" : forecastProfit > 0 ? "text-hh-profit-positive dark:text-hh-profit-positive" : ""}`}
        >
          ${fmtUsd(forecastProfit)}
        </span>
        <span className="text-hh-body text-[var(--hh-text-secondary)]">Forecast Margin %</span>
        <span
          className={`text-hh-section-title font-medium tabular-nums ${forecastProfit < 0 ? "text-destructive" : forecastProfit > 0 ? "text-hh-profit-positive dark:text-hh-profit-positive" : ""}`}
        >
          {forecastMarginPct.toFixed(1)}%
        </span>
      </div>
      <Divider />
      <SectionHeader label="Forecast by Cost Code" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <ProjectFinancialTable aria-label="Forecast by cost code">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="profit-forecast-cost-code"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Cost Code
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-forecast-budget"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Budget
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-forecast-actual"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Actual
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-forecast-remaining"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Remaining
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-forecast-final"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Forecast
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-forecast-variance"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Variance
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {forecastByCostCodeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No budget items.
                  </td>
                </tr>
              ) : (
                forecastByCostCodeRows.map((r) => {
                  const variancePositive = r.variance > 0;
                  const varianceClass = variancePositive
                    ? "text-destructive"
                    : "text-hh-profit-positive dark:text-hh-profit-positive";
                  return (
                    <tr key={r.costCode} className={listTableRowStaticClassName}>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-cost-code"
                        label="Cost Code"
                        className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                      >
                        {r.costCode}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-budget"
                        label="Budget"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(r.budget)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-actual"
                        label="Actual"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(r.actual)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-remaining"
                        label="Remaining"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(r.remaining)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-final"
                        label="Forecast"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(r.forecast)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-forecast-variance"
                        label="Variance"
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums",
                          varianceClass
                        )}
                      >
                        ${fmtUsd(r.variance)}
                      </ProjectFinancialTableCell>
                    </tr>
                  );
                })
              )}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
      <Divider />
      <SectionHeader label="Cost breakdown" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <ProjectFinancialTable aria-label="Cost breakdown">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="profit-cost-category"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Category
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-cost-budget"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Budget
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-cost-actual"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Actual
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-cost-variance"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Variance
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-cost-impact"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Impact on Profit
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className={listTableRowStaticClassName}>
                  <ProjectFinancialTableCell
                    headerId="profit-cost-category"
                    label="Category"
                    className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                  >
                    {r.category}
                  </ProjectFinancialTableCell>
                  <ProjectFinancialTableCell
                    headerId="profit-cost-budget"
                    label="Budget"
                    className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                  >
                    {r.budget != null ? `$${fmtUsd(r.budget)}` : "—"}
                  </ProjectFinancialTableCell>
                  <ProjectFinancialTableCell
                    headerId="profit-cost-actual"
                    label="Actual"
                    className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                  >
                    ${fmtUsd(r.actual)}
                  </ProjectFinancialTableCell>
                  <ProjectFinancialTableCell
                    headerId="profit-cost-variance"
                    label="Variance"
                    className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                  >
                    {r.variance != null ? `$${fmtUsd(r.variance)}` : "—"}
                  </ProjectFinancialTableCell>
                  <ProjectFinancialTableCell
                    headerId="profit-cost-impact"
                    label="Impact on Profit"
                    className={cn(
                      "h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums",
                      r.impactOnProfit <= 0 && "text-destructive"
                    )}
                  >
                    ${fmtUsd(r.impactOnProfit)}
                  </ProjectFinancialTableCell>
                </tr>
              ))}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
      <Divider />
      <SectionHeader label="Subcontracts" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <ProjectFinancialTable aria-label="Subcontract exposure">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="profit-subcontract-name"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Subcontractor
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-subcontract-revised"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Revised Contract
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-subcontract-paid"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Paid
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="profit-subcontract-exposure"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Exposure
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {subcontractRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No subcontracts.
                  </td>
                </tr>
              ) : (
                subcontractRows.map((s) => {
                  const exposurePositive = s.exposure > 0;
                  const paidInFull = s.paid >= s.revised;
                  const rowClass = paidInFull
                    ? "bg-[var(--hh-success-soft-fill)]"
                    : exposurePositive
                      ? "bg-[var(--hh-warning-soft-fill)] dark:bg-[var(--hh-warning-soft-fill)]"
                      : "";
                  return (
                    <tr key={s.id} className={cn(listTableRowStaticClassName, rowClass)}>
                      <ProjectFinancialTableCell
                        headerId="profit-subcontract-name"
                        label="Subcontractor"
                        className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                      >
                        {s.subcontractor_name}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-subcontract-revised"
                        label="Revised Contract"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(s.revised)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-subcontract-paid"
                        label="Paid"
                        className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                      >
                        ${fmtUsd(s.paid)}
                      </ProjectFinancialTableCell>
                      <ProjectFinancialTableCell
                        headerId="profit-subcontract-exposure"
                        label="Exposure"
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums",
                          exposurePositive
                            ? "text-[var(--hh-warning)] dark:text-[var(--hh-warning)]"
                            : paidInFull
                              ? "text-hh-profit-positive dark:text-hh-profit-positive"
                              : ""
                        )}
                      >
                        ${fmtUsd(s.exposure)}
                      </ProjectFinancialTableCell>
                    </tr>
                  );
                })
              )}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
    </PageLayout>
  );
}
