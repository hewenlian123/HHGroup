"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { dispatchClientDataSync } from "@/lib/sync-router-client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Info,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { safeWorkerReturnPath, workerDetailReturnPath } from "@/lib/worker-return-path";

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
  /** Open advances currently reducing net-to-pay. Deducted advances are historical payroll value. */
  advances: number;
  balance: number;
};

type BalanceTone = "owed" | "overpaid" | "settled";

const neoSecondaryButton =
  "min-h-[44px] w-full rounded-full border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 text-[13px] font-semibold text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-control)] transition-colors duration-150 hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-gold-soft)] focus-visible:ring-[var(--neo-gold-ring)] sm:min-h-9 sm:w-auto";

const neoPrimaryButton =
  "min-h-[44px] w-full rounded-full border border-[rgb(184_147_90_/_0.30)] bg-[rgb(184_147_90_/_0.16)] px-4 text-[13px] font-semibold text-[var(--neo-gold-soft)] shadow-[var(--neo-shadow-control)] transition-colors duration-150 hover:border-[rgb(184_147_90_/_0.44)] hover:bg-[rgb(184_147_90_/_0.22)] focus-visible:ring-[var(--neo-gold-ring)] disabled:border-[var(--neo-border)] disabled:bg-[var(--neo-surface-muted)] disabled:text-[var(--neo-text-tertiary)] sm:min-h-9 sm:w-auto";

const ledgerHeaderCell =
  "py-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]";

const ledgerHeaderCellRight = cn(ledgerHeaderCell, "text-right tabular-nums");

const ledgerRow =
  "border-b border-[var(--neo-border)] bg-[var(--neo-surface-base)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--neo-surface-hover)]";

const ledgerCell =
  "py-2.5 pr-3 align-middle text-[13px] leading-snug text-[var(--neo-text-secondary)]";

