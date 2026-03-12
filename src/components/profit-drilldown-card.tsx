"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DrilldownBucket = "Materials" | "Labor" | "Vendor" | "Other";

export interface CategorySpend {
  materials: number;
  labor: number;
  vendor: number;
  other: number;
}

export interface SnapshotBreakdown {
  materials: number;
  labor: number;
  vendor: number;
  other: number;
}

export interface VendorSpendRow {
  vendorName: string;
  total: number;
  txCount: number;
  lastDate: string;
}

export interface RecentLineRow {
  expenseId: string;
  date: string;
  vendorName: string;
  category: string;
  amount: number;
  memo: string | null;
}

interface ProfitDrilldownCardProps {
  categorySpend: CategorySpend;
  committedSpend: CategorySpend;
  budgetBreakdown: SnapshotBreakdown | null;
  vendorSpend: VendorSpendRow[];
  recentLines: RecentLineRow[];
}

const BUCKETS: DrilldownBucket[] = ["Materials", "Labor", "Vendor", "Other"];

export function ProfitDrilldownCard({
  categorySpend,
  committedSpend,
  budgetBreakdown,
  vendorSpend,
  recentLines,
}: ProfitDrilldownCardProps) {
  const [tab, setTab] = React.useState<"category" | "vendors" | "recent" | "committed">("category");
  const [vendorFilter, setVendorFilter] = React.useState<string | null>(null);

  const filteredRecent = React.useMemo(() => {
    if (!vendorFilter) return recentLines;
    return recentLines.filter((r) => r.vendorName === vendorFilter);
  }, [recentLines, vendorFilter]);

  const hasBudget = budgetBreakdown != null;

  return (
    <Card className="overflow-hidden p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Profit Drilldown</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Category variance, top vendors, and recent costs. Internal only.</p>
      </div>
      <div className="flex gap-2 mb-4 border-b border-zinc-200/60 dark:border-border pb-2">
        {(
          [
            { id: "category" as const, label: "Category Variance" },
            { id: "vendors" as const, label: "Vendors" },
            { id: "recent" as const, label: "Recent Costs" },
            { id: "committed" as const, label: "Committed" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "category" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Budget</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Actual</th>
                {hasBudget && (
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Variance</th>
                )}
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map((bucket) => {
                const actual = categorySpend[bucket.toLowerCase() as keyof CategorySpend];
                const budget = hasBudget ? budgetBreakdown[bucket.toLowerCase() as keyof SnapshotBreakdown] : null;
                const variance = budget != null ? actual - budget : null;
                return (
                  <tr key={bucket} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 font-medium text-foreground">{bucket}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">
                      {hasBudget && budget != null ? `$${budget.toLocaleString()}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">${actual.toLocaleString()}</td>
                    {hasBudget && (
                      <td
                        className={cn(
                          "py-3 px-4 text-right tabular-nums font-medium",
                          variance != null && variance > 0 && "text-amber-600/90 dark:text-amber-500/90"
                        )}
                      >
                        {variance != null ? `${variance >= 0 ? "+" : "−"}$${Math.abs(variance).toLocaleString()}` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "vendors" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Vendor</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">#Tx</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Last Date</th>
              </tr>
            </thead>
            <tbody>
              {vendorSpend.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No vendor spend for this project
                  </td>
                </tr>
              ) : (
                vendorSpend.map((row) => (
                  <tr
                    key={row.vendorName}
                    className={cn(
                      "border-b border-zinc-100/50 dark:border-border/30",
                      vendorFilter === row.vendorName && "bg-primary/10"
                    )}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => setVendorFilter(vendorFilter === row.vendorName ? null : row.vendorName)}
                        className="font-medium text-foreground hover:text-primary underline-offset-2 hover:underline"
                      >
                        {row.vendorName}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground font-medium text-red-600/90 dark:text-red-400/90">
                      −${row.total.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{row.txCount}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{row.lastDate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "recent" && (
        <>
          {vendorFilter && (
            <p className="text-sm text-muted-foreground mb-2">
              Filtered by vendor: <strong className="text-foreground">{vendorFilter}</strong>{" "}
              <button
                type="button"
                onClick={() => setVendorFilter(null)}
                className="text-primary hover:underline"
              >
                Clear
              </button>
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Vendor</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Memo</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No recent cost lines
                    </td>
                  </tr>
                ) : (
                  filteredRecent.map((row, idx) => (
                    <tr key={`${row.expenseId}-${row.date}-${idx}`} className="border-b border-zinc-100/50 dark:border-border/30">
                      <td className="py-3 px-4 tabular-nums text-foreground">{row.date}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{row.vendorName}</td>
                      <td className="py-3 px-4 text-muted-foreground">{row.category}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                        −${row.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate" title={row.memo ?? undefined}>
                        {row.memo ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/financial/expenses/${row.expenseId}`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          View Expense
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "committed" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Committed</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Actual</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Budget</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Variance</th>
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map((bucket) => {
                const committed = committedSpend[bucket.toLowerCase() as keyof CategorySpend] ?? 0;
                const actual = categorySpend[bucket.toLowerCase() as keyof CategorySpend] ?? 0;
                const total = committed + actual;
                const budget = budgetBreakdown ? budgetBreakdown[bucket.toLowerCase() as keyof SnapshotBreakdown] : 0;
                const variance = budget - total;
                return (
                  <tr key={bucket} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 font-medium text-foreground">{bucket}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-amber-700 dark:text-amber-400">${committed.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">${actual.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium text-foreground">${total.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">{budgetBreakdown ? `$${budget.toLocaleString()}` : "—"}</td>
                    <td
                      className={cn(
                        "py-3 px-4 text-right tabular-nums font-medium",
                        variance < 0 && "text-amber-600/90 dark:text-amber-500/90"
                      )}
                    >
                      {budgetBreakdown ? `${variance >= 0 ? "+" : "−"}$${Math.abs(variance).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const committedTotal =
                  (committedSpend.materials ?? 0) +
                  (committedSpend.labor ?? 0) +
                  (committedSpend.vendor ?? 0) +
                  (committedSpend.other ?? 0);
                const actualTotal =
                  (categorySpend.materials ?? 0) +
                  (categorySpend.labor ?? 0) +
                  (categorySpend.vendor ?? 0) +
                  (categorySpend.other ?? 0);
                const totalCost = committedTotal + actualTotal;
                const budgetTotal = budgetBreakdown
                  ? (budgetBreakdown.materials ?? 0) +
                    (budgetBreakdown.labor ?? 0) +
                    (budgetBreakdown.vendor ?? 0) +
                    (budgetBreakdown.other ?? 0)
                  : 0;
                const varianceTotal = budgetTotal - totalCost;
                return (
                  <tr className="bg-muted/20">
                    <td className="py-3 px-4 font-semibold text-foreground">Total</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">${committedTotal.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-foreground">${actualTotal.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-foreground">${totalCost.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-foreground">{budgetBreakdown ? `$${budgetTotal.toLocaleString()}` : "—"}</td>
                    <td
                      className={cn(
                        "py-3 px-4 text-right tabular-nums font-semibold",
                        varianceTotal < 0 && "text-amber-600/90 dark:text-amber-500/90"
                      )}
                    >
                      {budgetBreakdown ? `${varianceTotal >= 0 ? "+" : "−"}$${Math.abs(varianceTotal).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
