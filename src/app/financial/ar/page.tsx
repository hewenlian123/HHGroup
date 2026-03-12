import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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
        <h2 className="text-lg font-semibold text-foreground mb-4">AR Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="rounded-2xl border border-zinc-200/40 dark:border-border shadow-none">
              <div className="flex flex-row items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p
                    className={cn(
                      "text-2xl font-bold tabular-nums mt-0.5",
                      label === "Overdue AR" && value > 0 && "text-amber-600 dark:text-amber-400",
                      label === "Paid This Month" && value > 0 && "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    ${value.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Outstanding by aging</h2>
        {sortedBuckets.length === 0 ? (
          <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-8 text-center text-muted-foreground">
            No outstanding invoices.
          </Card>
        ) : (
          <div className="space-y-6">
            {sortedBuckets.map((bucket) => (
              <Card key={bucket} className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
                <h3 className="text-sm font-semibold text-foreground px-4 py-3 bg-muted/30 border-b border-zinc-200/60 dark:border-border">
                  {bucket} days overdue
                </h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/20">
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoice #</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Project</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Invoice Total</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Paid</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Due</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Balance</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byBucket[bucket].map((inv) => (
                        <TableRow key={inv.id} className="border-b border-zinc-100/50 dark:border-border/30">
                          <TableCell className="font-medium">
                            <Link href={`/financial/invoices/${inv.id}`} className="text-primary hover:underline">
                              {inv.invoiceNo}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{projectNameById.get(inv.projectId) ?? inv.projectId}</TableCell>
                          <TableCell className="text-foreground">{inv.clientName}</TableCell>
                          <TableCell className="text-right tabular-nums">${inv.total.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600/90 dark:text-emerald-400/90">${inv.paidTotal.toLocaleString()}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{inv.dueDate}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">${inv.balanceDue.toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground">{inv.computedStatus}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm" className="rounded-lg h-8">
                              <Link href={`/financial/invoices/${inv.id}?recordPayment=1`}>
                                <CreditCard className="h-4 w-4 mr-1" />
                                Collect
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
