"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";

type PayRunRow = {
  workerId: string;
  workerName: string;
  confirmedDailyTotal: number;
  confirmedInvoiceTotal: number;
  confirmedTotal: number;
  paidTotal: number;
  balance: number;
  payments: Array<{ id: string; paymentDate: string; amount: number; method: string; memo?: string }>;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function LaborPaymentsClient() {
  const [startDate, setStartDate] = React.useState(last7DaysStart);
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<PayRunRow[]>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>(["ACH"]);
  const [expandedWorkerId, setExpandedWorkerId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [modalWorkerId, setModalWorkerId] = React.useState<string | null>(null);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState("ACH");
  const [memo, setMemo] = React.useState("");
  const [modalWarning, setModalWarning] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);

    const [workersRes, entriesRes, paymentsRes, projectsRes, methodsRes] = await Promise.all([
      supabase.from("workers").select("id,name,half_day_rate").order("created_at", { ascending: false }).limit(500),
      supabase
        .from("labor_entries")
        .select("id,entry_date,worker_id,total,am_worked,am_project_id,pm_worked,pm_project_id,ot_amount,ot_project_id")
        .eq("status", "confirmed")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .limit(2000),
      supabase
        .from("labor_payments")
        .select("id,worker_id,payment_date,amount,method,memo,applied_start_date,applied_end_date")
        .or(`and(applied_start_date.eq.${startDate},applied_end_date.eq.${endDate}),and(payment_date.gte.${startDate},payment_date.lte.${endDate})`)
        .limit(2000),
      supabase.from("projects").select("id,name").order("created_at", { ascending: false }).limit(500),
      supabase.from("payment_methods").select("name,status").eq("status", "active").order("name").limit(100),
    ]);

    const workers = (workersRes.data ?? []) as Array<{ id: string; name: string; half_day_rate?: number | null }>;
    const entries = (entriesRes.data ?? []) as Array<{
      entry_date: string;
      worker_id: string;
      total: number | null;
      am_project_id: string | null;
      pm_project_id: string | null;
      ot_project_id: string | null;
    }>;
    const payments = (paymentsRes.data ?? []) as Array<{
      id: string;
      worker_id: string;
      payment_date: string;
      amount: number | null;
      method: string | null;
      memo: string | null;
      applied_start_date: string | null;
      applied_end_date: string | null;
    }>;

    if (projectsRes.data) setProjects((projectsRes.data ?? []) as Array<{ id: string; name: string }>);
    if (methodsRes.data) {
      const names = (methodsRes.data as Array<{ name: string }>).map((r) => r.name).filter(Boolean);
      setPaymentMethods(names.length ? names : ["ACH"]);
    }

    const inRange = (d: string) => d >= startDate && d <= endDate;
    const payRunRows: PayRunRow[] = workers.map((w) => {
      const workerEntries = entries.filter((e) => e.worker_id === w.id && inRange(e.entry_date));
      const rate = safeNumber(w.half_day_rate);
      const projectFilter = projectId.trim();
      let confirmedTotal: number;
      if (projectFilter) {
        confirmedTotal = workerEntries.reduce((sum, e) => {
          const ent = e as { am_worked?: boolean; am_project_id?: string | null; pm_worked?: boolean; pm_project_id?: string | null; ot_amount?: number | null; ot_project_id?: string | null };
          const am = ent.am_worked && ent.am_project_id === projectFilter ? rate : 0;
          const pm = ent.pm_worked && ent.pm_project_id === projectFilter ? rate : 0;
          const ot = ent.ot_project_id === projectFilter ? safeNumber(ent.ot_amount) : 0;
          return sum + am + pm + ot;
        }, 0);
      } else {
        confirmedTotal = workerEntries.reduce((sum, e) => sum + safeNumber(e.total), 0);
      }
      const workerPayments = payments.filter((p) => p.worker_id === w.id && (inRange(p.payment_date) || (p.applied_start_date === startDate && p.applied_end_date === endDate)));
      const paidTotal = workerPayments.reduce((s, p) => s + safeNumber(p.amount), 0);
      const balance = Math.max(0, confirmedTotal - paidTotal);
      return {
        workerId: w.id,
        workerName: w.name ?? w.id,
        confirmedDailyTotal: confirmedTotal,
        confirmedInvoiceTotal: 0,
        confirmedTotal,
        paidTotal,
        balance,
        payments: workerPayments.map((p) => ({
          id: p.id,
          paymentDate: p.payment_date,
          amount: safeNumber(p.amount),
          method: p.method ?? "—",
          memo: p.memo ?? undefined,
        })),
      };
    });

    setRows(payRunRows);
    if (entriesRes.error && !isMissingTableError(entriesRes.error)) setError(entriesRes.error.message);
    if (workersRes.error && !isMissingTableError(workersRes.error)) setError((e) => e ?? workersRes.error?.message ?? null);
    setLoading(false);
  }, [configured, startDate, endDate, projectId, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!method && paymentMethods[0]) setMethod(paymentMethods[0]);
  }, [method, paymentMethods]);

  const openModal = (workerId: string, balance: number) => {
    setModalWorkerId(workerId);
    setAmount(Math.max(0, balance));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setModalWarning(null);
  };

  const savePayment = async () => {
    if (!modalWorkerId || !method || !supabase || busy) return;
    if (amount <= 0) {
      setModalWarning("Amount must be greater than 0.");
      return;
    }
    const worker = rows.find((r) => r.workerId === modalWorkerId);
    if (!worker) return;
    const appliedAmount = Math.min(amount, worker.balance);
    if (amount > worker.balance) setModalWarning("Amount exceeded balance. Applied amount was clamped to balance.");

    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from("labor_payments").insert({
      worker_id: modalWorkerId,
      payment_date: paymentDate,
      amount: appliedAmount,
      method,
      memo: memo.trim() || null,
      applied_start_date: startDate,
      applied_end_date: endDate,
    });
    if (insErr) setError(insErr.message);
    else {
      setMessage("Payment recorded.");
      setModalWorkerId(null);
    }
    await refresh();
    setBusy(false);
  };

  const deletePayment = async (paymentId: string) => {
    if (!supabase || busy) return;
    if (!window.confirm("Delete this payment?")) return;
    setBusy(true);
    setError(null);
    const prevRows = rows;
    setRows((prev) =>
      prev.map((r) => {
        const idx = r.payments.findIndex((p) => p.id === paymentId);
        if (idx < 0) return r;
        const newPayments = r.payments.filter((p) => p.id !== paymentId);
        const newPaid = newPayments.reduce((s, p) => s + p.amount, 0);
        return { ...r, payments: newPayments, paidTotal: newPaid, balance: Math.max(0, r.confirmedTotal - newPaid) };
      })
    );
    const { error: delErr } = await supabase.from("labor_payments").delete().eq("id", paymentId);
    if (delErr) {
      setError(delErr.message);
      setRows(prevRows);
    }
    setBusy(false);
  };

  const kpiTotalDue = rows.reduce((sum, r) => sum + r.confirmedTotal, 0);
  const kpiTotalPaid = rows.reduce((sum, r) => sum + r.paidTotal, 0);
  const kpiOutstanding = rows.reduce((sum, r) => sum + r.balance, 0);
  const modalWorker = rows.find((r) => r.workerId === modalWorkerId);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Labor Payments" description="Weekly pay run summary from confirmed labor only." />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Due</p>
          {loading ? <Skeleton className="mt-2 h-7 w-24" /> : (
            <p className="text-lg font-semibold tabular-nums mt-1">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiTotalDue)}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Paid</p>
          {loading ? <Skeleton className="mt-2 h-7 w-24" /> : (
            <p className="text-lg font-semibold tabular-nums mt-1">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiTotalPaid)}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding</p>
          {loading ? <Skeleton className="mt-2 h-7 w-24" /> : (
            <p className="text-lg font-semibold tabular-nums mt-1">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiOutstanding)}
            </p>
          )}
        </Card>
      </div>

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="table-responsive">
          <table className="w-full min-w-[520px] text-sm md:min-w-0">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Confirmed Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Paid Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Balance</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6}><Skeleton className="h-12 w-full" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={6}>No data yet.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <React.Fragment key={row.workerId}>
                    <tr className="border-b border-zinc-100/50 dark:border-border/30">
                      <td className="py-3 px-4 font-medium text-foreground">
                        <button type="button" className="hover:underline" onClick={() => setExpandedWorkerId((prev) => (prev === row.workerId ? null : row.workerId))}>
                          {row.workerName}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedTotal)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.paidTotal)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.balance)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={row.balance > 0 ? "inline-flex rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "inline-flex rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}>
                          {row.balance > 0 ? "Outstanding" : "Paid"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setExpandedWorkerId((prev) => (prev === row.workerId ? null : row.workerId))}>
                            {expandedWorkerId === row.workerId ? "Hide History" : "History"}
                          </Button>
                          <Button size="sm" className="h-8" onClick={() => openModal(row.workerId, row.balance)} disabled={row.balance <= 0 || busy}>
                            Record Payment
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedWorkerId === row.workerId ? (
                      <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-muted/20">
                        <td className="py-3 px-4 text-xs text-muted-foreground" colSpan={6}>
                          <div className="space-y-3">
                            <div className="rounded-lg border border-zinc-200/60 dark:border-border px-3 py-2 bg-background/60">
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Pay Run Source</p>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span>Daily confirmed</span>
                                  <span className="tabular-nums">
                                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedDailyTotal)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4 font-medium text-foreground pt-1 border-t border-zinc-200/60 dark:border-border">
                                  <span>Confirmed total</span>
                                  <span className="tabular-nums">
                                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Payment History</p>
                              {row.payments.length === 0 ? (
                                <span>No payments in selected range.</span>
                              ) : (
                                <ul className="space-y-1">
                                  {row.payments.map((p) => (
                                    <li key={p.id} className="flex justify-between gap-4 items-center">
                                      <span>{p.paymentDate} • {p.method} {p.memo ? `• ${p.memo}` : ""}</span>
                                      <span className="tabular-nums">
                                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(p.amount)}
                                      </span>
                                      <Button variant="ghost" size="sm" className="h-8 text-red-600 text-xs" onClick={() => deletePayment(p.id)} disabled={busy}>
                                        Delete
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalWorkerId ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <Card className="w-full max-w-[560px] p-6">
            <h3 className="text-base font-semibold text-foreground">Record Payment — {modalWorker?.workerName ?? "Worker"}</h3>
            <p className="text-xs text-muted-foreground mt-1">Applied range: {startDate} to {endDate}</p>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="mt-1 text-right tabular-nums" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm">
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memo (optional)</label>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo" className="mt-1" />
              </div>
              {modalWarning ? <p className="text-xs text-amber-600 dark:text-amber-400">{modalWarning}</p> : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalWorkerId(null)} disabled={busy}>Cancel</Button>
              <Button onClick={savePayment} disabled={amount <= 0 || busy}>Save Payment</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
