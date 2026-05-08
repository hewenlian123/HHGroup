import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getARSummary, getOutstandingInvoices, getProjects } from "@/lib/data";
import { Banknote, AlertCircle, TrendingUp, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { amountClass, OS, TYPO } from "@/lib/typography";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";

function getAgingBucket(dueDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate >= today) return "Current";
  const due = new Date(dueDate).getTime();
  const t = new Date(today).getTime();
  const daysOverdue = Math.floor((t - due) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 30) return "1–30";
  if (daysOverdue <= 60) return "31–60";
  if (daysOverdue <= 90) return "61–90";
  return "90+";
}

export const dynamic = "force-dynamic";

export default async function ARPage() {
  const [summary, outstanding, projects] = await Promise.all([
    getARSummary(),
    getOutstandingInvoices(),
    getProjects(),
  ]);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const byBucket: Record<string, typeof outstanding> = {};
  for (const inv of outstanding) {
    const bucket = getAgingBucket(inv.dueDate);
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(inv);
  }
  const bucketOrder = ["Current", "1–30", "31–60", "61–90", "90+"];
  const sortedBuckets = bucketOrder.filter((b) => byBucket[b]?.length);

  const kpis = [
    { label: "Total AR", value: summary.totalAR, icon: Banknote },
    { label: "Overdue AR", value: summary.overdueAR, icon: AlertCircle },
    { label: "Paid This Month", value: summary.paidThisMonth, icon: TrendingUp },
  ];

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Accounts Receivable"
        description="Outstanding invoices and aging. Record payments from invoice detail."
      />

      <section>
        <h2 className={cn("mb-4", TYPO.sectionLabel)}>AR overview</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label} className={cn("p-4", OS.card)}>
              <div className="flex items-center justify-between gap-2">
                <span className={TYPO.kpiLabel}>{label}</span>
                <span className={OS.iconWell}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                </span>
              </div>
              <p
                className={cn(
                  "mt-3 text-xl",
                  TYPO.kpiValue,
                  label === "Overdue AR" && value > 0 && "text-amber-600 dark:text-amber-400",
                  label === "Paid This Month" &&
                    value > 0 &&
                    "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {formatCurrency(value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className={cn("mb-4", TYPO.sectionLabel)}>Outstanding by aging</h2>
        {sortedBuckets.length === 0 ? (
          <p className={cn("py-8 text-sm text-muted-foreground", OS.emptyState)}>
            No outstanding invoices.
          </p>
        ) : (
          <div className="space-y-6">
            {sortedBuckets.map((bucket) => (
              <div key={bucket} className={OS.card}>
                <h3 className="border-b border-slate-900/[0.06] bg-slate-50/80 px-4 py-3 text-sm font-semibold text-foreground dark:border-border dark:bg-muted/20">
                  {bucket} days overdue
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Invoice Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byBucket[bucket].map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/financial/invoices/${inv.id}`}
                            className="text-primary hover:underline"
                          >
                            {inv.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400">
                          {projectNameById.get(inv.projectId) ?? inv.projectId}
                        </TableCell>
                        <TableCell className={TYPO.primaryName}>{inv.clientName}</TableCell>
                        <TableCell className={cn("text-right", amountClass("neutral"))}>
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell className={cn("text-right", amountClass("income"))}>
                          {formatCurrency(inv.paidTotal)}
                        </TableCell>
                        <TableCell>
                          <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(inv.dueDate)}</span>
                        </TableCell>
                        <TableCell className={cn("text-right", amountClass("neutral"))}>
                          {formatCurrency(inv.balanceDue)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.computedStatus}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm" className="h-8 rounded-sm">
                            <Link href={`/financial/invoices/${inv.id}?recordPayment=1`}>
                              <CreditCard className="mr-1 h-4 w-4" />
                              Collect
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
