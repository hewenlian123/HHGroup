"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
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
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

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
        <section>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Deposit Date
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Project
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Invoice #
                </TableHead>
                <TableHead className="text-right font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Amount
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Payment Method
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Account
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium font-mono tabular-nums text-foreground">
                    {row.date ?? "—"}
                  </TableCell>
                  <TableCell className="text-foreground">{row.description ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.project_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {row.invoice_no ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-medium text-hh-profit-positive dark:text-hh-profit-positive">
                    {money(row.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.payment_method ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.account ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
