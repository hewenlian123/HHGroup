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
import { formatCurrency } from "@/lib/formatters";
import { amountClass, OS, TYPO } from "@/lib/typography";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

const EMPTY_CASH: Awaited<ReturnType<typeof getCashOverview>> = {
  bankBalance: 0,
  systemExpenses: 0,
  reconciledBankTotal: 0,
  unreconciledBankTotal: 0,
  cashDifference: 0,
  recentUnreconciled: [],
  dataLoadWarnings: [],
};

const EMPTY_AR: Awaited<ReturnType<typeof getARSummary>> = {
  totalAR: 0,
  overdueAR: 0,
  paidThisMonth: 0,
};

export default async function FinancialPage() {
  const [cashResult, arResult] = await Promise.allSettled([getCashOverview(), getARSummary()]);
  let cash: Awaited<ReturnType<typeof getCashOverview>> = { ...EMPTY_CASH };
  let ar: Awaited<ReturnType<typeof getARSummary>> = { ...EMPTY_AR };
  const dataLoadWarnings: string[] = [];

  if (cashResult.status === "fulfilled") {
    cash = cashResult.value;
    dataLoadWarnings.push(...(cash.dataLoadWarnings ?? []));
  } else {
    logServerPageDataError("financial cash overview", cashResult.reason);
    dataLoadWarnings.push(serverDataLoadWarning(cashResult.reason, "cash overview"));
  }

  if (arResult.status === "fulfilled") {
    ar = arResult.value;
  } else {
    logServerPageDataError("financial AR summary", arResult.reason);
    dataLoadWarnings.push(serverDataLoadWarning(arResult.reason, "AR summary"));
  }

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 pb-3 text-sm text-muted-foreground">
        <Link href="/financial/owner" className="hover:text-foreground">
          Owner dashboard
        </Link>
        <Link href="/financial/dashboard" className="hover:text-foreground">
          Company Dashboard
        </Link>
      </div>
      {dataLoadWarnings.length > 0 ? (
        <div className="space-y-2 border-b border-border/60 pb-3 text-sm text-muted-foreground">
          {dataLoadWarnings.map((warning) => (
            <p key={warning} role="status">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className={cn("mb-4", TYPO.sectionLabel)}>Cash overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label} className={cn("p-4", OS.card)}>
              <div className="flex items-center justify-between gap-2">
                <span className={TYPO.kpiLabel}>{label}</span>
                <span className={OS.iconWell}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                </span>
              </div>
              <p className={cn("mt-3 text-xl", amountClass(value < 0 ? "expense" : "neutral"))}>
                {formatCurrency(value)}
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
          <h3 className={cn("mb-3", TYPO.sectionLabel)}>Recent unreconciled transactions</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
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
                    <TableRow key={tx.id}>
                      <TableCell>
                        <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(tx.date)}</span>
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
