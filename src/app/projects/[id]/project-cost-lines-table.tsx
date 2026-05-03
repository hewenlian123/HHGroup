"use client";

import * as React from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { listTableRowClassName } from "@/lib/list-table-interaction";
import { cn } from "@/lib/utils";
import type { ProjectCostTableRow } from "@/lib/project-cost-dashboard";

function vendorDescription(row: ProjectCostTableRow): string {
  const parts = [row.vendorName, row.memo].filter((x) => x != null && String(x).trim() !== "");
  return parts.length ? parts.join(" · ") : "—";
}

export function ProjectCostLinesTable({
  rows,
  emptyMessage = "No project costs yet",
  projectId,
  hint,
}: {
  rows: ProjectCostTableRow[];
  emptyMessage?: string;
  /** Used only when empty state links back to project-scoped expenses. */
  projectId: string;
  /** Optional note above the table (e.g. bucket filter or labor/sub explanation). */
  hint?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ProjectCostTableRow | null>(null);

  const openRow = React.useCallback((row: ProjectCostTableRow) => {
    setSelected(row);
    setOpen(true);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="rounded-sm border border-border/60 bg-white px-4 py-8 text-center">
        {hint ? (
          <p className="mb-3 text-left text-[12px] leading-snug text-muted-foreground">{hint}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href={`/financial/expenses/new`}>Add expense</Link>
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <Link
            href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open expenses for this project
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {hint ? <p className="mb-2 text-[12px] leading-snug text-muted-foreground">{hint}</p> : null}
      <div className="md:hidden divide-y divide-border/60 overflow-hidden rounded-sm border border-border/60 bg-white">
        {rows.map((row) => (
          <button
            key={row.lineId}
            type="button"
            className="flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/20 active:bg-muted/35 min-h-[52px] touch-manipulation"
            onClick={() => openRow(row)}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                {row.date}
              </span>
              <span className="font-mono text-[13px] font-medium tabular-nums text-red-600/90 dark:text-red-400/90">
                −${Math.abs(row.amount).toLocaleString()}
              </span>
            </div>
            <div className="text-[13px] font-medium text-foreground">{vendorDescription(row)}</div>
            <div className="flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
              <span>{row.category}</span>
              <span aria-hidden>·</span>
              <span>{row.paymentSource || "—"}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-sm border border-border/60 bg-white md:block">
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Date
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Vendor / Description
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Category
                  </th>
                  <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Source / Payment
                  </th>
                  <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.lineId}
                    className={listTableRowClassName}
                    onClick={() => openRow(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open cost line ${row.vendorName}`}
                  >
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums text-foreground">
                      {row.date}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium text-foreground">
                      {vendorDescription(row)}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {row.category}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {row.paymentSource || "—"}
                    </td>
                    <td
                      className={cn(
                        "h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] font-medium tabular-nums",
                        row.amount > 0 ? "text-red-600/90 dark:text-red-400/90" : "text-foreground"
                      )}
                    >
                      −${Math.abs(row.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-border/60 p-0 sm:max-w-[480px] sm:p-6"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3 sm:border-0 sm:px-0 sm:py-0">
            <SheetTitle className="text-base">Cost line</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-sm sm:px-0 sm:pb-0">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Vendor / description
                </div>
                <div className="font-medium text-foreground">{vendorDescription(selected)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Date
                  </div>
                  <div className="tabular-nums text-foreground">{selected.date}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Amount
                  </div>
                  <div className="font-medium tabular-nums text-red-600/90 dark:text-red-400/90">
                    −${Math.abs(selected.amount).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Category
                </div>
                <div className="text-foreground">{selected.category}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Source / payment
                </div>
                <div className="text-foreground">{selected.paymentSource || "—"}</div>
              </div>

              <div className="border-t border-zinc-200/70 pt-2 dark:border-border">
                <Link
                  href={`/financial/expenses/${selected.expenseId}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Open expense
                </Link>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
