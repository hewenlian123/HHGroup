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
import { Banknote, Receipt, CheckCircle, AlertCircle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { amountClass, OS, TYPO } from "@/lib/typography";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";

type BankTx = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  status: "unmatched" | "reconciled";
};

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

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/financial/bank-transactions?view=summary", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        summary?: {
          bankBalance: number;
          reconciledBankTotal: number;
          unreconciledBankTotal: number;
          systemExpenses: number;
          cashDifference: number;
          totalAR: number;
          overdueAR: number;
          recentUnreconciled: BankTx[];
        };
      };
      if (!response.ok || !body.summary) {
        throw new Error(body.message ?? "Failed to load financial summary.");
      }
      setBankBalance(body.summary.bankBalance);
      setReconciledBankTotal(body.summary.reconciledBankTotal);
      setUnreconciledBankTotal(body.summary.unreconciledBankTotal);
      setRecentUnreconciled(body.summary.recentUnreconciled);
      setSystemExpenses(body.summary.systemExpenses);
      setCashDifference(body.summary.cashDifference);
      setTotalAR(body.summary.totalAR);
      setOverdueAR(body.summary.overdueAR);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load financial summary.");
      setBankBalance(0);
      setReconciledBankTotal(0);
      setUnreconciledBankTotal(0);
      setRecentUnreconciled([]);
      setSystemExpenses(0);
      setCashDifference(0);
      setTotalAR(0);
      setOverdueAR(0);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        </Card>
      ) : null}

      <section>
        <h2 className={cn("mb-4", TYPO.sectionLabel)}>Cash overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className={TYPO.kpiLabel}>{label}</CardTitle>
                <div className={OS.iconWell}>
                  <Icon className="h-4 w-4 text-text-secondary dark:text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-7 w-32 ml-auto" />
                ) : (
                  <p
                    className={cn(
                      "text-right text-2xl",
                      amountClass(value < 0 ? "expense" : "neutral")
                    )}
                  >
                    {formatCurrency(value)}
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
          <h3 className={cn("mb-3", TYPO.sectionLabel)}>Recent unreconciled transactions</h3>
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
                        className="border-b border-gray-100 dark:border-border/60"
                      >
                        <TableCell>
                          <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(tx.txn_date)}</span>
                        </TableCell>
                        <TableCell className={TYPO.primaryName}>{tx.description}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right",
                            amountClass(tx.amount >= 0 ? "income" : "expense")
                          )}
                        >
                          {formatCurrency(tx.amount)}
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
    </div>
  );
}
