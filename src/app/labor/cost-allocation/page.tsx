"use client";

import * as React from "react";
import Link from "next/link";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
} from "@/components/base";
import { cn } from "@/lib/utils";
import { getProjects, getProjectCostCodeSummary, getProjectForecastSummary } from "@/lib/data";
import { costCodeMaster } from "@/lib/mock-data";
import type { ProjectCostCodeSummaryItem } from "@/lib/data";

type CostRow = { code: string; name: string; budget: number; actual: number; variance: number; pct: number };

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

  React.useEffect(() => {
    let cancelled = false;
    getProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list.map((p) => ({ id: p.id, name: p.name ?? p.id })));
        if (list.length > 0 && !projectId) setProjectId(list[0].id);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  React.useEffect(() => {
    if (!projectId) {
      setRows([]);
      setRevenue(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getProjectCostCodeSummary(projectId), getProjectForecastSummary(projectId)])
      .then(([summaryRows, forecast]) => {
        if (cancelled) return;
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
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load project data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
      <SectionHeader
        label="Select Project"
        action={
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-8 min-w-[200px] rounded border border-input bg-transparent px-2 text-sm"
            disabled={loading}
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
          </select>
        }
      />
      <Divider />
      {error ? (
        <p className="text-sm text-destructive py-2">{error}</p>
      ) : null}
      <SectionHeader label="Summary" />
      <Divider />
      <div className="grid grid-cols-3 gap-x-8 gap-y-2 py-3">
        <div className="flex justify-between items-baseline border-b border-border/40 pb-1.5">
          <span className="text-sm text-muted-foreground">Revenue</span>
          <span className="tabular-nums text-right font-medium">${fmtUsd(revenue)}</span>
        </div>
        <div className="flex justify-between items-baseline border-b border-border/40 pb-1.5">
          <span className="text-sm text-muted-foreground">Profit</span>
          <span
            className={cn(
              "tabular-nums text-right font-medium",
              profitPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}
          >
            {profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(profit))}
          </span>
        </div>
        <div className="flex justify-between items-baseline border-b border-border/40 pb-1.5">
          <span className="text-sm text-muted-foreground">Margin %</span>
          <span className="tabular-nums text-right font-medium">{fmtPct(marginPct)}</span>
        </div>
      </div>
      <Divider />
      <SectionHeader label="Cost by code" />
      <Divider />
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
                Variance
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-border/40">
                <td className="py-1.5 px-3">
                  <span className="font-medium tabular-nums">{r.code}</span>
                  <span className="text-muted-foreground ml-2">{r.name}</span>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  ${fmtUsd(r.budget)}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  ${fmtUsd(r.actual)}
                </td>
                <td
                  className={cn(
                    "py-1.5 px-3 text-right tabular-nums font-medium",
                    r.actual > r.budget && "text-red-600 dark:text-red-400",
                    r.actual <= r.budget && "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {r.variance >= 0 ? "" : "−"}${fmtUsd(Math.abs(r.variance))}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  {fmtPct(r.pct)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-medium">
              <td className="py-2 px-3">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(totals.budget)}</td>
              <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(totals.actual)}</td>
              <td
                className={cn(
                  "py-2 px-3 text-right tabular-nums",
                  overBudget && "text-red-600 dark:text-red-400",
                  !overBudget && "text-emerald-600 dark:text-emerald-400"
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
    </PageLayout>
  );
}
