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
import { getLaborPaymentStatus, type LaborPayrollSettlementMode } from "@/lib/labor-balance-shared";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { statusChipClass } from "@/lib/typography";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
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
import { workerRateLocalYmd } from "@/lib/worker-rate-date";
import {
  idempotentSubmissionForPayload,
  type IdempotentSubmission,
} from "@/lib/financial-idempotency";

type LaborEntryRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  daysWorked?: number | null;
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

type AdvanceRow = {
  id: string;
  date: string;
  amount: number;
  status: string;
};

type LaborMonthGroup = {
  key: string;
  label: string;
  entries: LaborEntryRow[];
  entryCount: number;
  days: number;
  amount: number;
};

type ReimbursementMonthGroup = {
  key: string;
  label: string;
  entries: ReimbursementRow[];
  entryCount: number;
  amount: number;
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
  "min-h-[44px] w-full rounded-full border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 text-hh-table-cell font-semibold text-[var(--hh-text-primary)] shadow-operational transition-colors duration-150 hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)] sm:min-h-9 sm:w-auto";

const neoPrimaryButton =
  "min-h-[44px] w-full rounded-full border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-4 text-hh-table-cell font-semibold text-[var(--hh-action-primary)] shadow-operational transition-colors duration-150 border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] focus-visible:ring-[var(--hh-focus-ring)] disabled:border-[var(--hh-border)] disabled:bg-[var(--hh-l3-hover)] disabled:text-[var(--hh-text-tertiary)] sm:min-h-9 sm:w-auto";

const neoDialogContent =
  "w-[min(520px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-5 text-[var(--hh-text-primary)] shadow-operational  [&>button]:right-4 [&>button]:top-4 [&>button]:h-9 [&>button]:w-9 [&>button]:rounded-hh-standard [&>button]:border [&>button]:border-[var(--hh-border)] [&>button]:bg-[var(--hh-l3-hover)] [&>button]:text-[var(--hh-text-secondary)] [&>button]:opacity-100 [&>button]:bg-[var(--hh-l3-hover)] [&>button]:hover:text-[var(--hh-text-primary)]";

const neoFieldClass =
  "min-h-[44px] rounded-hh-task border !border-[var(--hh-border)] !bg-[var(--hh-l1-workspace)] px-3 text-sm text-[var(--hh-text-primary)] shadow-operational placeholder:text-[var(--hh-text-tertiary)] focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)] ";

const neoCheckboxClass =
  "h-5 w-5 shrink-0 rounded border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] accent-[var(--hh-action-primary)]";

const ledgerHeaderCell =
  "py-2.5 pr-3 text-left text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]";

const ledgerHeaderCellRight = cn(ledgerHeaderCell, "text-right tabular-nums");

const ledgerRow =
  "border-b border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--hh-l3-hover)]";

const ledgerCell =
  "py-2.5 pr-3 align-middle text-hh-table-cell leading-snug text-[var(--hh-text-secondary)]";

const ledgerAmountCell =
  "py-2.5 pr-3 text-right align-middle text-hh-table-cell font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)] whitespace-nowrap";

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
      ? "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)]"
      : emphasis === "overpaid"
        ? "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
        : emphasis === "settled"
          ? "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)]"
          : "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]";

  const valueClass =
    emphasis === "owed"
      ? "text-[var(--hh-action-primary)]"
      : emphasis === "overpaid"
        ? "text-[var(--hh-danger)]"
        : emphasis === "settled"
          ? "text-[var(--hh-success)]"
          : "text-[var(--hh-text-primary)]";

  return (
    <div
      className={cn(
        "min-h-[76px] rounded-hh-task border px-3 py-3 shadow-operational",
        "flex flex-col justify-between",
        emphasisClass
      )}
    >
      <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
        {label}
      </p>
      <p
        className={cn(
          "text-hh-financial-total font-semibold tabular-nums tracking-normal whitespace-nowrap",
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
      ? "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)]"
      : tone === "overpaid"
        ? "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
        : "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)]";

  return (
    <div
      className={cn(
        "rounded-hh-task border px-4 py-3 shadow-operational",
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        shellClass
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "owed"
              ? "text-[var(--hh-action-primary)]"
              : tone === "overpaid"
                ? "text-[var(--hh-danger)]"
                : "text-[var(--hh-success)]"
          )}
          aria-hidden
        />
        <span className={chip.className}>{chip.label}</span>
        <span className="truncate text-sm font-medium text-[var(--hh-text-primary)]">
          {recommendationLabel(tone)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 sm:justify-end">
        <span className="text-xs text-[var(--hh-text-tertiary)] sm:hidden">Balance</span>
        <span
          className={cn(
            "text-hh-section-title font-semibold tabular-nums tracking-normal",
            tone === "owed"
              ? "text-[var(--hh-action-primary)]"
              : tone === "overpaid"
                ? "text-[var(--hh-danger)]"
                : "text-[var(--hh-success)]"
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
    <section className="overflow-hidden rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational">
      <header className="flex flex-col gap-1.5 border-b border-[var(--hh-border)] px-4 py-3.5">
        <h2 className="text-hh-metadata font-semibold uppercase tracking-normal text-[var(--hh-text-primary)]">
          {title}
        </h2>
        <p className="text-hh-table-cell leading-relaxed text-[var(--hh-text-secondary)]">
          {description}
        </p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function EmptyLedgerState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="m-4 rounded-hh-task border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l3-hover)] px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--hh-text-primary)]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--hh-text-secondary)]">{subtitle}</p>
    </div>
  );
}

function Dash() {
  return <span className="text-[var(--hh-text-tertiary)]">—</span>;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function entryDays(entry: LaborEntryRow): number {
  const explicit = Number(entry.daysWorked);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const session = String(entry.session ?? "").toLowerCase();
  if (session.includes("full")) return 1;
  if (session.includes("half") || session.includes("morning") || session.includes("afternoon")) {
    return 0.5;
  }
  return 0;
}

function formatDays(days: number): string {
  const rounded = Math.round((days + Number.EPSILON) * 10) / 10;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${
    Math.abs(rounded - 1) < 0.0001 ? "day" : "days"
  }`;
}

function monthKeyForDate(date: string): string {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "unknown";
}

function monthLabel(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return "Undated";
  const [year, month] = key.split("-").map((part) => Number(part));
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function groupLaborByMonth(entries: LaborEntryRow[]): LaborMonthGroup[] {
  const byMonth = new Map<string, LaborEntryRow[]>();
  for (const entry of entries) {
    const key = monthKeyForDate(entry.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }
  return [...byMonth.entries()]
    .map(([key, rows]) => ({
      key,
      label: monthLabel(key),
      entries: rows,
      entryCount: rows.length,
      days: rows.reduce((sum, entry) => sum + entryDays(entry), 0),
      amount: rows.reduce((sum, entry) => sum + entry.amount, 0),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function groupReimbursementsByMonth(entries: ReimbursementRow[]): ReimbursementMonthGroup[] {
  const byMonth = new Map<string, ReimbursementRow[]>();
  for (const entry of entries) {
    const key = monthKeyForDate(entry.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }
  return [...byMonth.entries()]
    .map(([key, rows]) => ({
      key,
      label: monthLabel(key),
      entries: rows,
      entryCount: rows.length,
      amount: rows.reduce((sum, entry) => sum + entry.amount, 0),
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function buildAdvancePlan(rows: AdvanceRow[], payableTotal: number) {
  let remainingCents = Math.max(0, Math.round(payableTotal * 100));
  const selected: AdvanceRow[] = [];
  for (const advance of [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  )) {
    const cents = Math.round(Math.max(0, advance.amount) * 100);
    if (cents <= 0 || cents > remainingCents) continue;
    selected.push(advance);
    remainingCents -= cents;
  }
  const amount = selected.reduce((sum, advance) => sum + advance.amount, 0);
  return { rows: selected, ids: selected.map((advance) => advance.id), amount: roundMoney(amount) };
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
  const [advances, setAdvances] = React.useState<AdvanceRow[]>([]);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = React.useState(false);
  const [payDate, setPayDate] = React.useState(() => workerRateLocalYmd());
  const [payNotes, setPayNotes] = React.useState("");
  const [selectedLaborIds, setSelectedLaborIds] = React.useState<Set<string>>(new Set());
  const [selectedReimbIds, setSelectedReimbIds] = React.useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = React.useState<Set<string>>(new Set());
  const [expandedReimbMonths, setExpandedReimbMonths] = React.useState<Set<string>>(new Set());
  const [paySubmitting, setPaySubmitting] = React.useState(false);
  const atomicPayrollSubmissionRef = React.useRef<IdempotentSubmission | null>(null);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [laborPayrollMode, setLaborPayrollMode] =
    React.useState<LaborPayrollSettlementMode>("payment_link");
  const [receiptPaymentId, setReceiptPaymentId] = React.useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [lastPaymentMonth, setLastPaymentMonth] = React.useState<string | null>(null);
  const statementMonth = lastPaymentMonth ?? workerRateLocalYmd().slice(0, 7);
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
          daysWorked:
            e.daysWorked != null && Number.isFinite(Number(e.daysWorked))
              ? Number(e.daysWorked)
              : null,
          workerPaymentId: e.workerPaymentId ?? null,
          payrollSettled: Boolean(e.payrollSettled),
        }))
      );
      setReimbursements(data.reimbursements ?? []);
      setAdvances(data.advances ?? []);
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
  const laborGroups = React.useMemo(() => groupLaborByMonth(unpaidLabor), [unpaidLabor]);
  const reimbGroups = React.useMemo(() => groupReimbursementsByMonth(unpaidReimb), [unpaidReimb]);
  const selectedLaborEntries = React.useMemo(
    () => unpaidLabor.filter((entry) => selectedLaborIds.has(entry.id)),
    [selectedLaborIds, unpaidLabor]
  );
  const selectedReimbursements = React.useMemo(
    () => unpaidReimb.filter((row) => selectedReimbIds.has(row.id)),
    [selectedReimbIds, unpaidReimb]
  );
  const selectedLaborTotal = React.useMemo(
    () => selectedLaborEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [selectedLaborEntries]
  );
  const selectedReimbursementTotal = React.useMemo(
    () => selectedReimbursements.reduce((sum, entry) => sum + entry.amount, 0),
    [selectedReimbursements]
  );
  const selectedLaborMonthKeys = React.useMemo(
    () => new Set(selectedLaborEntries.map((entry) => monthKeyForDate(entry.date))),
    [selectedLaborEntries]
  );
  const selectedReimbMonthKeys = React.useMemo(
    () => new Set(selectedReimbursements.map((entry) => monthKeyForDate(entry.date))),
    [selectedReimbursements]
  );
  const selectedLaborMonthLabels = React.useMemo(() => {
    return laborGroups
      .filter((group) => selectedLaborMonthKeys.has(group.key))
      .map((group) => {
        const selectedCount = group.entries.filter((entry) =>
          selectedLaborIds.has(entry.id)
        ).length;
        return `${group.label}${selectedCount < group.entryCount ? " (partial)" : ""}`;
      });
  }, [laborGroups, selectedLaborIds, selectedLaborMonthKeys]);
  const selectedReimbMonthLabels = React.useMemo(() => {
    return reimbGroups
      .filter((group) => selectedReimbMonthKeys.has(group.key))
      .map((group) => {
        const selectedCount = group.entries.filter((entry) =>
          selectedReimbIds.has(entry.id)
        ).length;
        return `${group.label}${selectedCount < group.entryCount ? " (partial)" : ""}`;
      });
  }, [reimbGroups, selectedReimbIds, selectedReimbMonthKeys]);
  const isPartialMonthPayment = React.useMemo(
    () =>
      laborGroups.some((group) => {
        const selectedCount = group.entries.filter((entry) =>
          selectedLaborIds.has(entry.id)
        ).length;
        return selectedCount > 0 && selectedCount < group.entryCount;
      }),
    [laborGroups, selectedLaborIds]
  );
  const isPartialReimbursementMonthPayment = React.useMemo(
    () =>
      reimbGroups.some((group) => {
        const selectedCount = group.entries.filter((entry) =>
          selectedReimbIds.has(entry.id)
        ).length;
        return selectedCount > 0 && selectedCount < group.entryCount;
      }),
    [reimbGroups, selectedReimbIds]
  );
  const hasPaySelection = selectedLaborEntries.length > 0 || selectedReimbursements.length > 0;

  React.useEffect(() => {
    setSelectedLaborIds((prev) => {
      const valid = new Set(unpaidLabor.map((entry) => entry.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      const same = next.size === prev.size && [...next].every((id) => prev.has(id));
      return same ? prev : next;
    });
  }, [unpaidLabor]);

  React.useEffect(() => {
    setSelectedReimbIds((prev) => {
      const valid = new Set(unpaidReimb.map((row) => row.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      const same = next.size === prev.size && [...next].every((id) => prev.has(id));
      return same ? prev : next;
    });
  }, [unpaidReimb]);

  React.useEffect(() => {
    setExpandedMonths((prev) => {
      const valid = new Set(laborGroups.map((group) => group.key));
      const next = new Set([...prev].filter((key) => valid.has(key)));
      if (next.size === 0 && laborGroups[0]) next.add(laborGroups[0].key);
      return next;
    });
  }, [laborGroups]);

  React.useEffect(() => {
    setExpandedReimbMonths((prev) => {
      const valid = new Set(reimbGroups.map((group) => group.key));
      const next = new Set([...prev].filter((key) => valid.has(key)));
      if (next.size === 0 && reimbGroups[0]) next.add(reimbGroups[0].key);
      return next;
    });
  }, [reimbGroups]);

  const totalPaymentAmount = React.useMemo(() => {
    return selectedLaborTotal + selectedReimbursementTotal;
  }, [selectedLaborTotal, selectedReimbursementTotal]);
  const includedReimbursementTotal = selectedReimbursementTotal;
  const advancePlan = React.useMemo(
    () => buildAdvancePlan(advances, totalPaymentAmount),
    [advances, totalPaymentAmount]
  );
  const advanceDeductionAmount = React.useMemo(() => {
    if (totalPaymentAmount <= 0) return 0;
    return advancePlan.amount;
  }, [advancePlan.amount, totalPaymentAmount]);
  const netPaymentAmount = React.useMemo(
    () => Math.max(0, roundMoney(totalPaymentAmount - advanceDeductionAmount)),
    [advanceDeductionAmount, totalPaymentAmount]
  );
  const unappliedAdvanceAmount = React.useMemo(
    () => Math.max(0, roundMoney((summary?.advances ?? 0) - advanceDeductionAmount)),
    [advanceDeductionAmount, summary?.advances]
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
    if (!hasPaySelection) return;
    const initialTotal = totalPaymentAmount;
    const initialAdvanceDeduction = buildAdvancePlan(advances, initialTotal).amount;
    const initialCashTotal = Math.max(0, roundMoney(initialTotal - initialAdvanceDeduction));
    setPayDate(workerRateLocalYmd());
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

  const toggleMonthExpanded = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleMonthSelection = (group: LaborMonthGroup) => {
    setSelectedLaborIds((prev) => {
      const next = new Set(prev);
      const allSelected = group.entries.every((entry) => next.has(entry.id));
      for (const entry of group.entries) {
        if (allSelected) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };

  const clearPaySelection = () => {
    setSelectedLaborIds(new Set());
    setSelectedReimbIds(new Set());
  };

  const toggleReimb = (id: string) => {
    setSelectedReimbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleReimbMonthExpanded = (key: string) => {
    setExpandedReimbMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleReimbMonthSelection = (group: ReimbursementMonthGroup) => {
    setSelectedReimbIds((prev) => {
      const next = new Set(prev);
      const allSelected = group.entries.every((entry) => next.has(entry.id));
      for (const entry of group.entries) {
        if (allSelected) next.delete(entry.id);
        else next.add(entry.id);
      }
      return next;
    });
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId || !hasPaySelection || totalPaymentAmount <= 0 || netPaymentAmount <= 0) return;
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
      const requestBody = {
        amount: netPaymentAmount,
        payment_method: method,
        payment_date: submittedPaymentDate,
        notes: payNotes.trim() || null,
        labor_entry_ids: Array.from(selectedLaborIds).sort(),
        reimbursement_ids: Array.from(selectedReimbIds).sort(),
        advance_deduction_amount: advanceDeductionAmount,
      };
      atomicPayrollSubmissionRef.current = idempotentSubmissionForPayload(
        atomicPayrollSubmissionRef.current,
        requestBody
      );
      const res = await fetch(`/api/labor/workers/${workerId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestBody,
          idempotency_key: atomicPayrollSubmissionRef.current.key,
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
      atomicPayrollSubmissionRef.current = null;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (!workerId) {
    return (
      <div className=" page-shell-standard mx-auto px-4 py-6">
        <p className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 text-sm text-[var(--hh-text-secondary)]">
          Worker not found.
        </p>
      </div>
    );
  }

  return (
    <div className=" page-shell-wide mx-auto flex w-full min-w-0 flex-col gap-4 overflow-x-hidden px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] md:px-6 md:py-6">
      <header className="border-b border-[var(--hh-border)] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <h1 className="text-hh-financial-total leading-tight font-semibold tracking-normal text-[var(--hh-text-primary)] md:text-hh-financial-total">
              {worker?.name ?? "Worker Balance"}
            </h1>
            <p className="mt-1 max-w-2xl text-hh-section-title leading-relaxed text-[var(--hh-text-secondary)]">
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
              disabled={loading || !hasPaySelection}
            >
              <SubmitSpinner loading={paySubmitting} className="mr-2" />
              {paySubmitting ? "Saving…" : "Pay Selected"}
            </Button>
          </div>
        </div>
      </header>

      {message ? (
        <p className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 text-sm text-[var(--hh-text-secondary)] shadow-operational">
          {message}
        </p>
      ) : null}

      {lastPaymentMonth ? (
        <div
          data-testid="worker-payment-next-actions"
          className={cn(
            "flex flex-col gap-3 rounded-hh-task border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] px-4 py-3 shadow-operational",
            "sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--hh-text-primary)]">
                Payment saved
              </p>
              <p className="truncate text-xs text-[var(--hh-text-secondary)]">
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
        <p className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-6 text-sm text-[var(--hh-text-secondary)] shadow-operational">
          Loading…
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {/* Summary KPI tiles */}
            {summary != null && (
              <div
                data-testid="worker-balance-summary"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
              >
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
              description="Open labor payable for this worker. Paid entries move to Payments and Statements."
            >
              {laborGroups.length === 0 ? (
                <EmptyLedgerState
                  title="No unpaid labor entries"
                  subtitle="Paid labor entries are available from Payments and Statements."
                />
              ) : (
                <div className="divide-y divide-[var(--hh-border)]">
                  {laborGroups.map((group) => {
                    const expanded = expandedMonths.has(group.key);
                    const selectedCount = group.entries.filter((entry) =>
                      selectedLaborIds.has(entry.id)
                    ).length;
                    const allSelected = selectedCount === group.entryCount;
                    const partiallySelected = selectedCount > 0 && !allSelected;
                    return (
                      <section key={group.key} data-testid={`worker-balance-month-${group.key}`}>
                        <div className="flex flex-col gap-3 bg-[var(--hh-l1-workspace)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-hh-standard text-left transition-colors duration-150 hover:text-[var(--hh-action-primary)]"
                            onClick={() => toggleMonthExpanded(group.key)}
                            aria-expanded={expanded}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]">
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform duration-150",
                                  expanded ? "rotate-0" : "-rotate-90"
                                )}
                                aria-hidden
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[var(--hh-text-primary)]">
                                {group.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-[var(--hh-text-secondary)]">
                                {group.entryCount} {group.entryCount === 1 ? "entry" : "entries"} ·{" "}
                                {formatDays(group.days)} · {formatCurrency(group.amount)}
                              </span>
                            </span>
                          </button>
                          <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-xs font-semibold text-[var(--hh-text-primary)] shadow-operational sm:justify-start">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(node) => {
                                if (node) node.indeterminate = partiallySelected;
                              }}
                              onChange={() => toggleMonthSelection(group)}
                              className="h-5 w-5 rounded border-[var(--hh-border)] bg-transparent accent-[var(--hh-action-primary)]"
                              aria-label={`${allSelected ? "Unselect" : "Select"} ${
                                group.label
                              } labor entries`}
                            />
                            <span>{allSelected ? "Unselect month" : "Select month"}</span>
                          </label>
                        </div>

                        {expanded ? (
                          <>
                            <div className="px-4 pb-3 md:hidden">
                              <div className="flex flex-col gap-2">
                                {group.entries.map((r) => (
                                  <label
                                    key={r.id}
                                    className="flex min-h-[64px] items-start gap-3 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3 shadow-operational"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedLaborIds.has(r.id)}
                                      onChange={() => toggleLabor(r.id)}
                                      className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--hh-border)] bg-transparent accent-[var(--hh-action-primary)]"
                                      aria-label={`Select ${formatLedgerDate(
                                        r.date,
                                        "compact"
                                      )} labor entry`}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className={LEDGER_DATE_CLASS}>
                                        {formatLedgerDate(r.date, "compact")}
                                      </span>
                                      <span className="mt-0.5 block text-sm font-medium text-[var(--hh-text-primary)]">
                                        {r.session ?? "—"} · {r.projectName ?? r.projectId ?? "—"}
                                      </span>
                                      <span className="mt-1 block text-xs text-[var(--hh-text-secondary)]">
                                        {formatDays(entryDays(r))}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                                      {formatCurrency(r.amount)}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="hidden md:block">
                              <div className="airtable-table-scroll overflow-x-auto">
                                <table className="w-full min-w-[760px] border-collapse text-sm">
                                  <thead>
                                    <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
                                      <th className={cn(ledgerHeaderCell, "w-12 pl-4")}>Select</th>
                                      <th className={ledgerHeaderCell}>Date</th>
                                      <th className={ledgerHeaderCell}>Session</th>
                                      <th className={ledgerHeaderCell}>Project</th>
                                      <th className={ledgerHeaderCellRight}>Days</th>
                                      <th className={cn(ledgerHeaderCellRight, "pr-4")}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.entries.map((r) => (
                                      <tr key={r.id} className={ledgerRow}>
                                        <td className="py-2.5 pl-4 pr-3 align-middle">
                                          <input
                                            type="checkbox"
                                            checked={selectedLaborIds.has(r.id)}
                                            onChange={() => toggleLabor(r.id)}
                                            className="h-5 w-5 rounded border-[var(--hh-border)] bg-transparent accent-[var(--hh-action-primary)]"
                                            aria-label={`Select ${formatLedgerDate(
                                              r.date
                                            )} labor entry`}
                                          />
                                        </td>
                                        <td className={ledgerCell}>
                                          <span className={LEDGER_DATE_CLASS}>
                                            {formatLedgerDate(r.date)}
                                          </span>
                                        </td>
                                        <td className={ledgerCell}>{r.session ?? <Dash />}</td>
                                        <td className={ledgerCell}>
                                          {r.projectName ?? r.projectId ?? <Dash />}
                                        </td>
                                        <td className={ledgerAmountCell}>
                                          {formatDays(entryDays(r))}
                                        </td>
                                        <td className={cn(ledgerAmountCell, "pr-4")}>
                                          {formatCurrency(r.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </LedgerSection>

            <div className="sticky bottom-3 z-20 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] px-4 py-3 shadow-operational  supports-[backdrop-filter]:bg-[var(--hh-l5-task-surface)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      Selected labor
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--hh-text-primary)]">
                      {selectedLaborEntries.length}{" "}
                      {selectedLaborEntries.length === 1 ? "entry" : "entries"} ·{" "}
                      <span className="tabular-nums">{formatCurrency(selectedLaborTotal)}</span>
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      Selected reimb.
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--hh-text-primary)]">
                      {selectedReimbursements.length}{" "}
                      {selectedReimbursements.length === 1 ? "item" : "items"} ·{" "}
                      <span className="tabular-nums">
                        {formatCurrency(selectedReimbursementTotal)}
                      </span>
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                      Estimated cash
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--hh-action-primary)]">
                      {formatCurrency(netPaymentAmount)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={neoSecondaryButton}
                    onClick={clearPaySelection}
                    disabled={!hasPaySelection}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={neoPrimaryButton}
                    onClick={openPayModal}
                    disabled={!hasPaySelection}
                  >
                    Pay Selected
                  </Button>
                </div>
              </div>
            </div>

            <LedgerSection
              title="Reimbursements"
              description="Open reimbursements available for the next worker payment."
            >
              {reimbGroups.length === 0 ? (
                <EmptyLedgerState
                  title="No open reimbursements"
                  subtitle="Paid reimbursements are available from Payments and Statements."
                />
              ) : (
                <div className="divide-y divide-[var(--hh-border)]">
                  {reimbGroups.map((group) => {
                    const expanded = expandedReimbMonths.has(group.key);
                    const selectedCount = group.entries.filter((entry) =>
                      selectedReimbIds.has(entry.id)
                    ).length;
                    const allSelected = selectedCount === group.entryCount;
                    const partiallySelected = selectedCount > 0 && !allSelected;
                    return (
                      <section
                        key={group.key}
                        data-testid={`worker-balance-reimbursement-month-${group.key}`}
                      >
                        <div className="flex flex-col gap-3 bg-[var(--hh-l1-workspace)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-hh-standard text-left transition-colors duration-150 hover:text-[var(--hh-action-primary)]"
                            onClick={() => toggleReimbMonthExpanded(group.key)}
                            aria-expanded={expanded}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]">
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform duration-150",
                                  expanded ? "rotate-0" : "-rotate-90"
                                )}
                                aria-hidden
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[var(--hh-text-primary)]">
                                {group.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-[var(--hh-text-secondary)]">
                                {group.entryCount}{" "}
                                {group.entryCount === 1 ? "reimbursement" : "reimbursements"} ·{" "}
                                {formatCurrency(group.amount)}
                              </span>
                            </span>
                          </button>
                          <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-xs font-semibold text-[var(--hh-text-primary)] shadow-operational sm:justify-start">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(node) => {
                                if (node) node.indeterminate = partiallySelected;
                              }}
                              onChange={() => toggleReimbMonthSelection(group)}
                              className={neoCheckboxClass}
                              aria-label={`${allSelected ? "Unselect" : "Select"} ${
                                group.label
                              } reimbursements`}
                            />
                            <span>{allSelected ? "Unselect month" : "Select month"}</span>
                          </label>
                        </div>

                        {expanded ? (
                          <>
                            <div className="px-4 pb-3 md:hidden">
                              <div className="flex flex-col gap-2">
                                {group.entries.map((r) => (
                                  <label
                                    key={r.id}
                                    className="flex min-h-[64px] items-start gap-3 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3 shadow-operational"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedReimbIds.has(r.id)}
                                      onChange={() => toggleReimb(r.id)}
                                      className={cn(neoCheckboxClass, "mt-1")}
                                      aria-label={`Select ${formatLedgerDate(
                                        r.date,
                                        "compact"
                                      )} reimbursement`}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className={LEDGER_DATE_CLASS}>
                                        {formatLedgerDate(r.date, "compact")}
                                      </span>
                                      <span className="mt-0.5 block text-sm font-medium text-[var(--hh-text-primary)]">
                                        {r.vendor ?? "—"} · {r.projectName ?? r.projectId ?? "—"}
                                      </span>
                                      <span className="mt-2 inline-flex">
                                        <span
                                          className={cn(
                                            statusChipClass("warning"),
                                            "rounded-hh-compact px-2 py-0.5 text-hh-status leading-none"
                                          )}
                                        >
                                          {r.status}
                                        </span>
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                                      {formatCurrency(r.amount)}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="hidden md:block">
                              <div className="airtable-table-scroll overflow-x-auto">
                                <table className="w-full min-w-[760px] border-collapse text-sm">
                                  <thead>
                                    <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
                                      <th className={cn(ledgerHeaderCell, "w-12 pl-4")}>Select</th>
                                      <th className={ledgerHeaderCell}>Date</th>
                                      <th className={ledgerHeaderCell}>Vendor</th>
                                      <th className={ledgerHeaderCell}>Project</th>
                                      <th className={ledgerHeaderCell}>Status</th>
                                      <th className={cn(ledgerHeaderCellRight, "pr-4")}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.entries.map((r) => (
                                      <tr key={r.id} className={ledgerRow}>
                                        <td className="py-2.5 pl-4 pr-3 align-middle">
                                          <input
                                            type="checkbox"
                                            checked={selectedReimbIds.has(r.id)}
                                            onChange={() => toggleReimb(r.id)}
                                            className={neoCheckboxClass}
                                            aria-label={`Select ${formatLedgerDate(
                                              r.date
                                            )} reimbursement`}
                                          />
                                        </td>
                                        <td className={ledgerCell}>
                                          <span className={LEDGER_DATE_CLASS}>
                                            {formatLedgerDate(r.date)}
                                          </span>
                                        </td>
                                        <td className={ledgerCell}>{r.vendor ?? <Dash />}</td>
                                        <td className={ledgerCell}>
                                          {r.projectName ?? r.projectId ?? <Dash />}
                                        </td>
                                        <td className="py-2.5 pr-3 align-middle">
                                          <span
                                            className={cn(
                                              statusChipClass("warning"),
                                              "rounded-hh-compact px-2 py-0.5 text-hh-status leading-none"
                                            )}
                                          >
                                            {r.status}
                                          </span>
                                        </td>
                                        <td className={cn(ledgerAmountCell, "pr-4")}>
                                          {formatCurrency(r.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
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
                        className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] px-3 py-3 shadow-operational"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={LEDGER_DATE_CLASS}>
                              {formatLedgerDate(r.date, "compact")}
                            </p>
                            <p className="mt-0.5 text-sm text-[var(--hh-text-secondary)]">
                              {r.paymentMethod ?? <Dash />}
                            </p>
                            <p className="mt-2 text-sm text-[var(--hh-text-primary)] break-words">
                              {r.notes ?? <Dash />}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
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
                        <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
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
                            <td className="py-2.5 pr-4 align-middle text-hh-table-cell leading-snug text-[var(--hh-text-secondary)]">
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
        <DialogContent className={cn(neoDialogContent, "max-w-[520px]")}>
          <DialogHeader className="border-b border-[var(--hh-border)] pb-3 pr-10">
            <DialogTitle className="text-base font-semibold text-[var(--hh-text-primary)]">
              Pay Worker
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePaySubmit} className="space-y-5 pt-1">
            <p className="text-xs leading-relaxed text-[var(--hh-text-tertiary)]">
              Confirm the selected labor entries, reimbursements, advance deduction, and cash
              payment.
            </p>

            <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Selected labor
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--hh-text-primary)]">
                    {selectedLaborEntries.length}{" "}
                    {selectedLaborEntries.length === 1 ? "entry" : "entries"} ·{" "}
                    {selectedLaborMonthLabels.length > 0
                      ? selectedLaborMonthLabels.join(", ")
                      : "No month selected"}
                  </p>
                  {isPartialMonthPayment ? (
                    <p className="mt-1 text-xs font-medium text-[var(--hh-action-primary)]">
                      Partial month payment
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                  {formatCurrency(selectedLaborTotal)}
                </p>
              </div>
            </div>

            <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    Selected reimbursements
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--hh-text-primary)]">
                    {selectedReimbursements.length}{" "}
                    {selectedReimbursements.length === 1 ? "item" : "items"} ·{" "}
                    {selectedReimbMonthLabels.length > 0
                      ? selectedReimbMonthLabels.join(", ")
                      : "No reimbursement selected"}
                  </p>
                  {isPartialReimbursementMonthPayment ? (
                    <p className="mt-1 text-xs font-medium text-[var(--hh-action-primary)]">
                      Partial reimbursement month
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                  {formatCurrency(selectedReimbursementTotal)}
                </p>
              </div>
            </div>

            {unpaidReimb.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] mb-2">
                  Reimbursements
                </p>
                <div className="max-h-40 overflow-y-auto rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] shadow-operational">
                  {unpaidReimb.map((r) => (
                    <label
                      key={r.id}
                      className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 border-b border-[var(--hh-border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--hh-l3-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedReimbIds.has(r.id)}
                        onChange={() => toggleReimb(r.id)}
                        className={neoCheckboxClass}
                      />
                      <span className="text-sm flex-1 truncate text-[var(--hh-text-secondary)]">
                        {formatLedgerDate(r.date, "compact")} · {r.vendor ?? "—"}
                      </span>
                      <span className="text-sm tabular-nums font-semibold tracking-normal text-[var(--hh-text-primary)]">
                        {formatCurrency(r.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {advances.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Open advances
                </p>
                <div className="rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] shadow-operational">
                  {advancePlan.rows.length > 0 ? (
                    <ul className="divide-y divide-[var(--hh-border)]">
                      {advancePlan.rows.map((advance) => (
                        <li
                          key={advance.id}
                          className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-[var(--hh-text-secondary)]">
                            {formatLedgerDate(advance.date, "compact")} · deduction
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums tracking-normal text-[var(--hh-danger)]">
                            -{formatCurrency(advance.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-sm text-[var(--hh-text-secondary)]">
                      No advances can be fully applied to this selection.
                    </p>
                  )}
                  {unappliedAdvanceAmount > 0.005 ? (
                    <p className="border-t border-[var(--hh-border)] px-3 py-2 text-xs text-[var(--hh-text-tertiary)]">
                      {formatCurrency(unappliedAdvanceAmount)} remains open after this payment.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="border-t border-[var(--hh-border)] pt-3">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3 text-[var(--hh-text-secondary)]">
                  <dt>Selected labor</dt>
                  <dd className="tabular-nums">{formatCurrency(selectedLaborTotal)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-[var(--hh-text-secondary)]">
                  <dt>Included reimbursements</dt>
                  <dd className="tabular-nums">{formatCurrency(includedReimbursementTotal)}</dd>
                </div>
                {advanceDeductionAmount > 0 ? (
                  <div className="flex justify-between gap-3 text-[var(--hh-text-secondary)]">
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
                  <p className="text-sm font-medium text-[var(--hh-text-primary)]">Split payment</p>
                </div>
                {netPaymentAmount > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 text-hh-status font-medium tabular-nums",
                      splitDelta === 0
                        ? "text-[var(--hh-success)]"
                        : splitDelta > 0
                          ? "text-[var(--hh-warning)]"
                          : "text-[var(--hh-danger)]"
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

              <div className="mt-2 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] p-2 shadow-operational">
                {splitRows.length === 0 ? (
                  <div className="rounded-hh-task border border-dashed border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] px-3 py-3">
                    <p className="text-sm text-[var(--hh-text-tertiary)]">
                      No payment methods yet.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--hh-border)]">
                    {splitRows.map((r, idx) => {
                      const amt = Number(r.amount);
                      const amtText = Number.isFinite(amt) ? formatCurrency(amt) : "—";
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--hh-text-secondary)] truncate">
                              <span className="font-medium text-[var(--hh-text-primary)]">
                                {r.method || "—"}
                              </span>{" "}
                              <span className="text-[var(--hh-text-tertiary)]">·</span>{" "}
                              <span className="tabular-nums font-semibold tracking-normal text-[var(--hh-text-primary)]">
                                {amtText}
                              </span>
                              {r.reference?.trim() ? (
                                <>
                                  {" "}
                                  <span className="text-[var(--hh-text-tertiary)]">·</span>{" "}
                                  <span className="text-[var(--hh-text-tertiary)] truncate">
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
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
                              onClick={() => openEditSplit(r)}
                              aria-label={`Edit payment split ${idx + 1}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 min-h-[44px] min-w-[44px] text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9"
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
                      "px-2 text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)] hover:bg-transparent",
                      "min-h-[44px] sm:min-h-9 text-xs"
                    )}
                    onClick={openAddSplit}
                    disabled={totalPaymentAmount <= 0}
                  >
                    <Plus className="mr-2 h-4 w-4 text-[var(--hh-text-tertiary)]" aria-hidden />
                    Add payment
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--hh-text-tertiary)] block">
                Payment date
              </label>
              <FinanceDatePicker value={payDate} onChange={setPayDate} size="md" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--hh-text-tertiary)] block">
                Notes (optional)
              </label>
              <Input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Optional notes"
                className={neoFieldClass}
              />
            </div>

            {payError ? (
              <p className="text-sm font-medium text-[var(--hh-danger)]">{payError}</p>
            ) : null}
            {!splitValidation.ok && splitValidation.message ? (
              <p className="text-sm font-medium text-[var(--hh-danger)]">
                {splitValidation.message}
              </p>
            ) : null}

            <div className="flex flex-col justify-end gap-2 border-t border-[var(--hh-border)] pt-3 sm:flex-row">
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
        <DialogContent
          className={cn(
            neoDialogContent,
            "max-w-[420px] max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-b-0"
          )}
        >
          <DialogHeader className="border-b border-[var(--hh-border)] pb-3 pr-10">
            <DialogTitle className="text-base font-semibold text-[var(--hh-text-primary)]">
              {splitEditorMode === "edit" ? "Edit payment" : "Add payment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--hh-text-tertiary)]">
                Method
              </label>
              <select
                value={draftMethod}
                onChange={(e) => setDraftMethod(e.target.value as SplitRow["method"])}
                className={cn(neoFieldClass, "w-full")}
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
              <label className="block text-xs font-medium text-[var(--hh-text-tertiary)]">
                Amount
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                className={cn(
                  neoFieldClass,
                  "text-right tabular-nums font-semibold tracking-normal"
                )}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--hh-text-tertiary)]">
                Reference (optional)
              </label>
              <Input
                value={draftReference}
                onChange={(e) => setDraftReference(e.target.value)}
                className={neoFieldClass}
                placeholder={draftMethod === "Check" ? "Check #" : "Optional"}
              />
            </div>

            {draftError ? (
              <p className="text-sm font-medium text-[var(--hh-danger)]">{draftError}</p>
            ) : null}
          </div>

          <div className="flex flex-col justify-end gap-2 border-t border-[var(--hh-border)] pt-3 sm:flex-row">
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