const ledgerAmountCell =
  "py-2.5 pr-3 text-right align-middle text-[13px] font-semibold tabular-nums tracking-normal text-[var(--neo-text-primary)] whitespace-nowrap";

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
      ? "border-[rgb(184_147_90_/_0.34)] bg-[rgb(184_147_90_/_0.08)]"
      : emphasis === "overpaid"
        ? "border-[rgb(244_63_94_/_0.30)] bg-[rgb(244_63_94_/_0.08)]"
        : emphasis === "settled"
          ? "border-[rgb(16_185_129_/_0.26)] bg-[rgb(16_185_129_/_0.08)]"
          : "border-[var(--neo-border)] bg-[var(--neo-surface-raised)]";

  const valueClass =
    emphasis === "owed"
      ? "text-[var(--neo-gold-soft)]"
      : emphasis === "overpaid"
        ? "text-rose-300"
        : emphasis === "settled"
          ? "text-emerald-300"
          : "text-[var(--neo-text-primary)]";

  return (
    <div
      className={cn(
        "min-h-[76px] rounded-xl border px-3 py-3 shadow-[var(--neo-shadow-panel)]",
        "flex flex-col justify-between transition-[border-color,background-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-hover)]",
        emphasisClass
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
        {label}
      </p>
      <p
        className={cn(
          "text-[19px] font-semibold tabular-nums tracking-normal whitespace-nowrap",
          valueClass
        )}
      >
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
      ? "border-[rgb(184_147_90_/_0.34)] bg-[rgb(184_147_90_/_0.10)]"
      : tone === "overpaid"
        ? "border-[rgb(244_63_94_/_0.28)] bg-[rgb(244_63_94_/_0.08)]"
        : "border-[rgb(16_185_129_/_0.24)] bg-[rgb(16_185_129_/_0.08)]";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-[var(--neo-shadow-control)]",
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        shellClass
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "owed"
              ? "text-[var(--neo-gold-soft)]"
              : tone === "overpaid"
                ? "text-rose-300"
                : "text-emerald-300"
          )}
          aria-hidden
        />
        <span className={chip.className}>{chip.label}</span>
        <span className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
          {recommendationLabel(tone)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 sm:justify-end">
        <span className="text-xs text-[var(--neo-text-tertiary)] sm:hidden">Balance</span>
        <span
          className={cn(
            "text-[16px] font-semibold tabular-nums tracking-normal",
            tone === "owed"
              ? "text-[var(--neo-gold-soft)]"
              : tone === "overpaid"
                ? "text-rose-300"
                : "text-emerald-300"
          )}
        >
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
    <section className="overflow-hidden rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]">
      <header className="flex flex-col gap-1.5 border-b border-[var(--neo-border)] px-4 py-3.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-primary)]">
          {title}
        </h2>
        <p className="text-[13px] leading-relaxed text-[var(--neo-text-secondary)]">
          {description}
        </p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function EmptyLedgerState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-[var(--neo-border-strong)] bg-[var(--neo-surface-muted)] px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--neo-text-primary)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--neo-text-secondary)]">{subtitle}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-[var(--neo-text-tertiary)]">—</span>;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function WorkerBalanceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workerId = params?.id as string | undefined;
  const returnHref = safeWorkerReturnPath(
    searchParams.get("returnTo"),
    workerId ? workerDetailReturnPath(workerId, "payments") : "/workers"
  );

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
  const [lastPaymentMonth, setLastPaymentMonth] = React.useState<string | null>(null);
  const statementMonth = lastPaymentMonth ?? new Date().toISOString().slice(0, 7);
  const statementHref = workerId
    ? `/worker/${encodeURIComponent(workerId)}/monthly-report?month=${encodeURIComponent(
        statementMonth
      )}`
    : "/workers";
  const printStatementHref = `${statementHref}&print=1`;

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
  const allUnpaidGrossAmount = React.useMemo(
    () =>
      unpaidLabor.reduce((s, e) => s + e.amount, 0) + unpaidReimb.reduce((s, r) => s + r.amount, 0),
    [unpaidLabor, unpaidReimb]
  );
  const advanceDeductionAmount = React.useMemo(() => {
    const openAdvances = Math.max(0, Number(summary?.advances) || 0);
    if (openAdvances <= 0 || totalPaymentAmount <= 0) return 0;
    const payingAllOpenItems = roundMoney(totalPaymentAmount) >= roundMoney(allUnpaidGrossAmount);
    if (!payingAllOpenItems) return 0;
    return Math.min(openAdvances, totalPaymentAmount);
  }, [allUnpaidGrossAmount, summary?.advances, totalPaymentAmount]);
  const netPaymentAmount = React.useMemo(
    () => Math.max(0, roundMoney(totalPaymentAmount - advanceDeductionAmount)),
    [advanceDeductionAmount, totalPaymentAmount]
  );

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
    () => netPaymentAmount - splitTotal,
    [netPaymentAmount, splitTotal]
  );

  const splitValidation = React.useMemo(() => {
    if (netPaymentAmount <= 0) return { ok: false, message: null as string | null };
    if (splitRows.length === 0) return { ok: false, message: "Add a payment method." };
    for (const r of splitRows) {
      if (!r.method) return { ok: false, message: "Each split row needs a method." };
      const n = Number(r.amount);
      if (!Number.isFinite(n) || n <= 0)
        return { ok: false, message: "Each split row needs an amount > 0." };
    }
    if (roundMoney(splitTotal) !== roundMoney(netPaymentAmount))
      return { ok: false, message: null };
    return { ok: true, message: null };
  }, [splitRows, splitTotal, netPaymentAmount]);

  const openPayModal = () => {
    const initialLaborIds = new Set(unpaidLabor.map((e) => e.id));
    const initialReimbIds = new Set(unpaidReimb.map((r) => r.id));
    const initialTotal =
      unpaidLabor.reduce((s, e) => s + e.amount, 0) + unpaidReimb.reduce((s, r) => s + r.amount, 0);
    const initialAdvanceDeduction = Math.min(
      Math.max(0, Number(summary?.advances) || 0),
      initialTotal
    );
    const initialCashTotal = Math.max(0, roundMoney(initialTotal - initialAdvanceDeduction));
    setSelectedLaborIds(initialLaborIds);
    setSelectedReimbIds(initialReimbIds);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes("");
    setPayError(null);
    setLastPaymentMonth(null);
    const amt = initialCashTotal > 0 ? initialCashTotal.toFixed(2) : "";
    setSplitRows(
      initialCashTotal > 0
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
      const nextAmt = netPaymentAmount > 0 ? netPaymentAmount.toFixed(2) : "";
      if (one.amount === nextAmt) return prev;
      return [{ ...one, amount: nextAmt }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payModalOpen, netPaymentAmount]);

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
    if (rounded(nextTotal) > rounded(netPaymentAmount)) {
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
    if (!workerId || totalPaymentAmount <= 0 || netPaymentAmount <= 0) return;
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
    if (rounded(amt) !== rounded(netPaymentAmount)) {
      setPayError("Split amount must equal Total Payment Amount.");
      return;
    }
    const submittedPaymentDate = payDate.slice(0, 10);
    setPaySubmitting(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/labor/workers/${workerId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: netPaymentAmount,
          payment_method: method,
          payment_date: submittedPaymentDate,
          notes: payNotes.trim() || null,
          labor_entry_ids: Array.from(selectedLaborIds),
          reimbursement_ids: Array.from(selectedReimbIds),
          advance_deduction_amount: advanceDeductionAmount,
        }),
      });
      const data = (await res.json()) as { message?: string; payment?: { id?: string } };
      if (!res.ok) throw new Error(data.message ?? "Payment failed.");
      const pid = typeof data.payment?.id === "string" ? data.payment.id : null;
      setPayModalOpen(false);
      if (pid) {
        setReceiptPaymentId(pid);
        setReceiptOpen(true);
      }
      await load();
      setLastPaymentMonth(submittedPaymentDate.slice(0, 7));
      setMessage("Payment saved.");
      dispatchClientDataSync({ reason: "worker-pay" });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!workerId) {
    return (
      <div className="dark neo-page-on-graphite page-shell-standard mx-auto px-4 py-6">
        <p className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3 text-sm text-[var(--neo-text-secondary)]">
          Worker not found.
        </p>
      </div>
    );
  }

  return (
    <div className="dark neo-page-on-graphite page-shell-wide mx-auto flex w-full min-w-0 flex-col gap-4 overflow-x-hidden px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:px-6 md:py-6">
      <header className="border-b border-white/10 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-tight font-semibold tracking-normal text-[var(--neo-canvas-text-primary)] md:text-[36px]">
              {worker?.name ?? "Worker Balance"}
            </h1>
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-[var(--neo-canvas-text-secondary)]">
              Labor entries, reimbursements, payments, and balance.
            </p>
          </div>
          <div className="mt-0 flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:justify-end [&_a]:w-full [&_button]:w-full lg:[&_a]:w-auto lg:[&_button]:w-auto">
            <Link href={returnHref} className="w-full sm:w-auto">
              <Button size="sm" variant="outline" className={neoSecondaryButton}>
                Back to Worker
              </Button>
            </Link>
            <Link href="/labor/worker-balances" className="w-full sm:w-auto">
              <Button size="sm" variant="outline" className={neoSecondaryButton}>
                Back to Balances
              </Button>
            </Link>
            <Button
              size="sm"
              className={neoPrimaryButton}
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
        <p className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-3 text-sm text-[var(--neo-text-secondary)] shadow-[var(--neo-shadow-control)]">
          {message}
        </p>
      ) : null}

      {lastPaymentMonth ? (
        <div
          data-testid="worker-payment-next-actions"
          className={cn(
            "flex flex-col gap-3 rounded-xl border border-[rgb(16_185_129_/_0.24)] bg-[rgb(16_185_129_/_0.08)] px-4 py-3 shadow-[var(--neo-shadow-control)]",
            "sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgb(16_185_129_/_0.24)] bg-[rgb(16_185_129_/_0.12)] text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--neo-text-primary)]">
                Payment saved
              </p>
              <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                Continue from {worker?.name ?? "this worker"}.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
            <Button asChild variant="outline" size="sm" className={neoSecondaryButton}>
              <Link href={statementHref}>
                <FileText className="mr-2 h-4 w-4" aria-hidden />
                View Statement
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={neoSecondaryButton}>
              <Link href={printStatementHref}>
                <Printer className="mr-2 h-4 w-4" aria-hidden />
                Print Statement
              </Link>
            </Button>
            <Button asChild size="sm" className={neoPrimaryButton}>
              <Link href={returnHref}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                Back to Worker
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-4 py-6 text-sm text-[var(--neo-text-secondary)] shadow-[var(--neo-shadow-control)]">
          Loading…
        </p>
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
              <div className="px-4 py-3 md:hidden">
                {laborEntries.length === 0 ? (
                  <EmptyLedgerState
                    title="No labor entries"
                    subtitle="Labor entries will appear here."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {laborEntries.map((r) => {
                      const paySt = getLaborPaymentStatus(
                        r.workerPaymentId ?? null,
                        r.status,
                        laborPayrollMode
                      );
                      const statusTone = paySt === "paid" ? "success" : "warning";
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-base)] px-3 py-3 shadow-[var(--neo-shadow-control)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={LEDGER_DATE_CLASS}>
                                {formatLedgerDate(r.date, "compact")}
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-[var(--neo-text-primary)]">
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
                              <p className="text-sm font-semibold tabular-nums tracking-normal text-[var(--neo-text-primary)]">
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
                  <div className="airtable-table-scroll overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                          <th className={cn(ledgerHeaderCell, "pl-4")}>Date</th>
                          <th className={ledgerHeaderCell}>Session</th>
                          <th className={ledgerHeaderCell}>Project</th>
                          <th className={ledgerHeaderCellRight}>Amount</th>
                          <th className={cn(ledgerHeaderCell, "pr-4")}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laborEntries.map((r) => {
                          const paySt = getLaborPaymentStatus(
                            r.workerPaymentId ?? null,
                            r.status,
                            laborPayrollMode
                          );
                          const statusTone = paySt === "paid" ? "success" : "warning";
                          return (
                            <tr key={r.id} className={ledgerRow}>
                              <td className={cn(ledgerCell, "pl-4")}>
                                <span className={LEDGER_DATE_CLASS}>
                                  {formatLedgerDate(r.date)}
                                </span>
                              </td>
                              <td className={ledgerCell}>{r.session ?? <Dash />}</td>
                              <td className={ledgerCell}>
                                {r.projectName ?? r.projectId ?? <Dash />}
                              </td>
                              <td className={ledgerAmountCell}>{formatCurrency(r.amount)}</td>
                              <td className="py-2.5 pr-4 align-middle">
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
              <div className="px-4 py-3 md:hidden">
                {reimbursements.length === 0 ? (
                  <EmptyLedgerState
                    title="No reimbursements"
                    subtitle="Reimbursements will appear here."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {reimbursements.map((r) => {
                      const isPaid = String(r.status).toLowerCase() === "paid";
                      const tone = isPaid ? "success" : "warning";
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-base)] px-3 py-3 shadow-[var(--neo-shadow-control)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={LEDGER_DATE_CLASS}>
                                {formatLedgerDate(r.date, "compact")}
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-[var(--neo-text-primary)]">
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
                              <p className="text-sm font-semibold tabular-nums tracking-normal text-[var(--neo-text-primary)]">
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
                  <div className="airtable-table-scroll overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                          <th className={cn(ledgerHeaderCell, "pl-4")}>Date</th>
                          <th className={ledgerHeaderCell}>Vendor</th>
                          <th className={ledgerHeaderCell}>Project</th>
                          <th className={ledgerHeaderCellRight}>Amount</th>
                          <th className={cn(ledgerHeaderCell, "pr-4")}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reimbursements.map((r) => {
                          const isPaid = String(r.status).toLowerCase() === "paid";
                          const tone = isPaid ? "success" : "warning";
                          return (
                            <tr key={r.id} className={ledgerRow}>
                              <td className={cn(ledgerCell, "pl-4")}>
                                <span className={LEDGER_DATE_CLASS}>
                                  {formatLedgerDate(r.date)}
                                </span>
                              </td>
                              <td className={ledgerCell}>{r.vendor ?? <Dash />}</td>
                              <td className={ledgerCell}>
                                {r.projectName ?? r.projectId ?? <Dash />}
                              </td>
                              <td className={ledgerAmountCell}>{formatCurrency(r.amount)}</td>
                              <td className="py-2.5 pr-4 align-middle">
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
              <div className="px-4 py-3 md:hidden">
                {payments.length === 0 ? (
                  <EmptyLedgerState title="No payments yet" subtitle="Payments will appear here." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {payments.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-base)] px-3 py-3 shadow-[var(--neo-shadow-control)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={LEDGER_DATE_CLASS}>
                              {formatLedgerDate(r.date, "compact")}
                            </p>
                            <p className="mt-0.5 text-sm text-[var(--neo-text-secondary)]">
                              {r.paymentMethod ?? <Dash />}
                            </p>
                            <p className="mt-2 text-sm text-[var(--neo-text-primary)] break-words">
                              {r.notes ?? <Dash />}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums tracking-normal text-[var(--neo-text-primary)]">
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
                  <div className="airtable-table-scroll overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                          <th className={cn(ledgerHeaderCell, "pl-4")}>Date</th>
                          <th className={ledgerHeaderCellRight}>Amount</th>
                          <th className={ledgerHeaderCell}>Method</th>
                          <th className={cn(ledgerHeaderCell, "pr-4")}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((r) => (
                          <tr key={r.id} className={ledgerRow}>
                            <td className={cn(ledgerCell, "pl-4")}>
                              <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(r.date)}</span>
                            </td>
                            <td className={ledgerAmountCell}>{formatCurrency(r.amount)}</td>
                            <td className={ledgerCell}>{r.paymentMethod ?? <Dash />}</td>
                            <td className="py-2.5 pr-4 align-middle text-[13px] leading-snug text-[var(--neo-text-secondary)]">
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
            <p className="text-xs leading-relaxed text-[var(--neo-text-tertiary)]">
              Select items to include in this payment. Total will be calculated automatically.
            </p>

            {unpaidLabor.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--neo-text-tertiary)] mb-2">
                  Unpaid labor entries
                </p>
                <div className="max-h-32 overflow-y-auto border border-[var(--neo-border)] rounded-sm divide-y divide-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                  {unpaidLabor.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--neo-surface-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLaborIds.has(e.id)}
                        onChange={() => toggleLabor(e.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate text-[var(--neo-text-secondary)]">
                        {formatLedgerDate(e.date, "compact")} · {e.projectName ?? "—"}
                      </span>
                      <span className="text-sm tabular-nums font-semibold tracking-tight text-[var(--neo-text-primary)]">
                        {formatCurrency(e.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {unpaidReimb.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--neo-text-tertiary)] mb-2">
                  Unpaid reimbursements
                </p>
                <div className="max-h-32 overflow-y-auto border border-[var(--neo-border)] rounded-sm divide-y divide-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                  {unpaidReimb.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--neo-surface-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedReimbIds.has(r.id)}
                        onChange={() => toggleReimb(r.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm flex-1 truncate text-[var(--neo-text-secondary)]">
                        {formatLedgerDate(r.date, "compact")} · {r.vendor ?? "—"}
                      </span>
                      <span className="text-sm tabular-nums font-semibold tracking-tight text-[var(--neo-text-primary)]">
                        {formatCurrency(r.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-[var(--neo-border)] pt-3">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3 text-[var(--neo-text-secondary)]">
                  <dt>Selected payable</dt>
                  <dd className="tabular-nums">{formatCurrency(totalPaymentAmount)}</dd>
                </div>
                {advanceDeductionAmount > 0 ? (
                  <div className="flex justify-between gap-3 text-[var(--neo-text-secondary)]">
                    <dt>Advance deduction</dt>
                    <dd className="tabular-nums">-{formatCurrency(advanceDeductionAmount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 pt-1 text-sm font-semibold">
                  <dt>Total Payment Amount</dt>
                  <dd className="tabular-nums">{formatCurrency(netPaymentAmount)}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--neo-text-primary)]">
                    Split payment
                  </p>
                </div>
                {netPaymentAmount > 0 ? (
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

              <div className="mt-2 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-2">
                {splitRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--neo-border)] px-3 py-3">
                    <p className="text-sm text-[var(--neo-text-tertiary)]">
                      No payment methods yet.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--neo-border)]">
                    {splitRows.map((r, idx) => {
                      const amt = Number(r.amount);
                      const amtText = Number.isFinite(amt) ? formatCurrency(amt) : "—";
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--neo-text-secondary)] truncate">
                              <span className="font-medium text-[var(--neo-text-primary)]">
                                {r.method || "—"}
                              </span>{" "}
                              <span className="text-[var(--neo-text-tertiary)]">·</span>{" "}
                              <span className="tabular-nums font-semibold tracking-tight text-[var(--neo-text-primary)]">
                                {amtText}
                              </span>
                              {r.reference?.trim() ? (
                                <>
                                  {" "}
                                  <span className="text-[var(--neo-text-tertiary)]">·</span>{" "}
                                  <span className="text-[var(--neo-text-tertiary)] truncate">
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
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-[var(--neo-text-tertiary)] hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-text-primary)] sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
                              onClick={() => openEditSplit(r)}
                              aria-label={`Edit payment split ${idx + 1}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-[var(--neo-text-tertiary)] hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-text-primary)] sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
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
                      "px-2 text-[var(--neo-text-secondary)] hover:text-[var(--neo-text-primary)] hover:bg-transparent",
                      "min-h-[44px] sm:min-h-9 text-xs"
                    )}
                    onClick={openAddSplit}
                    disabled={totalPaymentAmount <= 0}
                  >
                    <Plus className="mr-2 h-4 w-4 text-[var(--neo-text-tertiary)]" aria-hidden />
                    Add payment
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--neo-text-tertiary)] block">
                Payment date
              </label>
              <FinanceDatePicker value={payDate} onChange={setPayDate} size="md" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--neo-text-tertiary)] block">
                Notes (optional)
              </label>
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

            <div className="flex justify-end gap-2 border-t border-[var(--neo-border)] pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPayModalOpen(false)}
                className={neoSecondaryButton}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className={neoPrimaryButton}
                disabled={
                  paySubmitting ||
                  totalPaymentAmount <= 0 ||
                  netPaymentAmount <= 0 ||
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
              <label className="block text-xs font-medium text-[var(--neo-text-tertiary)]">
                Method
              </label>
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
              <label className="block text-xs font-medium text-[var(--neo-text-tertiary)]">
                Amount
              </label>
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
              <label className="block text-xs font-medium text-[var(--neo-text-tertiary)]">
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

          <div className="flex justify-end gap-2 border-t border-[var(--neo-border)] pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSplitEditorOpen(false)}
              className={neoSecondaryButton}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveSplitDraft}
              disabled={totalPaymentAmount <= 0}
              className={neoPrimaryButton}
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
