"use client";

import * as React from "react";
import Link from "next/link";
import { EmptyState, NeoAmount, NeoMobileCard, NeoTable } from "@/components/base";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
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
      <EmptyState
        className="px-4 py-8"
        title={emptyMessage}
        description={
          hint ??
          "Project-scoped costs will appear here as expenses and related lines are recorded."
        }
        action={
          <div className="flex flex-col items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/financial/expenses/new">Add expense</Link>
            </Button>
            <Link
              href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
              className="text-hh-status font-medium text-[var(--hh-text-secondary)] underline-offset-2 hover:text-[var(--hh-text-primary)] hover:underline"
            >
              Open expenses for this project
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <>
      {hint ? (
        <p className="mb-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-hh-metadata leading-snug text-[var(--hh-text-secondary)]">
          {hint}
        </p>
      ) : null}
      <div className="grid gap-2 xl:hidden">
        {rows.map((row) => (
          <NeoMobileCard key={row.lineId} className="overflow-hidden p-0">
            <div className="flex min-h-[56px] w-full flex-col gap-1 px-3 py-3 text-left">
              <div className="break-words text-hh-table-cell font-medium text-[var(--hh-text-primary)]">
                {vendorDescription(row)}
              </div>
              <dl className="mt-2 grid gap-2 text-hh-metadata">
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium uppercase text-[var(--hh-text-tertiary)]">Date</dt>
                  <dd className="hh-fin text-right tabular-nums text-[var(--hh-text-primary)]">
                    {row.date}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium uppercase text-[var(--hh-text-tertiary)]">Category</dt>
                  <dd className="min-w-0 break-words text-right text-[var(--hh-text-primary)]">
                    {row.category}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium uppercase text-[var(--hh-text-tertiary)]">
                    Source / Payment
                  </dt>
                  <dd className="min-w-0 break-words text-right text-[var(--hh-text-primary)]">
                    {row.paymentSource || "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-medium uppercase text-[var(--hh-text-tertiary)]">Amount</dt>
                  <dd className="text-right">
                    <NeoAmount tone="expense" className="text-hh-table-cell">
                      −${Math.abs(row.amount).toLocaleString()}
                    </NeoAmount>
                  </dd>
                </div>
              </dl>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 min-h-[44px] w-full touch-manipulation"
                onClick={() => openRow(row)}
              >
                View cost line
                <span className="sr-only"> for {vendorDescription(row)}</span>
              </Button>
            </div>
          </NeoMobileCard>
        ))}
      </div>

      <NeoTable className="hidden xl:block" tableClassName="min-w-[640px] text-hh-body">
        <thead>
          <tr>
            <th className={tableRawThClass}>Date</th>
            <th className={tableRawThClass}>Vendor / Description</th>
            <th className={tableRawThClass}>Category</th>
            <th className={tableRawThClass}>Source / Payment</th>
            <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child>td]:border-b-0">
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
              <td className={cn(tableRawTdClass, "hh-fin text-hh-table-cell tabular-nums")}>
                {row.date}
              </td>
              <td className={cn(tableRawTdClass, "text-hh-table-cell font-medium")}>
                {vendorDescription(row)}
              </td>
              <td
                className={cn(
                  tableRawTdClass,
                  "text-hh-table-cell text-[var(--hh-text-secondary)]"
                )}
              >
                {row.category}
              </td>
              <td
                className={cn(
                  tableRawTdClass,
                  "text-hh-table-cell text-[var(--hh-text-secondary)]"
                )}
              >
                {row.paymentSource || "—"}
              </td>
              <td
                className={cn(
                  tableRawTdClass,
                  "text-right hh-fin text-hh-table-cell font-medium tabular-nums"
                )}
              >
                <NeoAmount tone="expense">−${Math.abs(row.amount).toLocaleString()}</NeoAmount>
              </td>
            </tr>
          ))}
        </tbody>
      </NeoTable>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0 text-[var(--hh-text-primary)] sm:max-w-[480px] sm:p-6"
        >
          <SheetHeader className="border-b border-[var(--hh-border)] px-4 py-3 sm:border-0 sm:px-0 sm:py-0">
            <SheetTitle className="text-hh-body">Cost line</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-hh-body sm:px-0 sm:pb-0">
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Vendor / description
                </div>
                <div className="font-medium text-[var(--hh-text-primary)]">
                  {vendorDescription(selected)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Date
                  </div>
                  <div className="tabular-nums text-[var(--hh-text-primary)]">{selected.date}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Amount
                  </div>
                  <NeoAmount tone="expense" className="block">
                    −${Math.abs(selected.amount).toLocaleString()}
                  </NeoAmount>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Category
                </div>
                <div className="text-[var(--hh-text-primary)]">{selected.category}</div>
              </div>
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Source / payment
                </div>
                <div className="text-[var(--hh-text-primary)]">{selected.paymentSource || "—"}</div>
              </div>

              <div className="border-t border-[var(--hh-border)] pt-2">
                <Link
                  href={`/financial/expenses/${selected.expenseId}`}
                  className="inline-flex min-h-[44px] items-center text-hh-body font-medium text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
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
