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
import { getCashOverview, getARSummary } from "@/lib/data";
import { Banknote, Receipt, CheckCircle, AlertCircle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatMoney(amount: number): string {
  const formatted = `$${Math.abs(amount).toLocaleString()}`;
  return amount < 0 ? `−${formatted}` : formatted;
}

export default async function FinancialPage() {
  const [cash, ar] = await Promise.all([getCashOverview(), getARSummary()]);

  const kpis = [
    { label: "Bank Balance", value: cash.bankBalance, icon: Banknote },
    { label: "System Expenses", value: cash.systemExpenses, icon: Receipt },
    { label: "Reconciled Total", value: cash.reconciledBankTotal, icon: CheckCircle },
    { label: "Unreconciled Total", value: cash.unreconciledBankTotal, icon: AlertCircle },
    { label: "Cash Difference", value: cash.cashDifference, icon: Scale },
    { label: "AR Balance", value: ar.totalAR, icon: Banknote },
    { label: "Overdue AR", value: ar.overdueAR, icon: AlertCircle },
  ];

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Financial" description="Financial overview and reports." />
      <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-border/60 pb-3">
        <Link href="/financial/dashboard" className="hover:text-foreground">Company Dashboard</Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">CASH OVERVIEW</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="rounded-2xl border border-zinc-200/40 dark:border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <div className="rounded-lg bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums text-right",
                    value < 0 ? "text-red-600/90 dark:text-red-400/90" : "text-foreground"
                  )}
                >
                  {formatMoney(value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {cash.cashDifference !== 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Cash mismatch detected</p>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Unreconciled Transactions</h3>
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Description</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cash.recentUnreconciled.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No unreconciled transactions
                      </TableCell>
                    </TableRow>
                  ) : (
                    cash.recentUnreconciled.map((tx) => (
                      <TableRow key={tx.id} className="border-b border-zinc-100/50 dark:border-border/30">
                        <TableCell className="tabular-nums">{tx.date}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            tx.amount >= 0 ? "text-emerald-600/90 dark:text-emerald-400/90" : "text-red-600/90 dark:text-red-400/90"
                          )}
                        >
                          {tx.amount >= 0 ? "+" : ""}{formatMoney(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          {cash.recentUnreconciled.length > 0 && (
            <Button asChild variant="outline" size="sm" className="mt-3 rounded-lg">
              <Link href="/financial/bank">Reconcile in Bank</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
