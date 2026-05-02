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
      <div className="rounded-xl border border-border/60 bg-white px-4 py-8 text-center">
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
      <div className="overflow-hidden rounded-xl border border-border/60 bg-white">
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll">
            <table className="w-full text-sm">
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
        <SheetContent side="right" className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>Cost line</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
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
