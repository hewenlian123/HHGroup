"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { getARSummary } from "@/lib/data";
import { Banknote, Receipt, CheckCircle, AlertCircle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

type BankTx = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  status: "unmatched" | "reconciled";
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number): string {
  const formatted = `$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return amount < 0 ? `−${formatted}` : formatted;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

export function FinancialClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [recentUnreconciled, setRecentUnreconciled] = React.useState<BankTx[]>([]);

  const [bankBalance, setBankBalance] = React.useState(0);
  const [systemExpenses, setSystemExpenses] = React.useState(0);
  const [reconciledBankTotal, setReconciledBankTotal] = React.useState(0);
  const [unreconciledBankTotal, setUnreconciledBankTotal] = React.useState(0);
  const [cashDifference, setCashDifference] = React.useState(0);
  const [totalAR, setTotalAR] = React.useState(0);
  const [overdueAR, setOverdueAR] = React.useState(0);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    let reconciledTotal = 0;
    let expTotal = 0;

    const [bankRes, bankRecentRes, expRes, arSummary] = await Promise.all([
      supabase.from("bank_transactions").select("amount,status").limit(10000),
      supabase
        .from("bank_transactions")
        .select("id,txn_date,description,amount,status")
        .eq("status", "unmatched")
        .order("txn_date", { ascending: false })
        .limit(8),
      supabase.from("expenses").select("total").limit(10000),
      getARSummary(),
    ]);

    if (bankRes.error) {
      if (!isMissingTableError(bankRes.error)) setError(bankRes.error.message);
      setBankBalance(0);
      setReconciledBankTotal(0);
      setUnreconciledBankTotal(0);
    } else {
      const rows = (bankRes.data ?? []) as Array<{
        amount: number;
        status: "unmatched" | "reconciled";
      }>;
      const all = rows.reduce((sum, r) => sum + safeNumber(r.amount), 0);
      reconciledTotal = rows.reduce(
        (sum, r) => (r.status === "reconciled" ? sum + safeNumber(r.amount) : sum),
        0
      );
      const unrec = rows.reduce(
        (sum, r) => (r.status === "unmatched" ? sum + safeNumber(r.amount) : sum),
        0
      );
      setBankBalance(all);
      setReconciledBankTotal(reconciledTotal);
      setUnreconciledBankTotal(unrec);
    }

    if (bankRecentRes.error) {
      if (!isMissingTableError(bankRecentRes.error))
        setError((prev) => prev ?? bankRecentRes.error.message);
      setRecentUnreconciled([]);
    } else {
      setRecentUnreconciled((bankRecentRes.data ?? []) as BankTx[]);
    }

    if (expRes.error) {
      if (!isMissingTableError(expRes.error)) setError((prev) => prev ?? expRes.error.message);
      setSystemExpenses(0);
    } else {
      expTotal = (expRes.data ?? []).reduce(
        (sum, r) => sum + safeNumber((r as { total?: number }).total),
        0
      );
      setSystemExpenses(expTotal);
    }

    setTotalAR(arSummary.totalAR);
    setOverdueAR(arSummary.overdueAR);
    setCashDifference(reconciledTotal - expTotal);
    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const kpis = [
    { label: "Bank Balance", value: bankBalance, icon: Banknote },
    { label: "System Expenses", value: systemExpenses, icon: Receipt },
    { label: "Reconciled Total", value: reconciledBankTotal, icon: CheckCircle },
    { label: "Unreconciled Total", value: unreconciledBankTotal, icon: AlertCircle },
    { label: "Cash Difference", value: cashDifference, icon: Scale },
    { label: "AR Balance", value: totalAR, icon: Banknote },
    { label: "Overdue AR", value: overdueAR, icon: AlertCircle },
  ];

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Financial" subtitle="Financial overview and reports." />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
          CASH OVERVIEW
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <div className="rounded-lg border border-[#EBEBE9] bg-[#F7F7F5] p-2 dark:border-border dark:bg-muted">
                  <Icon className="h-4 w-4 text-gray-500 dark:text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-7 w-32 ml-auto" />
                ) : (
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums text-right",
                      value < 0 ? "text-red-600/90 dark:text-red-400/90" : "text-foreground"
                    )}
                  >
                    {formatMoney(value)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {!loading && cashDifference !== 0 ? (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
              Cash mismatch detected
            </p>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
            Recent Unreconciled Transactions
          </h3>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Date
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={idx}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : recentUnreconciled.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No data yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentUnreconciled.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="border-b border-[#EBEBE9] dark:border-border/60"
                      >
                        <TableCell className="tabular-nums">{tx.txn_date}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            tx.amount >= 0
                              ? "text-emerald-600/90 dark:text-emerald-400/90"
                              : "text-red-600/90 dark:text-red-400/90"
                          )}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {formatMoney(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          {!loading && recentUnreconciled.length > 0 ? (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/financial/bank">Reconcile in Bank</Link>
            </Button>
          ) : null}
        </div>
      </section>

      {!configured ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Supabase is not configured.</p>
        </Card>
      ) : null}
    </div>
  );
}
