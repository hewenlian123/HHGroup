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
import { FinanceDatePicker } from "@/components/ui/date-picker";
import {
  getLaborPaymentStatus,
  laborPaymentStatusUiLabel,
  type LaborPayrollSettlementMode,
} from "@/lib/labor-balance-shared";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { statusChipClass } from "@/lib/typography";
import { AlertCircle, CheckCircle2, Info, Pencil, Plus, Trash2 } from "lucide-react";
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

  type SplitMethod = "Cash" | "Check" | "ACH" | "Zelle" | "Other";
  type SplitRow = { id: string; method: SplitMethod | ""; amount: string; reference: string };

  const splitMethodOptions: SplitMethod[] = ["Cash", "Check", "ACH", "Zelle", "Other"];
  const [splitRows, setSplitRows] = React.useState<SplitRow[]>([]);

  const splitTotal = React.useMemo(() => {
    return splitRows.reduce((sum, r) => {
      const n = Number(r.amount);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
  }, [splitRows]);

  const splitDelta = React.useMemo(
    () => totalPaymentAmount - splitTotal,
    [totalPaymentAmount, splitTotal]
  );

  const splitValidation = React.useMemo(() => {
    if (totalPaymentAmount <= 0) return { ok: false, message: null as string | null };
    if (splitRows.length === 0) return { ok: false, message: "Add a payment method." };
    for (const r of splitRows) {
      if (!r.method) return { ok: false, message: "Each split row needs a method." };
      const n = Number(r.amount);
      if (!Number.isFinite(n) || n <= 0)
        return { ok: false, message: "Each split row needs an amount > 0." };
    }
    const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    if (rounded(splitTotal) !== rounded(totalPaymentAmount)) return { ok: false, message: null };
    return { ok: true, message: null };
  }, [splitRows, splitTotal, totalPaymentAmount]);

  const openPayModal = () => {
    const initialLaborIds = new Set(unpaidLabor.map((e) => e.id));
    const initialReimbIds = new Set(unpaidReimb.map((r) => r.id));
    const initialTotal =
      unpaidLabor.reduce((s, e) => s + e.amount, 0) + unpaidReimb.reduce((s, r) => s + r.amount, 0);
    setSelectedLaborIds(initialLaborIds);
    setSelectedReimbIds(initialReimbIds);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes("");
    setPayError(null);
    const amt = initialTotal > 0 ? initialTotal.toFixed(2) : "";
    setSplitRows(
      initialTotal > 0
        ? [
            {
              id: crypto.randomUUID?.() ?? `${Date.now()}`,
              method: "Cash",
              amount: amt,
              reference: "",
            },
          ]
        : []
    );
    setPayModalOpen(true);
  };

  React.useEffect(() => {
    if (!payModalOpen) return;
    if (splitRows.length !== 1) return;
    setSplitRows((prev) => {
      const one = prev[0];
      if (!one) return prev;
      const nextAmt = totalPaymentAmount > 0 ? totalPaymentAmount.toFixed(2) : "";
      if (one.amount === nextAmt) return prev;
      return [{ ...one, amount: nextAmt }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payModalOpen, totalPaymentAmount]);

  const removeSplitRow = (id: string) => {
    setSplitRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateSplitRow = (id: string, patch: Partial<SplitRow>) => {
    setSplitRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const [splitEditorOpen, setSplitEditorOpen] = React.useState(false);
  const [splitEditorMode, setSplitEditorMode] = React.useState<"add" | "edit">("add");
  const [splitEditorTargetId, setSplitEditorTargetId] = React.useState<string | null>(null);
  const [draftMethod, setDraftMethod] = React.useState<SplitRow["method"]>("Cash");
  const [draftAmount, setDraftAmount] = React.useState<string>("");
  const [draftReference, setDraftReference] = React.useState<string>("");
  const [draftError, setDraftError] = React.useState<string | null>(null);

  const openAddSplit = () => {
    setSplitEditorMode("add");
    setSplitEditorTargetId(null);
    setDraftMethod("Cash");
    const remaining = Math.max(0, splitDelta);
    setDraftAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setDraftReference("");
    setDraftError(null);
    setSplitEditorOpen(true);
  };

  const openEditSplit = (row: SplitRow) => {
    setSplitEditorMode("edit");
    setSplitEditorTargetId(row.id);
    setDraftMethod(row.method || "Cash");
    setDraftAmount(row.amount);
    setDraftReference(row.reference);
    setDraftError(null);
    setSplitEditorOpen(true);
  };

  const saveSplitDraft = () => {
    const method = draftMethod;
    const amt = Number(draftAmount);
    if (!method) {
      setDraftError("Method is required.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setDraftError("Amount must be greater than 0.");
      return;
    }
    const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const current = splitRows.find((r) => r.id === splitEditorTargetId) ?? null;
    const currentAmt = current ? Number(current.amount) : 0;
    const nextTotal =
      splitEditorMode === "edit"
        ? splitTotal - (Number.isFinite(currentAmt) ? currentAmt : 0) + amt
        : splitTotal + amt;
    if (rounded(nextTotal) > rounded(totalPaymentAmount)) {
      setDraftError("Split total can’t exceed Total Payment Amount.");
      return;
    }

    if (splitEditorMode === "edit" && splitEditorTargetId) {
      updateSplitRow(splitEditorTargetId, {
        method,
        amount: draftAmount,
        reference: draftReference,
      });
    } else {
      setSplitRows((prev) => [
        ...prev,
        {
          id: crypto.randomUUID?.() ?? `${Date.now()}-${prev.length}`,
          method,
          amount: draftAmount,
          reference: draftReference,
        },
      ]);
    }
    setSplitEditorOpen(false);
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
    if (splitRows.length > 1) {
      setPayError("Split payments need backend support before saving.");
      return;
    }
    const only = splitRows[0];
    const method = (only?.method ?? "").trim();
    const amt = Number(only?.amount);
    if (!method) return setPayError("Payment method is required.");
    if (!Number.isFinite(amt) || amt <= 0) return setPayError("Payment amount is required.");
    const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    if (rounded(amt) !== rounded(totalPaymentAmount)) {
      setPayError("Split amount must equal Total Payment Amount.");
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
          <form onSubmit={handlePaySubmit} className="space-y-5">
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">Split payment</p>
                </div>
                {totalPaymentAmount > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium tabular-nums",
                      splitDelta === 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : splitDelta > 0
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-rose-700 dark:text-rose-400"
                    )}
                  >
                    {splitDelta === 0
                      ? `Remaining ${formatCurrency(0)}`
                      : splitDelta > 0
                        ? `Remaining ${formatCurrency(splitDelta)}`
                        : `Over by ${formatCurrency(Math.abs(splitDelta))}`}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 rounded-md border border-border/40 bg-muted/[0.05] p-2">
                {splitRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 px-3 py-3">
                    <p className="text-sm text-zinc-500">No payment methods yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/20">
                    {splitRows.map((r, idx) => {
                      const amt = Number(r.amount);
                      const amtText = Number.isFinite(amt) ? formatCurrency(amt) : "—";
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-700 truncate">
                              <span className="font-medium text-zinc-900">{r.method || "—"}</span>{" "}
                              <span className="text-zinc-500">·</span>{" "}
                              <span className="tabular-nums font-semibold tracking-tight text-zinc-900">
                                {amtText}
                              </span>
                              {r.reference?.trim() ? (
                                <>
                                  {" "}
                                  <span className="text-zinc-500">·</span>{" "}
                                  <span className="text-zinc-500 truncate">
                                    {r.reference.trim()}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-zinc-400/70 hover:text-zinc-600 hover:bg-muted/15 sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
                              onClick={() => openEditSplit(r)}
                              aria-label={`Edit payment split ${idx + 1}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-zinc-400/70 hover:text-zinc-600 hover:bg-muted/15 sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
                              onClick={() => removeSplitRow(r.id)}
                              aria-label={`Remove payment split ${idx + 1}`}
                              disabled={splitRows.length === 1}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="pt-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "px-2 text-zinc-500 hover:text-zinc-600 hover:bg-transparent",
                      "min-h-[44px] sm:min-h-9 text-xs"
                    )}
                    onClick={openAddSplit}
                    disabled={totalPaymentAmount <= 0}
                  >
                    <Plus className="mr-2 h-4 w-4 text-zinc-400/80" aria-hidden />
                    Add payment
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 block">Payment date</label>
              <FinanceDatePicker value={payDate} onChange={setPayDate} size="md" />
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
            {!splitValidation.ok && splitValidation.message ? (
              <p className="text-sm text-destructive">{splitValidation.message}</p>
            ) : null}

            <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPayModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                disabled={
                  paySubmitting ||
                  totalPaymentAmount <= 0 ||
                  splitRows.length === 0 ||
                  splitRows.length > 1 ||
                  !splitValidation.ok
                }
              >
                {paySubmitting ? "Processing…" : "Confirm Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Split add/edit dialog (UI only) */}
      <Dialog
        open={splitEditorOpen}
        onOpenChange={(open) => {
          setSplitEditorOpen(open);
          if (!open) setDraftError(null);
        }}
      >
        <DialogContent className="max-w-sm sm:rounded-md max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {splitEditorMode === "edit" ? "Edit payment" : "Add payment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 block">Method</label>
              <select
                value={draftMethod}
                onChange={(e) => setDraftMethod(e.target.value as SplitRow["method"])}
                className="h-11 min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 text-sm"
                required
              >
                {splitMethodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 block">Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                className="h-11 min-h-[44px] text-right tabular-nums font-semibold tracking-tight"
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400 block">
                Reference (optional)
              </label>
              <Input
                value={draftReference}
                onChange={(e) => setDraftReference(e.target.value)}
                className="h-11 min-h-[44px]"
                placeholder={draftMethod === "Check" ? "Check #" : "Optional"}
              />
            </div>

            {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSplitEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveSplitDraft}
              disabled={totalPaymentAmount <= 0}
            >
              Save
            </Button>
          </div>
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
