import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { AlertBanner } from "@/components/alert-banner";
import {
  getProjectById,
  getProjectDetailFinancial,
  getProjectEstimate,
  getProjectLabor,
  getProjectTransactions,
  getExpenseLinesByProject,
  getProjectCashFlowData,
  getProjectExpenseLines,
  getCategorySpendByProject,
  getCommittedCostByCategory,
  getVendorSpendByProject,
  getProjectBillingSummary,
  getSourceForProject,
  type ProjectTransactionRow,
} from "@/lib/data";
import { ProjectCashFlowChart } from "@/components/project-cash-flow-chart";
import { CommitmentsSection } from "@/components/commitments-section";
import { ProfitDrilldownCard } from "@/components/profit-drilldown-card";
import { ArrowLeft, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getProjectById(id);
  if (!project) notFound();

  const financial = getProjectDetailFinancial(id);
  const estimate = getProjectEstimate(id);
  const labor = getProjectLabor(id);
  const transactions = getProjectTransactions(id);
  const expenseLines = getExpenseLinesByProject(id, 5);
  const cashFlowData = getProjectCashFlowData(id);
  const sourceFromEstimate = getSourceForProject?.(id) ?? null;
  const projectExpenseLines = getProjectExpenseLines(id);
  const categorySpend = getCategorySpendByProject(id);
  const committedSpend = getCommittedCostByCategory(id);
  const vendorSpend = getVendorSpendByProject(id);
  const recentCostLines = projectExpenseLines.slice(0, 8).map(({ expenseId, date, vendorName, line }) => ({
    expenseId,
    date,
    vendorName,
    category: line.category ?? "Other",
    amount: line.amount ?? 0,
    memo: line.memo ?? null,
  }));
  const drilldownBudget = sourceFromEstimate?.snapshotBudgetBreakdown ?? null;
  const billingSummary = getProjectBillingSummary(id);
  if (!financial) notFound();

  // Acceptance checks:
  // 1) Revenue priority must be snapshotRevenue > budget fallback.
  // 2) AR must reconcile as max(0, Invoiced - Collected).
  const sourceRevenue = sourceFromEstimate?.snapshotRevenue ?? null;
  const actualRevenue = sourceRevenue ?? project.budget;
  const actualCost = financial.totalSpent;
  const actualProfit = actualRevenue - actualCost;
  const actualMarginPct = actualRevenue > 0 ? (actualProfit / actualRevenue) * 100 : 0;

  const estimateProfit = estimate != null ? estimate.revenue - estimate.cost : null;
  const estimateMargin = estimate != null && estimate.revenue > 0 && estimateProfit !== null
    ? (estimateProfit / estimate.revenue) * 100
    : null;

  const revenueVariance = estimate != null ? actualRevenue - estimate.revenue : null;
  const costVariance = estimate != null ? actualCost - estimate.cost : null;
  const profitVariance = estimate != null && estimateProfit !== null ? actualProfit - estimateProfit : null;
  const marginVariance = estimateMargin !== null ? actualMarginPct - estimateMargin : null;

  return (
    <div className="page-container page-stack py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            <StatusBadge status={project.status} className="text-[10px] font-medium" />
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-lg border-zinc-200/60 w-fit">
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {(() => {
        const source = sourceFromEstimate ?? null;
        const breakdown = source?.snapshotBudgetBreakdown;
        const snapshotBudgetCost =
          source?.snapshotBudgetCost ??
          (breakdown ? breakdown.materials + breakdown.labor + breakdown.vendor + breakdown.other : undefined);
        const actualCost = financial?.totalSpent ?? 0;
        const budgetLabor = source?.snapshotBudgetBreakdown?.labor;
        const actualLabor = Math.abs(financial?.laborCost ?? 0);
        const laborUsagePct =
          budgetLabor != null && budgetLabor > 0 ? (actualLabor / budgetLabor) * 100 : null;
        const cashIn = financial?.incomeTotal ?? 0;
        const cashOut = financial?.expenseTotal ?? 0;
        const netCash = cashIn - cashOut;
        const monthlyBurn = cashOut / 3;
        const monthsRemaining = monthlyBurn > 0 ? netCash / monthlyBurn : null;

        const alerts: { variant: "red" | "amber"; message: string }[] = [];
        if (snapshotBudgetCost != null && actualCost > snapshotBudgetCost) {
          alerts.push({ variant: "red", message: "⚠ Project is over budget" });
        }
        if (laborUsagePct != null && laborUsagePct >= 100) {
          alerts.push({ variant: "red", message: "🚨 Labor budget exceeded" });
        } else if (laborUsagePct != null && laborUsagePct >= 80) {
          alerts.push({ variant: "amber", message: "⚠ Labor usage above 80%" });
        }
        if (monthsRemaining != null && monthsRemaining < 2) {
          alerts.push({ variant: "amber", message: "⚠ Cash runway below 2 months" });
        }

        if (alerts.length === 0) return null;
        return (
          <section className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <AlertBanner key={i} variant={a.variant} message={a.message} />
            ))}
          </section>
        );
      })()}

      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <OverviewStat label="Total Budget" value={`$${financial.totalBudget.toLocaleString()}`} />
          <OverviewStat label="Total Revenue" value={`$${actualRevenue.toLocaleString()}`} />
          <OverviewStat label="Total Spent" value={`$${actualCost.toLocaleString()}`} />
          <OverviewStat label="Labor Cost" value={`$${Math.abs(financial.laborCost).toLocaleString()}`} />
          <OverviewStat
            label="Profit"
            value={`${actualProfit >= 0 ? "" : "−"}$${Math.abs(actualProfit).toLocaleString()}`}
            prominent
            negative={actualProfit < 0}
          />
          <OverviewStat label="Margin %" value={`${actualMarginPct.toFixed(1)}%`} negative={actualMarginPct < 0} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Invoiced: <span className="tabular-nums text-foreground">${billingSummary.invoicedTotal.toLocaleString()}</span></span>
          <span>Collected: <span className="tabular-nums text-emerald-600/90 dark:text-emerald-400/90">${billingSummary.paidTotal.toLocaleString()}</span></span>
          <span>AR: <span className="tabular-nums text-foreground">${billingSummary.arBalance.toLocaleString()}</span></span>
        </div>
      </section>

      {(() => {
        const source = sourceFromEstimate;
        const budgetRevenue = source?.snapshotRevenue;
        const breakdown = source?.snapshotBudgetBreakdown;
        const budgetCost =
          source?.snapshotBudgetCost ??
          (breakdown ? breakdown.materials + breakdown.labor + breakdown.vendor + breakdown.other : undefined);
        const hasBudget = budgetRevenue != null && budgetCost != null;
        if (!source || !hasBudget) return null;
        const budgetProfit = budgetRevenue! - budgetCost!;
        const budgetMarginPct = budgetRevenue! > 0 ? (budgetProfit / budgetRevenue!) * 100 : 0;
        const actualRevenue = source?.snapshotRevenue ?? project.budget;
        const actualCost =
          Math.abs(financial.materialCost) +
          Math.abs(financial.laborCost) +
          Math.abs(financial.vendorCost) +
          Math.abs(financial.otherCost);
        const actualProfit = actualRevenue - actualCost;
        const actualMarginPct = actualRevenue > 0 ? (actualProfit / actualRevenue) * 100 : 0;
        const revenueVar = actualRevenue - budgetRevenue!;
        const costVar = actualCost - budgetCost!;
        const profitVar = actualProfit - budgetProfit;
        const marginVar = actualMarginPct - budgetMarginPct;
        return (
          <section>
            <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">Budget vs Actual</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Approved estimate snapshot (v{source.sourceVersion}) as budget baseline vs current financials. Internal use only.
                </p>
              </div>
              <BudgetVsActualSummaryTable
                budgetRevenue={budgetRevenue!}
                budgetCost={budgetCost!}
                budgetProfit={budgetProfit}
                budgetMarginPct={budgetMarginPct}
                actualRevenue={actualRevenue}
                actualCost={actualCost}
                actualProfit={actualProfit}
                actualMarginPct={actualMarginPct}
                revenueVar={revenueVar}
                costVar={costVar}
                profitVar={profitVar}
                marginVar={marginVar}
              />
            </Card>
          </section>
        );
      })()}

      {(() => {
        const source = sourceFromEstimate;
        const budgetLabor = source?.snapshotBudgetBreakdown?.labor;
        if (budgetLabor == null) return null;
        const actualLabor = Math.abs(financial.laborCost);
        const laborVariance = actualLabor - budgetLabor;
        const laborUsagePct = budgetLabor > 0 ? (actualLabor / budgetLabor) * 100 : null;
        const weeklyBurn = actualLabor / 4;
        const remainingBudget = budgetLabor - actualLabor;
        const weeksRemaining = weeklyBurn > 0 ? remainingBudget / weeklyBurn : null;
        let riskLabel: string;
        if (laborUsagePct != null) {
          if (laborUsagePct >= 100) riskLabel = "Over budget";
          else if (laborUsagePct >= 80) riskLabel = "At risk";
          else riskLabel = "On track";
        } else {
          riskLabel = "On track";
        }
        return (
          <section>
            <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">Labor Budget Control</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Snapshot-based labor baseline vs actual. Owner-only.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Budget Labor</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Actual Labor</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60">
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${budgetLabor.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${actualLabor.toLocaleString()}</td>
                      <td
                        className={cn(
                          "py-3 px-4 text-right tabular-nums font-medium",
                          laborVariance > 0 && "text-amber-600/90 dark:text-amber-500/90"
                        )}
                      >
                        {laborVariance >= 0 ? "+" : "−"}${Math.abs(laborVariance).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/20">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Usage %</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Weekly Burn</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Weeks Remaining</th>
                    </tr>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60">
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">
                        {laborUsagePct != null ? `${laborUsagePct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${weeklyBurn.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">
                        {weeksRemaining != null ? weeksRemaining.toFixed(1) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 text-muted-foreground font-medium">Risk Status</td>
                      <td className="py-3 px-4" colSpan={2}>
                        <StatusBadge status={riskLabel} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        );
      })()}

      <CommitmentsSection
        projectId={id}
        actualSpent={actualCost}
        budgetCostBaseline={sourceFromEstimate?.snapshotBudgetCost ?? financial.totalBudget}
      />

      {/* Profit Drilldown: Category variance, top vendors, last 8 cost lines. No crash when no snapshot. */}
      <section>
        <ProfitDrilldownCard
          categorySpend={categorySpend}
          committedSpend={committedSpend}
          budgetBreakdown={drilldownBudget}
          vendorSpend={vendorSpend}
          recentLines={recentCostLines}
        />
      </section>

      {financial != null && (() => {
        const cashIn = financial.incomeTotal ?? 0;
        const cashOut = financial.expenseTotal ?? 0;
        const netCash = cashIn - cashOut;
        const monthlyBurn = cashOut / 3;
        const monthsRemaining = monthlyBurn > 0 ? netCash / monthlyBurn : null;
        let statusLabel: "Negative Cash" | "Low Runway" | "Healthy" = "Healthy";
        if (netCash < 0) statusLabel = "Negative Cash";
        else if (monthsRemaining != null && monthsRemaining < 2) statusLabel = "Low Runway";
        return (
          <section>
            <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">Cash Flow Forecast</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Owner-only. Mock 3-month burn period.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Cash In</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Cash Out</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Net Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60">
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${cashIn.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${cashOut.toLocaleString()}</td>
                      <td className={cn("py-3 px-4 text-right tabular-nums font-medium", netCash < 0 && "text-red-600/90 dark:text-red-400/90")}>
                        {netCash < 0 ? "−" : ""}${Math.abs(netCash).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/20">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Monthly Burn</th>
                      <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Months Remaining</th>
                      <th className="py-3 px-4" />
                    </tr>
                    <tr className="border-b border-zinc-200/40 dark:border-border/60">
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">${monthlyBurn.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-foreground">
                        {monthsRemaining != null ? monthsRemaining.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 px-4" />
                    </tr>
                    <tr>
                      <td className="py-3 px-4 text-muted-foreground font-medium">Status</td>
                      <td className="py-3 px-4" colSpan={2}>
                        <StatusBadge status={statusLabel} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        );
      })()}

      <section>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Cash Flow</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cumulative income and expense by date. Income (blue), Expense (red), Net Cash (green). Mock-only.
            </p>
          </div>
          <div className="mb-6">
            <ProjectCashFlowChart points={cashFlowData.points} className="w-full" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Income</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total Expense</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Net Position</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-200/40 dark:border-border/60">
                  <td className="py-3 px-4 text-right tabular-nums text-foreground text-blue-600/90 dark:text-blue-400/90">
                    ${cashFlowData.totalIncome.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-foreground text-red-600/90 dark:text-red-400/90">
                    ${cashFlowData.totalExpense.toLocaleString()}
                  </td>
                  <td
                    className={cn(
                      "py-3 px-4 text-right tabular-nums font-medium",
                      cashFlowData.netPosition >= 0
                        ? "text-emerald-600/90 dark:text-emerald-400/90"
                        : "text-red-600/90 dark:text-red-400/90"
                    )}
                  >
                    {cashFlowData.netPosition < 0 ? "−" : ""}${Math.abs(cashFlowData.netPosition).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Billing Summary</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Invoiced, paid, and AR balance for this project.</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoiced Total</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Paid Total</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">AR Balance</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Last Payment</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-200/40 dark:border-border/60">
                  <td className="py-3 px-4 text-right tabular-nums text-foreground">${billingSummary.invoicedTotal.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-emerald-600/90 dark:text-emerald-400/90">${billingSummary.paidTotal.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium">${billingSummary.arBalance.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{billingSummary.lastPaymentDate ?? "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Estimate vs Actual</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Compare estimated numbers with actuals.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-4 space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Estimate</p>
              {estimate ? (
                <>
                  <EstimateActualRow label="Revenue" value={`$${estimate.revenue.toLocaleString()}`} />
                  <EstimateActualRow label="Cost" value={`$${estimate.cost.toLocaleString()}`} />
                  <EstimateActualRow label="Profit" value={estimateProfit !== null && estimateProfit < 0 ? `−$${Math.abs(estimateProfit).toLocaleString()}` : `$${(estimateProfit ?? 0).toLocaleString()}`} negative={estimateProfit !== null && estimateProfit < 0} />
                  <EstimateActualRow label="Margin" value={estimateMargin !== null ? `${estimateMargin.toFixed(1)}%` : "—"} negative={estimateMargin !== null && estimateMargin < 0} />
                </>
              ) : (
                <>
                  <EstimateActualRow label="Revenue" value="—" />
                  <EstimateActualRow label="Cost" value="—" />
                  <EstimateActualRow label="Profit" value="—" />
                  <EstimateActualRow label="Margin" value="—" />
                </>
              )}
            </div>
            <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-4 space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Actual</p>
              <EstimateActualRow label="Revenue" value={`$${actualRevenue.toLocaleString()}`} />
              <EstimateActualRow label="Cost" value={`$${actualCost.toLocaleString()}`} />
              <EstimateActualRow label="Profit" value={`${actualProfit >= 0 ? "" : "−"}$${Math.abs(actualProfit).toLocaleString()}`} negative={actualProfit < 0} />
              <EstimateActualRow label="Margin" value={`${actualMarginPct.toFixed(1)}%`} negative={actualMarginPct < 0} />
            </div>
            <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-4 space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Variance</p>
              {revenueVariance !== null ? (
                <EstimateActualRow label="Revenue" value={`${revenueVariance >= 0 ? "+" : "−"}$${Math.abs(revenueVariance).toLocaleString()}`} negative={revenueVariance < 0} />
              ) : (
                <EstimateActualRow label="Revenue" value="—" />
              )}
              {costVariance !== null ? (
                <EstimateActualRow label="Cost" value={`${costVariance >= 0 ? "+" : "−"}$${Math.abs(costVariance).toLocaleString()}`} negative={costVariance > 0} />
              ) : (
                <EstimateActualRow label="Cost" value="—" />
              )}
              {profitVariance !== null ? (
                <EstimateActualRow label="Profit" value={`${profitVariance >= 0 ? "+" : "−"}$${Math.abs(profitVariance).toLocaleString()}`} negative={profitVariance < 0} />
              ) : (
                <EstimateActualRow label="Profit" value="—" />
              )}
              {marginVariance !== null ? (
                <EstimateActualRow label="Margin" value={`${marginVariance >= 0 ? "+" : "−"}${Math.abs(marginVariance).toFixed(1)}%`} negative={marginVariance < 0} />
              ) : (
                <EstimateActualRow label="Margin" value="—" />
              )}
            </div>
          </div>
        </Card>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Cost Breakdown Variance</h3>
          <div className="overflow-x-auto rounded-2xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Estimate</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Actual</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Variance</th>
                </tr>
              </thead>
              <tbody>
                <CostBreakdownRow
                  category="Materials"
                  estimate={estimate?.materialsCost}
                  actual={Math.abs(financial.materialCost)}
                />
                <CostBreakdownRow
                  category="Labor"
                  estimate={estimate?.laborCost}
                  actual={Math.abs(financial.laborCost)}
                />
                <CostBreakdownRow
                  category="Vendor"
                  estimate={estimate?.vendorCost}
                  actual={Math.abs(financial.vendorCost)}
                />
                <CostBreakdownRow
                  category="Other"
                  estimate={estimate?.otherCost}
                  actual={Math.abs(financial.otherCost)}
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Financial Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <BreakdownRow label="Materials" value={financial.materialCost} />
              <BreakdownRow label="Labor" value={financial.laborCost} />
              <BreakdownRow label="Vendor" value={financial.vendorCost} />
              <BreakdownRow label="Other" value={financial.otherCost} />
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Budget & Risk</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <BreakdownRow label="Remaining Budget" value={financial.remainingBudget} />
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Budget Usage</span>
                <span className="tabular-nums font-medium text-foreground">
                  {financial.budgetUsagePct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-muted-foreground">Risk Status</span>
                <StatusBadge status={financial.riskStatus} />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Labor Control
        </h2>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Hours</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Rate</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total Paid</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Advance</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Remaining</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {labor.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-zinc-50/30 dark:hover:bg-muted/5">
                    <td className="py-3 px-4 font-medium text-foreground">{row.worker}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">{row.hours}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">${row.rate}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">${row.totalPaid.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">${row.advance.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">${row.remaining.toLocaleString()}</td>
                    <td className="py-3 px-4"><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {expenseLines.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Recent expense lines
          </h2>
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Vendor</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Memo</th>
                    <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseLines.map(({ expenseId, date, vendorName, line }) => (
                    <tr key={line.id} className="border-b border-zinc-100/50 dark:border-border/30">
                      <td className="py-3 px-4 tabular-nums text-foreground">{date}</td>
                      <td className="py-3 px-4">
                        <Link href={`/financial/expenses/${expenseId}`} className="text-primary hover:underline">
                          {vendorName}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{line.category}</td>
                      <td className="py-3 px-4 text-muted-foreground">{line.memo ?? "—"}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                        −${line.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Transactions
        </h2>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <TransactionsTable data={transactions} />
        </Card>
      </section>
    </div>
  );
}

function BudgetVsActualSummaryTable({
  budgetRevenue,
  budgetCost,
  budgetProfit,
  budgetMarginPct,
  actualRevenue,
  actualCost,
  actualProfit,
  actualMarginPct,
  revenueVar,
  costVar,
  profitVar,
  marginVar,
}: {
  budgetRevenue: number;
  budgetCost: number;
  budgetProfit: number;
  budgetMarginPct: number;
  actualRevenue: number;
  actualCost: number;
  actualProfit: number;
  actualMarginPct: number;
  revenueVar: number;
  costVar: number;
  profitVar: number;
  marginVar: number;
}) {
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const varianceCell = (value: number, isCost: boolean, redWhenNegative: boolean, isPercent: boolean) => {
    const overCost = isCost && value > 0;
    const under = redWhenNegative && value < 0;
    const className = cn(
      "py-3 px-4 text-right tabular-nums font-medium",
      overCost && "text-amber-600/90 dark:text-amber-500/90",
      under && "text-red-600/90 dark:text-red-400/90",
      !overCost && !under && "text-foreground"
    );
    const prefix = value >= 0 ? "+" : "−";
    const display = isPercent ? `${prefix}${Math.abs(value).toFixed(1)}%` : `${prefix}${fmt(Math.abs(value))}`;
    return <td className={className}>{display}</td>;
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
            <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Metric</th>
            <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Budget</th>
            <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Actual</th>
            <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Variance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-100/50 dark:border-border/30">
            <td className="py-3 px-4 font-medium text-foreground">Revenue</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmt(budgetRevenue)}</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmt(actualRevenue)}</td>
            {varianceCell(revenueVar, false, false, false)}
          </tr>
          <tr className="border-b border-zinc-100/50 dark:border-border/30">
            <td className="py-3 px-4 font-medium text-foreground">Cost</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmt(budgetCost)}</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmt(actualCost)}</td>
            {varianceCell(costVar, true, false, false)}
          </tr>
          <tr className="border-b border-zinc-100/50 dark:border-border/30">
            <td className="py-3 px-4 font-medium text-foreground">Profit</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{budgetProfit < 0 ? "−" : ""}{fmt(Math.abs(budgetProfit))}</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{actualProfit < 0 ? "−" : ""}{fmt(Math.abs(actualProfit))}</td>
            {varianceCell(profitVar, false, true, false)}
          </tr>
          <tr className="border-b border-zinc-100/50 dark:border-border/30">
            <td className="py-3 px-4 font-medium text-foreground">Margin %</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmtPct(budgetMarginPct)}</td>
            <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmtPct(actualMarginPct)}</td>
            {varianceCell(marginVar, false, true, true)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  prominent,
  negative,
}: {
  label: string;
  value: string;
  prominent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 tabular-nums",
          prominent ? "text-xl font-semibold" : "text-lg font-medium",
          negative ? "text-red-600/80 dark:text-red-400/80" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EstimateActualRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium text-right",
          negative ? "text-amber-600/80 dark:text-amber-500/80" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CostBreakdownRow({
  category,
  estimate,
  actual,
}: {
  category: string;
  estimate: number | undefined;
  actual: number;
}) {
  const hasEstimate = estimate != null;
  const variance = hasEstimate ? actual - estimate : null;
  return (
    <tr className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-zinc-50/30 dark:hover:bg-muted/5">
      <td className="py-3 px-4 font-medium text-foreground">{category}</td>
      <td className="py-3 px-4 text-right tabular-nums text-foreground">
        {hasEstimate ? `$${estimate.toLocaleString()}` : "—"}
      </td>
      <td className="py-3 px-4 text-right tabular-nums text-foreground">
        ${actual.toLocaleString()}
      </td>
      <td
        className={cn(
          "py-3 px-4 text-right tabular-nums font-medium",
          variance != null && variance > 0 ? "text-amber-600/80 dark:text-amber-500/80" : "text-foreground"
        )}
      >
        {variance != null ? `${variance >= 0 ? "+" : "−"}$${Math.abs(variance).toLocaleString()}` : "—"}
      </td>
    </tr>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  const isNegative = value < 0;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          isNegative ? "text-red-600/80 dark:text-red-400/80" : "text-foreground"
        )}
      >
        {isNegative ? "−" : ""}${Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}

function TransactionsTable({ data }: { data: ProjectTransactionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200/40 dark:border-border/60">
            <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
            <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
            <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Name</th>
            <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
            <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.id}
              className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-zinc-50/30 dark:hover:bg-muted/5"
            >
              <td className="py-3 px-4 text-foreground">{row.date}</td>
              <td className="py-3 px-4 text-muted-foreground capitalize">{row.type}</td>
              <td className="py-3 px-4 font-medium text-foreground">{row.name}</td>
              <td
                className={cn(
                  "py-3 px-4 text-right tabular-nums",
                  row.amount >= 0 ? "text-foreground" : "text-red-600/80 dark:text-red-400/80"
                )}
              >
                {row.amount >= 0 ? "" : "−"}${Math.abs(row.amount).toLocaleString()}
              </td>
              <td className="py-3 px-4 text-muted-foreground">{row.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
