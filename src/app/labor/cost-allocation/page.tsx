"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTableAmountCellClassName } from "@/lib/list-table-interaction";
import { getProjects, getProjectCostCodeSummary, getProjectForecastSummary } from "@/lib/data";
import { costCodeMaster } from "@/lib/mock-data";
import type { ProjectCostCodeSummaryItem } from "@/lib/data";

type CostRow = {
  code: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
  pct: number;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

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
      header={
        <PageHeader
          title="Labor Cost Allocation"
          description="Cost codes report — shows budget vs actual by cost code. Actual costs are aggregated from Labor, Expenses, and Subcontract Bills."
          actions={
            <Link href="/labor" className="text-sm text-muted-foreground hover:text-foreground">
              Labor
            </Link>
          }
        />
      }
    >
      <div className="space-y-6">
        <FilterBar className="flex-col items-stretch sm:items-stretch">
          <div className="w-full max-w-md space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Project
            </p>
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
          <div className="rounded-lg border border-border/60 bg-background px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <SectionHeader label="Summary" />
        <div className="grid grid-cols-3 gap-x-8 gap-y-2 py-3">
          <div className="flex justify-between items-baseline border-b border-gray-300 pb-1.5 dark:border-border/40">
            <span className="text-sm text-muted-foreground">Revenue</span>
            <span className="tabular-nums text-right font-medium">${fmtUsd(revenue)}</span>
          </div>
          <div className="flex justify-between items-baseline border-b border-gray-300 pb-1.5 dark:border-border/40">
            <span className="text-sm text-muted-foreground">Profit</span>
            <span
              className={cn(
                "tabular-nums text-right font-medium",
                profitPositive
                  ? "text-hh-profit-positive dark:text-hh-profit-positive"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(profit))}
            </span>
          </div>
          <div className="flex justify-between items-baseline border-b border-gray-300 pb-1.5 dark:border-border/40">
            <span className="text-sm text-muted-foreground">Margin %</span>
            <span className="tabular-nums text-right font-medium">{fmtPct(marginPct)}</span>
          </div>
        </div>
        <SectionHeader label="Cost by code" />
        <div className="overflow-x-auto border-t border-gray-300 dark:border-border/60">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 bg-white dark:border-border/60 dark:bg-muted/30">
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
                  Variance
                </th>
                <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-gray-300/80 dark:border-border/40">
                  <td className="py-1.5 px-3">
                    <span className="font-medium tabular-nums">{r.code}</span>
                    <span className="text-muted-foreground ml-2">{r.name}</span>
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    ${fmtUsd(r.budget)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    ${fmtUsd(r.actual)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums font-medium",
                      listTableAmountCellClassName,
                      r.actual > r.budget && "text-red-600 dark:text-red-400",
                      r.actual <= r.budget && "text-hh-profit-positive dark:text-hh-profit-positive"
                    )}
                  >
                    {r.variance >= 0 ? "" : "−"}${fmtUsd(Math.abs(r.variance))}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 px-3 text-right tabular-nums",
                      listTableAmountCellClassName
                    )}
                  >
                    {fmtPct(r.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300 font-medium dark:border-border/60">
                <td className="py-2 px-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(totals.budget)}</td>
                <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(totals.actual)}</td>
                <td
                  className={cn(
                    "py-2 px-3 text-right tabular-nums",
                    overBudget && "text-red-600 dark:text-red-400",
                    !overBudget && "text-hh-profit-positive dark:text-hh-profit-positive"
                  )}
                >
                  {totalVariance >= 0 ? "" : "−"}${fmtUsd(Math.abs(totalVariance))}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {totals.budget !== 0 ? fmtPct((totals.actual / totals.budget) * 100) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
