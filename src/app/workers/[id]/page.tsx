"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getWorkerById,
  getWorkerUsage,
  getLaborEntriesWithJoins,
  getWorkerInvoices,
  getWorkerPayments,
  type WorkerInvoice,
} from "@/lib/data";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export default function WorkerDashboardPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [worker, setWorker] = React.useState<Awaited<ReturnType<typeof getWorkerById>> | undefined>(undefined);
  const [usage, setUsage] = React.useState<Awaited<ReturnType<typeof getWorkerUsage>> | null>(null);
  const [financialSummary, setFinancialSummary] = React.useState<{
    totalLabor: number;
    totalReimbursements: number;
    totalWorkerInvoices: number;
    totalPayments: number;
    balance: number;
  } | null>(null);

  const [monthly, setMonthly] = React.useState<{
    earned: number;
    paid: number;
    outstanding: number;
    from: string;
    to: string;
  } | null>(null);

  const refreshAll = React.useCallback(async () => {
    if (!id) return;
    const [w, u] = await Promise.all([getWorkerById(id), getWorkerUsage(id)]);
    setWorker(w);
    setUsage(u);
    if (w) {
      try {
        const r = await fetch(`/api/labor/workers/${id}/financial-summary`);
        const data = r.ok ? await r.json() : null;
        if (data && typeof data.totalLabor === "number") setFinancialSummary(data);
        else setFinancialSummary(null);
      } catch {
        setFinancialSummary(null);
      }

      const start = new Date();
      start.setDate(1);
      const from = start.toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      try {
        const [entries, invoicesAll, payments] = await Promise.all([
          getLaborEntriesWithJoins({ worker_id: id, date_from: from, date_to: to }).catch(() => []),
          getWorkerInvoices().catch(() => [] as WorkerInvoice[]),
          getWorkerPayments({ workerId: id, fromDate: from, toDate: to, limit: 500 }).catch(() => []),
        ]);
        let labor = 0;
        for (const e of entries) {
          labor += Number(e.cost_amount ?? 0) || 0;
        }
        let inv = 0;
        for (const x of invoicesAll as WorkerInvoice[]) {
          if (x.workerId !== id) continue;
          const d = x.createdAt?.slice(0, 10) ?? "";
          if (d < from || d > to) continue;
          inv += Number(x.amount) || 0;
        }
        let paid = 0;
        for (const p of payments) {
          paid += Number(p.amount) || 0;
        }
        const earned = labor + inv;
        setMonthly({ earned, paid, outstanding: earned - paid, from, to });
      } catch {
        setMonthly(null);
      }
    } else {
      setFinancialSummary(null);
      setMonthly(null);
    }
  }, [id]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useOnAppSync(
    React.useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
    [refreshAll]
  );

  if (!id) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === undefined) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-6">
        <p className="text-muted-foreground">Loading…</p>
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  if (worker === null) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const usageRes = usage ?? { used: false };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 p-6">
      <PageHeader
        title={worker.name}
        description="Worker dashboard — financial overview and quick links."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/workers">
              <Button variant="outline" size="sm" className="rounded-sm">
                Back
              </Button>
            </Link>
            <Link href={`/workers/${id}/edit`}>
              <Button size="sm" className="rounded-sm">
                Edit Profile
              </Button>
            </Link>
            <Link href={`/workers/${id}/statement`}>
              <Button variant="outline" size="sm" className="rounded-sm">
                Statement
              </Button>
            </Link>
          </div>
        }
      />

      <section className="border-b border-border/60 pb-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Profile</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="font-medium">{worker.phone?.trim() ? worker.phone : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trade</dt>
            <dd className="font-medium">{worker.trade?.trim() ? worker.trade : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Half-day rate</dt>
            <dd className="font-medium tabular-nums">{fmtUsd(worker.halfDayRate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium capitalize">{worker.status}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-foreground/90">{worker.notes?.trim() ? worker.notes : "—"}</dd>
          </div>
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            Created: {worker.createdAt}
            {usageRes.used ? " · Used in labor records" : " · Not used yet"}
          </div>
        </dl>
      </section>

      {financialSummary !== null ? (
        <section className="border-b border-border/60 pb-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Financial summary</h2>
          <p className="mb-3 text-xs text-muted-foreground">All-time totals (labor, reimbursements, invoices, payments).</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
            <div>
              <span className="text-muted-foreground">Total Labor</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalLabor)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Reimbursements</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalReimbursements)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Worker Invoices</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalWorkerInvoices)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Payments</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.totalPayments)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Balance</span>
              <p className="font-medium tabular-nums">{fmtUsd(financialSummary.balance)}</p>
            </div>
          </div>
        </section>
      ) : null}

      {monthly ? (
        <section className="border-b border-border/60 pb-4">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">This month</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {monthly.from} — {monthly.to}: labor (entries) + worker invoices vs worker payments.
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Earned</span>
              <p className="font-medium tabular-nums">{fmtUsd(monthly.earned)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Paid</span>
              <p className="font-medium tabular-nums">{fmtUsd(monthly.paid)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Outstanding</span>
              <p
                className={
                  monthly.outstanding > 0.005
                    ? "font-medium tabular-nums text-destructive"
                    : "font-medium tabular-nums"
                }
              >
                {fmtUsd(monthly.outstanding)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/workers/summary" className="underline-offset-4 hover:underline">
              Worker Summary
            </Link>{" "}
            for all workers and custom date ranges.
          </p>
        </section>
      ) : null}
    </div>
  );
}
