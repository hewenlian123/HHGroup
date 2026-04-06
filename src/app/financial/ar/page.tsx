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
        <h2 className="mb-4 text-lg font-semibold text-foreground">AR Overview</h2>
        <div className="grid gap-4 border-b border-gray-100 pb-6 sm:grid-cols-3 dark:border-border">
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
                  label === "Overdue AR" && value > 0 && "text-amber-600 dark:text-amber-400",
                  label === "Paid This Month" &&
                    value > 0 &&
                    "text-hh-profit-positive dark:text-hh-profit-positive"
                )}
              >
                ${value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Outstanding by aging</h2>
        {sortedBuckets.length === 0 ? (
          <p className="border-b border-gray-100 py-8 text-center text-sm text-muted-foreground dark:border-border">
            No outstanding invoices.
          </p>
        ) : (
          <div className="space-y-6">
            {sortedBuckets.map((bucket) => (
              <div
                key={bucket}
                className="overflow-hidden rounded-sm border border-gray-100 dark:border-border"
              >
                <h3 className="border-b border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-foreground dark:border-border dark:bg-muted/30">
                  {bucket} days overdue
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Invoice #
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Project
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Client
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                        Invoice Total
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                        Paid
                      </TableHead>
                      <TableHead className="font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                        Due
                      </TableHead>
                      <TableHead className="text-right font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                        Balance
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Status
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Actions
                      </TableHead>
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
                        <TableCell className="text-muted-foreground">
                          {projectNameById.get(inv.projectId) ?? inv.projectId}
                        </TableCell>
                        <TableCell className="text-foreground">{inv.clientName}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          ${inv.total.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
                          ${inv.paidTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-muted-foreground">
                          {inv.dueDate}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium tabular-nums">
                          ${inv.balanceDue.toLocaleString()}
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
