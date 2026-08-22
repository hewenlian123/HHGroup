"use client";

import * as React from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { listTableRowClassName } from "@/lib/list-table-interaction";

export type RecentExpenseLineRow = {
  id: string;
  expenseId: string;
  date: string;
  vendorName: string;
  category: string;
  memo: string | null;
  amount: number;
};

export function RecentExpenseLines({ rows }: { rows: RecentExpenseLineRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<RecentExpenseLineRow | null>(null);

  const openRow = (row: RecentExpenseLineRow) => {
    setSelected(row);
    setOpen(true);
  };

  return (
    <>
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full text-hh-body">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Date
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Vendor
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Category
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Memo
                </th>
                <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-[var(--hh-text-secondary)]"
                  >
                    No expense lines.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
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
                    aria-label={`Open expense line ${row.vendorName}`}
                  >
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums text-[var(--hh-text-primary)]">
                      {row.date}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium text-[var(--hh-text-primary)]">
                      {row.vendorName}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                      {row.category}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                      {row.memo ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell font-medium tabular-nums",
                        row.amount > 0 ? "text-[var(--hh-danger)]" : "text-[var(--hh-text-primary)]"
                      )}
                    >
                      −${Math.abs(row.amount).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>Expense line</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-hh-body">
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-secondary)]">
                  Vendor
                </div>
                <div className="font-medium text-[var(--hh-text-primary)]">
                  {selected.vendorName}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-secondary)]">
                    Date
                  </div>
                  <div className="tabular-nums text-[var(--hh-text-primary)]">{selected.date}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-secondary)]">
                    Amount
                  </div>
                  <div className="tabular-nums font-medium text-[var(--hh-danger)]">
                    −${Math.abs(selected.amount).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-secondary)]">
                  Category
                </div>
                <div className="text-[var(--hh-text-primary)]">{selected.category}</div>
              </div>
              <div className="space-y-1">
                <div className="text-hh-metadata uppercase tracking-normal text-[var(--hh-text-secondary)]">
                  Memo
                </div>
                <div className="text-[var(--hh-text-primary)]">{selected.memo ?? "—"}</div>
              </div>

              <div className="pt-2 border-t border-[var(--hh-border)] ">
                <Link
                  href={`/financial/expenses/${selected.expenseId}`}
                  className="text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
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
