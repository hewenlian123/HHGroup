"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { dispatchClientDataSync } from "@/lib/sync-router-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkerPaymentReceiptPreviewModal } from "@/components/labor/worker-payment-receipt-preview-modal";
import {
  getLaborPaymentStatus,
  laborPaymentStatusUiLabel,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { statusChipClass } from "@/lib/typography";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";

type LaborEntryRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  /** Timesheet / workflow label (Draft, Approved, …) — not shown as payroll status in UI. */
  status: string;
  workerPaymentId?: string | null;
  /** True when linked to a worker payment (server); selection uses getLaborPaymentStatus. */
  payrollSettled?: boolean;
  /** Morning / afternoon / full day when available */
  session?: string | null;
};

type ReimbursementRow = {
  id: string;
  date: string;
  vendor: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
};

type Summary = {
  laborOwed: number;
  reimbursements: number;
  payments: number;
  /** Advances applied on payroll (status deducted); pending rows do not affect summary until marked deducted. */
  advances: number;
  balance: number;
};

type BalanceTone = "owed" | "overpaid" | "settled";

function balanceTone(balance: number): BalanceTone {
  if (balance > 0) return "owed";
  if (balance < 0) return "overpaid";
  return "settled";
}

function balanceChip(tone: BalanceTone) {
  if (tone === "owed") return { label: "Owed", className: statusChipClass("warning") };
  if (tone === "overpaid") return { label: "Overpaid", className: statusChipClass("info") };
  return { label: "Settled", className: statusChipClass("success") };
}

function recommendationLabel(tone: BalanceTone): string {
  if (tone === "owed") return "Owed · Pay worker";
  if (tone === "overpaid") return "Overpaid · Review";
  return "Settled · No action";
}

