"use client";

import * as React from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type RecentExpenseLineRow = {
  id: string;
  expenseId: string;
  date: string;
  vendorName: string;
  category: string;
  memo: string | null;
  amount: number;
};

export function RecentExpenseLines({
  rows,
}: {
  rows: RecentExpenseLineRow[];
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<RecentExpenseLineRow | null>(null);

  const openRow = (row: RecentExpenseLineRow) => {
    setSelected(row);
    setOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
              <th className="py-2 px-4 text-left table-head-label">Date</th>
              <th className="py-2 px-4 text-left table-head-label">Vendor</th>
              <th className="py-2 px-4 text-left table-head-label">Category</th>
              <th className="py-2 px-4 text-left table-head-label">Memo</th>
              <th className="py-2 px-4 text-right table-head-label">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-b border-zinc-100/50 dark:border-border/30">
                <td colSpan={5} className="py-10 px-4 text-center text-muted-foreground">
                  No expense lines.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="table-row-compact border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
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
                  <td className="py-2 px-4 tabular-nums text-foreground">{row.date}</td>
                  <td className="py-2 px-4 font-medium text-foreground">{row.vendorName}</td>
                  <td className="py-2 px-4 text-muted-foreground">{row.category}</td>
                  <td className="py-2 px-4 text-muted-foreground">{row.memo ?? "—"}</td>
                  <td className={cn("py-2 px-4 num font-medium", row.amount > 0 ? "text-red-600/90 dark:text-red-400/90" : "text-foreground")}>
                    −${Math.abs(row.amount).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle>Expense line</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Vendor</div>
                <div className="font-medium text-foreground">{selected.vendorName}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Date</div>
                  <div className="tabular-nums text-foreground">{selected.date}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Amount</div>
                  <div className="tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                    −${Math.abs(selected.amount).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Category</div>
                <div className="text-foreground">{selected.category}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Memo</div>
                <div className="text-foreground">{selected.memo ?? "—"}</div>
              </div>

              <div className="pt-2 border-t border-zinc-200/70 dark:border-border">
                <Link href={`/financial/expenses/${selected.expenseId}`} className="text-sm text-muted-foreground hover:text-foreground">
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

