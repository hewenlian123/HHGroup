"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { listTableAmountCellClassName } from "@/lib/list-table-interaction";
import { getProjects, getProjectCostCodeSummary, getProjectForecastSummary } from "@/lib/data";
import { costCodeMaster } from "@/lib/mock-data";
import type { ProjectCostCodeSummaryItem } from "@/lib/data";
import { sectionCardClass } from "@/components/ui/section-card";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { formatPercent } from "@/lib/formatters";
import { amountClass, TYPO } from "@/lib/typography";

type CostRow = {
  code: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
  pct: number;
};

function codeToName(code: string): string {
  if (!code || code === "—") return "—";
  const found = costCodeMaster.find((c) => c.code === code);
  return found?.name ?? code;
}

export default function LaborCostAllocationPage() {
  const [projectId, setProjectId] = React.useState("");
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = React.useState<CostRow[]>([]);
  const [revenue, setRevenue] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadProjects = React.useCallback(async () => {
    try {
      const list = await getProjects();
      setProjects(list.map((p) => ({ id: p.id, name: p.name ?? p.id })));
      setProjectId((prev) => prev || (list[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = React.useCallback(async () => {
    if (!projectId) {
      setRows([]);
      setRevenue(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryRows, forecast] = await Promise.all([
        getProjectCostCodeSummary(projectId),
        getProjectForecastSummary(projectId),
      ]);
      const mapped: CostRow[] = (summaryRows as ProjectCostCodeSummaryItem[]).map((r) => {
        const budget = r.budget;
        const actual = r.actual;
        const variance = actual - budget;
        const pct = budget !== 0 ? (actual / budget) * 100 : 0;
        return {
          code: r.costCode,
          name: codeToName(r.costCode),
          budget,
          actual,
          variance,
          pct,
        };
      });
      setRows(mapped);
      setRevenue(forecast.revenue ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useOnAppSync(
    React.useCallback(() => {
      void loadProjects();
      void loadReport();
    }, [loadProjects, loadReport]),
    [loadProjects, loadReport]
  );

  const totals = React.useMemo(
    () => ({
      budget: rows.reduce((s, r) => s + r.budget, 0),
      actual: rows.reduce((s, r) => s + r.actual, 0),
    }),
    [rows]
  );
  const totalVariance = totals.actual - totals.budget;
  const overBudget = totalVariance > 0;
  const profit = revenue - totals.actual;
  const marginPct = revenue !== 0 ? (profit / revenue) * 100 : 0;
  const profitPositive = profit >= 0;

  return (
    <PageLayout
      frame="list"
      header={
        <PageHeader
          variant="workspace"
          title="Labor Cost Allocation"
          description="Cost codes report — shows budget vs actual by cost code. Actual costs are aggregated from Labor, Expenses, and Subcontract Bills."
          actions={
            <Link
              href="/labor"
              className="text-sm text-[var(--hh-link)] underline-offset-2 hover:underline"
            >
              Labor
            </Link>
          }
        />
      }
    >
      <div className="space-y-6">
        <FilterBar className="flex-col items-stretch sm:items-stretch">
          <div className="w-full max-w-md space-y-1">
            <p className={TYPO.sectionLabel}>Project</p>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={loading}
              className="min-w-[200px]"
            >
              {projects.length === 0 ? (
                <option value="">—</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </Select>
          </div>
        </FilterBar>
        {error ? (
          <div className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] px-4 py-3 text-sm text-[var(--hh-danger)]">
            {error}
          </div>
        ) : null}
        <SectionHeader label="Summary" />
        <div
          className={cn(
            sectionCardClass,
            "grid grid-cols-3 gap-x-8 gap-y-2 p-4 max-md:grid-cols-1"
          )}
        >
          <div className="flex items-baseline justify-between border-b border-[var(--hh-line)] pb-1.5">
            <span className="text-sm text-[var(--hh-muted)]">Revenue</span>
            <span className={cn("text-right", amountClass("income"))}>
              {formatOverviewMoney(revenue)}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-b border-[var(--hh-line)] pb-1.5">
            <span className="text-sm text-[var(--hh-muted)]">Profit</span>
            <span className={cn("text-right", amountClass(profitPositive ? "income" : "expense"))}>
              {formatOverviewMoney(profit)}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-b border-[var(--hh-line)] pb-1.5">
            <span className="text-sm text-[var(--hh-muted)]">Margin %</span>
            <span className="text-right font-medium tabular-nums">{formatPercent(marginPct)}</span>
          </div>
        </div>
        <SectionHeader label="Cost by code" />
        <div className={cn(sectionCardClass, "overflow-x-auto")}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--hh-line)] bg-[var(--hh-l0-canvas)]">
                <th className={cn("px-3 py-2 text-left", TYPO.tableHeader)}>Cost Code</th>
                <th className={cn("px-3 py-2 text-right", TYPO.tableHeader)}>Budget</th>
                <th className={cn("px-3 py-2 text-right", TYPO.tableHeader)}>Actual</th>
                <th className={cn("px-3 py-2 text-right", TYPO.tableHeader)}>Variance</th>
                <th className={cn("px-3 py-2 text-right", TYPO.tableHeader)}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-[var(--hh-line)]">
                  <td className="px-3 py-1.5">
                    <span className="font-medium tabular-nums">{r.code}</span>
                    <span className="ml-2 text-[var(--hh-muted)]">{r.name}</span>
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    {formatOverviewMoney(r.budget)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    {formatOverviewMoney(r.actual)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums font-medium",
                      listTableAmountCellClassName,
                      r.actual > r.budget && "text-[var(--hh-danger)]",
                      r.actual <= r.budget && "text-[var(--hh-success)]"
                    )}
                  >
                    {formatOverviewMoney(r.variance)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    {formatPercent(r.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--hh-line)] font-medium">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatOverviewMoney(totals.budget)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatOverviewMoney(totals.actual)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    overBudget && "text-[var(--hh-danger)]",
                    !overBudget && "text-[var(--hh-success)]"
                  )}
                >
                  {formatOverviewMoney(totalVariance)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totals.budget !== 0 ? formatPercent((totals.actual / totals.budget) * 100) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