function KpiTile({
  label,
  value,
  emphasis = "neutral",
}: {
  label: string;
  value: string;
  emphasis?: "neutral" | "owed" | "overpaid" | "settled";
}) {
  const emphasisClass =
    emphasis === "owed"
      ? "border-amber-500/25 bg-amber-500/[0.05] dark:border-amber-500/25 dark:bg-amber-500/[0.08]"
      : emphasis === "overpaid"
        ? "border-blue-500/25 bg-blue-500/[0.04] dark:border-blue-500/25 dark:bg-blue-500/[0.06]"
        : emphasis === "settled"
          ? "border-emerald-500/25 bg-emerald-500/[0.04] dark:border-emerald-500/25 dark:bg-emerald-500/[0.06]"
          : "border-border/40 bg-background";

  return (
    <div
      className={cn(
        "min-h-[72px] rounded-md border px-3 py-2.5",
        "flex flex-col justify-between",
        emphasisClass
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-[18px] font-semibold tabular-nums tracking-tight text-zinc-900 whitespace-nowrap">
        {value}
      </p>
    </div>
  );
}

function RecommendationPanel({ balance }: { balance: number }) {
  const tone = balanceTone(balance);
  const chip = balanceChip(tone);
  const Icon = tone === "owed" ? AlertCircle : tone === "overpaid" ? Info : CheckCircle2;

  const shellClass =
    tone === "owed"
      ? "border-amber-500/25 bg-amber-500/[0.04] dark:border-amber-500/25 dark:bg-amber-500/[0.06]"
      : tone === "overpaid"
        ? "border-blue-500/25 bg-blue-500/[0.03] dark:border-blue-500/25 dark:bg-blue-500/[0.05]"
        : "border-emerald-500/25 bg-emerald-500/[0.03] dark:border-emerald-500/25 dark:bg-emerald-500/[0.05]";

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        shellClass
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-400" aria-hidden />
        <span className={chip.className}>{chip.label}</span>
        <span className="truncate text-sm font-medium text-zinc-900">
          {recommendationLabel(tone)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 sm:justify-end">
        <span className="text-xs text-zinc-400 sm:hidden">Balance</span>
        <span className="text-[16px] font-semibold tabular-nums tracking-tight text-zinc-900">
          {formatCurrency(balance)}
        </span>
      </div>
    </div>
  );
}

function LedgerSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-background shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-900">{title}</h2>
        <p className="text-[13px] leading-relaxed text-zinc-500/90">{description}</p>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function EmptyLedgerState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/60 px-4 py-10 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-zinc-400">—</span>;
}

export default function WorkerBalanceDetailPage() {
  const params = useParams();
  const workerId = params?.id as string | undefined;

  const [worker, setWorker] = React.useState<{ id: string; name: string } | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [laborEntries, setLaborEntries] = React.useState<LaborEntryRow[]>([]);
  const [reimbursements, setReimbursements] = React.useState<ReimbursementRow[]>([]);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = React.useState(false);
  const [payMethod, setPayMethod] = React.useState("");
  const [payDate, setPayDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = React.useState("");
  const [selectedLaborIds, setSelectedLaborIds] = React.useState<Set<string>>(new Set());
  const [selectedReimbIds, setSelectedReimbIds] = React.useState<Set<string>>(new Set());
  const [paySubmitting, setPaySubmitting] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [laborPayrollMode, setLaborPayrollMode] =
    React.useState<LaborPayrollSettlementMode>("payment_link");
  const [receiptPaymentId, setReceiptPaymentId] = React.useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/workers/${workerId}/balance`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load.");
      setLaborPayrollMode(
        data.laborPayrollSettlementMode === "status_fallback" ? "status_fallback" : "payment_link"
      );
      setWorker(data.worker ?? null);
      setSummary(
        data.summary
          ? {
              laborOwed: Number(data.summary.laborOwed) || 0,
              reimbursements: Number(data.summary.reimbursements) || 0,
              payments: Number(data.summary.payments) || 0,
              advances: Number(data.summary.advances) || 0,
              balance: Number(data.summary.balance) || 0,
            }
          : null
      );
      setLaborEntries(
        (data.laborEntries ?? []).map((e: LaborEntryRow) => ({
          ...e,
          workerPaymentId: e.workerPaymentId ?? null,
          payrollSettled: Boolean(e.payrollSettled),
        }))
      );
      setReimbursements(data.reimbursements ?? []);
      setPayments(data.payments ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  useBreadcrumbEntityLabel(worker?.name);

  const unpaidLabor = React.useMemo(
    () =>
      laborEntries.filter(
        (e) =>
          getLaborPaymentStatus(e.workerPaymentId ?? null, e.status, laborPayrollMode) !== "paid"
      ),
    [laborEntries, laborPayrollMode]
  );
  const unpaidReimb = React.useMemo(
    () => reimbursements.filter((r) => String(r.status).toLowerCase() !== "paid"),
    [reimbursements]
  );

  const totalPaymentAmount = React.useMemo(() => {
    let s = 0;
    unpaidLabor.forEach((e) => {
      if (selectedLaborIds.has(e.id)) s += e.amount;
    });
    unpaidReimb.forEach((r) => {
      if (selectedReimbIds.has(r.id)) s += r.amount;
    });
    return s;
  }, [unpaidLabor, unpaidReimb, selectedLaborIds, selectedReimbIds]);

  const openPayModal = () => {
    setSelectedLaborIds(new Set(unpaidLabor.map((e) => e.id)));
    setSelectedReimbIds(new Set(unpaidReimb.map((r) => r.id)));
    setPayMethod("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes("");
    setPayError(null);
    setPayModalOpen(true);
  };

  const toggleLabor = (id: string) => {
    setSelectedLaborIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleReimb = (id: string) => {
    setSelectedReimbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || totalPaymentAmount <= 0) return;
    const method = payMethod.trim();
    if (!method) {
      setPayError("Payment method is required.");
      return;
    }
    setPaySubmitting(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/labor/workers/${workerId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: totalPaymentAmount,
          payment_method: method,
          payment_date: payDate.slice(0, 10),
          notes: payNotes.trim() || null,
          labor_entry_ids: Array.from(selectedLaborIds),
          reimbursement_ids: Array.from(selectedReimbIds),
        }),
      });
      const data = (await res.json()) as { message?: string; payment?: { id?: string } };
      if (!res.ok) throw new Error(data.message ?? "Payment failed.");
      const pid = typeof data.payment?.id === "string" ? data.payment.id : null;
      setPayModalOpen(false);
      await load();
      dispatchClientDataSync({ reason: "worker-pay" });
      if (pid) {
        queueMicrotask(() => {
          setReceiptPaymentId(pid);
          setReceiptOpen(true);
        });
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!workerId) {
    return (
      <div className="page-container page-stack py-6">
        <p className="text-sm text-zinc-500">Worker not found.</p>
      </div>
    );
  }

  return (
    <div className="page-container page-stack py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <header className="border-b border-border/60 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <h1 className="text-[34px] leading-tight font-semibold tracking-tight text-zinc-900 md:text-[36px]">
              {worker?.name ?? "Worker Balance"}
            </h1>
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-zinc-500">
              Labor entries, reimbursements, payments, and balance.
            </p>
          </div>
          <div className="mt-0 flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:justify-end [&_a]:w-full [&_button]:w-full lg:[&_a]:w-auto lg:[&_button]:w-auto">
            <Link href="/labor/worker-balances" className="w-full sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                className="min-h-[44px] sm:min-h-9 w-full sm:w-auto"
              >
                Back to Balances
              </Button>
            </Link>
            <Button
              size="sm"
              className={cn(
                "min-h-[44px] sm:min-h-9 w-full sm:w-auto",
                "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              )}
              onClick={openPayModal}
              disabled={loading || (unpaidLabor.length === 0 && unpaidReimb.length === 0)}
            >
              <SubmitSpinner loading={paySubmitting} className="mr-2" />
              {paySubmitting ? "Saving…" : "Pay Worker"}
            </Button>
          </div>
        </div>
      </header>

      {message ? (
        <p className="text-sm text-zinc-500 border-b border-border/60 pb-3">{message}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500 py-6">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {/* Summary KPI tiles */}
            {summary != null && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <KpiTile label="Labor owed" value={formatCurrency(summary.laborOwed)} />
                <KpiTile label="Reimbursements" value={formatCurrency(summary.reimbursements)} />
                <KpiTile label="Payments" value={formatCurrency(summary.payments)} />
                <KpiTile label="Advances" value={formatCurrency(summary.advances)} />
                <KpiTile
                  label="Balance"
                  value={formatCurrency(summary.balance)}
                  emphasis={balanceTone(summary.balance)}
                />
              </div>
            )}

            {/* Payout recommendation (display only) */}
            {summary != null && <RecommendationPanel balance={summary.balance} />}

            <LedgerSection
              title="Labor Entries"
              description="Labor entries included in this worker’s balance. Same date can appear multiple times (project/session)."
            >
              {/* Mobile stacked rows */}
              <div className="md:hidden">
                {laborEntries.length === 0 ? (
                  <EmptyLedgerState
                    title="No labor entries"
                    subtitle="Labor entries will appear here."
                  />
                ) : (
                  <div className="divide-y divide-border/60">
                    {laborEntries.map((r) => {
                      const paySt = getLaborPaymentStatus(
                        r.workerPaymentId ?? null,
                        r.status,
                        laborPayrollMode
                      );
                      const statusTone = paySt === "paid" ? "success" : "warning";
                      return (
                        <div key={r.id} className="py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={LEDGER_DATE_CLASS}>
                                {formatLedgerDate(r.date, "compact")}
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-zinc-700">
                                {r.session ?? <Dash />} · {r.projectName ?? r.projectId ?? <Dash />}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    statusChipClass(statusTone),
                                    "px-2 py-0.5 text-[11px] leading-none rounded-sm"
                                  )}
                                >
                                  {laborPaymentStatusUiLabel(paySt)}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold tabular-nums tracking-tight text-zinc-900">
                                {formatCurrency(r.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                {laborEntries.length === 0 ? (
                  <EmptyLedgerState
                    title="No labor entries"
                    subtitle="Labor entries will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Date
                          </th>
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Session
                          </th>
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Project
                          </th>
                          <th className="py-2.5 pr-3 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-400 tabular-nums">
                            Amount
                          </th>
                          <th className="py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {laborEntries.map((r) => {
                          const paySt = getLaborPaymentStatus(
                            r.workerPaymentId ?? null,
                            r.status,
                            laborPayrollMode
                          );
                          const statusTone = paySt === "paid" ? "success" : "warning";
                          return (
                            <tr key={r.id} className="hover:bg-muted/5">
                              <td className="py-2.5 pr-3">
                                <span className={LEDGER_DATE_CLASS}>
                                  {formatLedgerDate(r.date)}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-zinc-700">{r.session ?? <Dash />}</td>
                              <td className="py-2.5 pr-3 text-zinc-700">
                                {r.projectName ?? r.projectId ?? <Dash />}
                              </td>
                              <td className="py-2.5 pr-3 text-right tabular-nums font-semibold tracking-tight text-zinc-900 whitespace-nowrap">
                                {formatCurrency(r.amount)}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={cn(
                                    statusChipClass(statusTone),
                                    "px-2 py-0.5 text-[11px] leading-none rounded-sm"
                                  )}
                                >
                                  {laborPaymentStatusUiLabel(paySt)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </LedgerSection>

            <LedgerSection
              title="Reimbursements"
              description="Expense reimbursements tied to this worker’s balance."
            >
              <div className="md:hidden">
                {reimbursements.length === 0 ? (
                  <EmptyLedgerState
                    title="No reimbursements"
                    subtitle="Reimbursements will appear here."
                  />
                ) : (
                  <div className="divide-y divide-border/60">
                    {reimbursements.map((r) => {
                      const isPaid = String(r.status).toLowerCase() === "paid";
                      const tone = isPaid ? "success" : "warning";
                      return (
                        <div key={r.id} className="py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={LEDGER_DATE_CLASS}>
                                {formatLedgerDate(r.date, "compact")}
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-zinc-700">
                                {r.vendor ?? <Dash />} · {r.projectName ?? r.projectId ?? <Dash />}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    statusChipClass(tone),
                                    "px-2 py-0.5 text-[11px] leading-none rounded-sm"
                                  )}
                                >
                                  {r.status}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold tabular-nums tracking-tight text-zinc-900">
                                {formatCurrency(r.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="hidden md:block">
                {reimbursements.length === 0 ? (
                  <EmptyLedgerState
                    title="No reimbursements"
                    subtitle="Reimbursements will appear here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Date
                          </th>
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Vendor
                          </th>
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Project
                          </th>
                          <th className="py-2.5 pr-3 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-400 tabular-nums">
                            Amount
                          </th>
                          <th className="py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {reimbursements.map((r) => {
                          const isPaid = String(r.status).toLowerCase() === "paid";
                          const tone = isPaid ? "success" : "warning";
                          return (
                            <tr key={r.id} className="hover:bg-muted/5">
                              <td className="py-2.5 pr-3">
                                <span className={LEDGER_DATE_CLASS}>
                                  {formatLedgerDate(r.date)}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-zinc-700">{r.vendor ?? <Dash />}</td>
                              <td className="py-2.5 pr-3 text-zinc-700">
                                {r.projectName ?? r.projectId ?? <Dash />}
                              </td>
                              <td className="py-2.5 pr-3 text-right tabular-nums font-semibold tracking-tight text-zinc-900 whitespace-nowrap">
                                {formatCurrency(r.amount)}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={cn(
                                    statusChipClass(tone),
                                    "px-2 py-0.5 text-[11px] leading-none rounded-sm"
                                  )}
                                >
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </LedgerSection>

            <LedgerSection title="Payments" description="Recorded payments made to this worker.">
              <div className="md:hidden">
                {payments.length === 0 ? (
                  <EmptyLedgerState title="No payments yet" subtitle="Payments will appear here." />
                ) : (
                  <div className="divide-y divide-border/60">
                    {payments.map((r) => (
                      <div key={r.id} className="py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={LEDGER_DATE_CLASS}>
                              {formatLedgerDate(r.date, "compact")}
                            </p>
                            <p className="mt-0.5 text-sm text-zinc-500">
                              {r.paymentMethod ?? <Dash />}
                            </p>
                            <p className="mt-2 text-sm text-zinc-700 break-words">
                              {r.notes ?? <Dash />}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums tracking-tight text-zinc-900">
                              {formatCurrency(r.amount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden md:block">
                {payments.length === 0 ? (
                  <EmptyLedgerState title="No payments yet" subtitle="Payments will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border/60">
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Date
                          </th>
                          <th className="py-2.5 pr-3 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-400 tabular-nums">
                            Amount
                          </th>
                          <th className="py-2.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Method
                          </th>
                          <th className="py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                            Notes
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {payments.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/5">
                            <td className="py-2.5 pr-3">
                              <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(r.date)}</span>
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums font-semibold tracking-tight text-zinc-900 whitespace-nowrap">
                              {formatCurrency(r.amount)}
                            </td>
                            <td className="py-2.5 pr-3 text-zinc-700">
                              {r.paymentMethod ?? <Dash />}
                            </td>
                            <td className="py-2.5 text-zinc-700">
                              <span
                                className="block max-w-[520px] truncate"
                                title={r.notes ?? undefined}
                              >
                                {r.notes ?? "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </LedgerSection>
          </div>
        </>
      )}

      {/* Pay Worker Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Worker</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaySubmit} className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              Select items to include in this payment. Total will be calculated automatically.
            </p>

            {unpaidLabor.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                  Unpaid labor entries
                </p>
                <div className="max-h-32 overflow-y-auto border border-border/60 rounded-sm divide-y divide-border/40">
                  {unpaidLabor.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/10 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLaborIds.has(e.id)}
                        onChange={() => toggleLabor(e.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate text-zinc-700">
                        {formatLedgerDate(e.date, "compact")} · {e.projectName ?? "—"}
                      </span>
                      <span className="text-sm tabular-nums font-semibold tracking-tight text-zinc-900">
                        {formatCurrency(e.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {unpaidReimb.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                  Unpaid reimbursements
                </p>
                <div className="max-h-32 overflow-y-auto border border-border/60 rounded-sm divide-y divide-border/40">
                  {unpaidReimb.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/10 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedReimbIds.has(r.id)}
                        onChange={() => toggleReimb(r.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate text-zinc-700">
                        {formatLedgerDate(r.date, "compact")} · {r.vendor ?? "—"}
                      </span>
                      <span className="text-sm tabular-nums font-semibold tracking-tight text-zinc-900">
                        {formatCurrency(r.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border/60 pt-3">
              <p className="text-sm font-semibold flex justify-between">
                <span>Total Payment Amount</span>
                <span className="tabular-nums">{formatCurrency(totalPaymentAmount)}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 block">Payment method</label>
              <Input
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                placeholder="e.g. Check, ACH, Cash"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 block">Payment date</label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 block">Notes (optional)</label>
              <Input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Optional notes"
                className="h-9"
              />
            </div>

            {payError ? <p className="text-sm text-destructive">{payError}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPayModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={paySubmitting || totalPaymentAmount <= 0}>
                {paySubmitting ? "Processing…" : "Confirm Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <WorkerPaymentReceiptPreviewModal
        paymentId={receiptPaymentId}
        open={receiptOpen}
        onOpenChange={(open) => {
          setReceiptOpen(open);
          if (!open) setReceiptPaymentId(null);
        }}
      />
    </div>
  );
}
