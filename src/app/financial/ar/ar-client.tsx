"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createBrowserClient } from "@/lib/supabase";
import { getARSummary, getOutstandingInvoices } from "@/lib/data";
import { Banknote, AlertCircle, TrendingUp, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";

type OutstandingInvoiceRow = {
  id: string;
  invoice_no: string;
  project_id: string | null;
  client_name: string;
  due_date: string;
  issue_date: string;
  status: InvoiceStatus;
  total: number | null;
  paidTotal?: number;
  balanceDue?: number;
  projects?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

function normalizeProject(rel: OutstandingInvoiceRow["projects"]): { id: string; name: string } | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

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

function monthRange(d = new Date()): { start: string; nextStart: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start: start.toISOString().slice(0, 10), nextStart: next.toISOString().slice(0, 10) };
}

export function ArClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [outstanding, setOutstanding] = React.useState<OutstandingInvoiceRow[]>([]);
  const [totalAR, setTotalAR] = React.useState(0);
  const [overdueAR, setOverdueAR] = React.useState(0);
  const [paidThisMonth, setPaidThisMonth] = React.useState(0);

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

    setLoading(true);
    setError(null);

    const { start: monthStart, nextStart } = monthRange();

    try {
      const [summary, outstandingList, paymentsRes] = await Promise.all([
        getARSummary(),
        getOutstandingInvoices(),
        supabase
          .from("invoice_payments")
          .select("amount,paid_at,status")
          .eq("status", "Posted")
          .gte("paid_at", monthStart)
          .lt("paid_at", nextStart)
          .limit(5000),
      ]);

      setTotalAR(summary.totalAR);
      setOverdueAR(summary.overdueAR);
      setOutstanding(
        outstandingList.map((inv) => ({
          id: inv.id,
          invoice_no: inv.invoiceNo,
          project_id: inv.projectId || null,
          client_name: inv.clientName,
          issue_date: inv.issueDate,
          due_date: inv.dueDate,
          status: inv.status as InvoiceStatus,
          total: inv.total,
          paidTotal: inv.paidTotal,
          balanceDue: inv.balanceDue,
          projects: null,
        }))
      );

      if (paymentsRes.error) {
        if (!isMissingTableError(paymentsRes.error)) setError((prev) => prev ?? paymentsRes.error?.message ?? "Failed to load payments.");
        setPaidThisMonth(0);
      } else {
        const paid = (paymentsRes.data ?? []).reduce((sum, r) => sum + safeNumber((r as { amount?: number }).amount), 0);
        setPaidThisMonth(paid);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AR.");
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const byBucket = React.useMemo(() => {
    const out: Record<string, OutstandingInvoiceRow[]> = {};
    for (const inv of outstanding) {
      const bucket = getAgingBucket(inv.due_date);
      out[bucket] = out[bucket] ?? [];
      out[bucket].push(inv);
    }
    return out;
  }, [outstanding]);

  const bucketOrder = ["Current", "1–30", "31–60", "61–90", "90+"];
  const sortedBuckets = bucketOrder.filter((b) => (byBucket[b]?.length ?? 0) > 0);

  const kpis = [
    { label: "Total AR", value: totalAR, icon: Banknote },
    { label: "Overdue AR", value: overdueAR, icon: AlertCircle },
    { label: "Paid This Month", value: paidThisMonth, icon: TrendingUp },
  ];

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Accounts Receivable" subtitle="Outstanding invoices and aging. Record payments from invoice detail." />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">AR Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="shadow-none">
              <div className="flex flex-row items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  {loading ? (
                    <Skeleton className="mt-2 h-7 w-32" />
                  ) : (
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums mt-0.5",
                        label === "Overdue AR" && value > 0 && "text-amber-600 dark:text-amber-400",
                        label === "Paid This Month" && value > 0 && "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  )}
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
        {loading ? (
          <Card className="p-5">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        ) : sortedBuckets.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No outstanding invoices.</Card>
        ) : (
          <div className="space-y-6">
            {sortedBuckets.map((bucket) => (
              <Card key={bucket} className="overflow-hidden">
                <h3 className="text-sm font-semibold text-foreground px-4 py-3 bg-muted/30 border-b border-zinc-200/60 dark:border-border">
                  {bucket} {bucket === "Current" ? "" : "days overdue"}
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
                              {inv.invoice_no}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{(normalizeProject(inv.projects)?.name ?? "—")}</TableCell>
                          <TableCell className="text-foreground">{inv.client_name}</TableCell>
                          <TableCell className="text-right tabular-nums">${safeNumber(inv.total).toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600/90 dark:text-emerald-400/90">
                            ${safeNumber(inv.paidTotal).toLocaleString()}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{inv.due_date}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">${safeNumber(inv.balanceDue).toLocaleString()}</TableCell>
                          <TableCell>
                            <StatusBadge status={inv.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm" className="h-8">
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

      {!configured ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Supabase is not configured.</p>
        </Card>
      ) : null}
    </div>
  );
}

