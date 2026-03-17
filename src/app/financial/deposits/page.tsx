"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDeposits, type DepositWithMeta } from "@/lib/data";
import { EmptyState } from "@/components/empty-state";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DepositsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <DepositsPageInner />
    </React.Suspense>
  );
}

function DepositsPageInner() {
  const [deposits, setDeposits] = React.useState<DepositWithMeta[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const list = await getDeposits();
    setDeposits(list);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [load]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Deposits"
        description="Deposit records created when payments are received. Used for Cash In on the dashboard."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : deposits.length === 0 ? (
        <EmptyState
          title="No deposits yet"
          description="Deposits are created automatically when you receive a payment."
          icon={null}
        />
      ) : (
        <section className="border-b border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Deposit Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Project</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Invoice #</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground tabular-nums">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Payment Method</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Account</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((row) => (
                  <TableRow key={row.id} className="border-b border-border/30">
                    <TableCell className="tabular-nums text-foreground">{row.date ?? "—"}</TableCell>
                    <TableCell className="text-foreground">{row.description ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.project_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.invoice_no ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-600/90 dark:text-emerald-400/90">
                      {money(row.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">{row.account ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
