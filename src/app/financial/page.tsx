import Link from "next/link";
import { PageHeader } from "@/components/page-header";
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
      <div className="flex items-center gap-4 border-b border-border/60 pb-3 text-sm text-muted-foreground">
        <Link href="/financial/dashboard" className="hover:text-foreground">
          Company Dashboard
        </Link>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">CASH OVERVIEW</h2>
        <div className="grid gap-4 border-b border-gray-100 pb-6 sm:grid-cols-2 lg:grid-cols-5 dark:border-border">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  {label}
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
              <p
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums",
                  value < 0 ? "text-red-600/90 dark:text-red-400/90" : "text-foreground"
                )}
              >
                {formatMoney(value)}
              </p>
            </div>
          ))}
        </div>

        {cash.cashDifference !== 0 && (
          <div className="mt-4 border-b border-amber-400/40 pb-3 dark:border-amber-600/40">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
              Cash mismatch detected
            </p>
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Recent Unreconciled Transactions
          </h3>
          <div className="overflow-x-auto rounded-sm border border-gray-100 dark:border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground tabular-nums">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cash.recentUnreconciled.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      No unreconciled transactions
                    </TableCell>
                  </TableRow>
                ) : (
                  cash.recentUnreconciled.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="border-b border-gray-100/80 transition-colors hover:bg-[#F9FAFB] dark:border-border/40 dark:hover:bg-muted/20"
                    >
                      <TableCell className="tabular-nums">{tx.date}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          tx.amount >= 0
                            ? "text-hh-profit-positive dark:text-hh-profit-positive"
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
          {cash.recentUnreconciled.length > 0 && (
            <Button asChild variant="outline" size="sm" className="mt-3 rounded-sm">
              <Link href="/financial/bank">Reconcile in Bank</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
