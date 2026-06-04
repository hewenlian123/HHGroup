"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getWorkerInvoices, type WorkerInvoice } from "@/lib/data";
import type { Worker } from "@/lib/labor-db";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { formatLaborEntrySessionLabel } from "@/lib/daily-labor-db";
import {
  AlertTriangle,
  CalendarPlus,
  ChevronRight,
  FileText,
  HandCoins,
  ReceiptText,
  Upload,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { formatDate } from "@/lib/formatters";
import { workerRateLocalYmd } from "@/lib/worker-rate-date";
import { encodeWorkerReturnPath } from "@/lib/worker-return-path";

type WorkerRateHistoryView = {
  id: string;
  dailyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

type RateApplyPreview = {
  rateHistoryId: string;
  dailyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  affectedCount: number;
  oldTotal: number;
  newTotal: number;
  difference: number;
};

type WorkerBalanceLaborRow = {
  id: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
  workerPaymentId?: string | null;
  payrollSettled?: boolean;
  session?: string | null;
};

type WorkerBalanceReimbursementRow = {
  id: string;
  date: string;
  vendor: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  status: string;
};

type WorkerBalancePaymentRow = {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
};

type WorkerBalanceDetail = {
  summary: {
    laborOwed: number;
    reimbursements: number;
    payments: number;
    advances: number;
    balance: number;
  };
  laborEntries: WorkerBalanceLaborRow[];
  reimbursements: WorkerBalanceReimbursementRow[];
  payments: WorkerBalancePaymentRow[];
};

type WorkerAdvanceRow = {
  id: string;
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  advanceDate: string;
  status: string;
  notes: string | null;
};

type WorkerReceiptRow = {
  id: string;
  workerId: string | null;
  workerName: string;
  projectId: string | null;
  expenseType: string;
  vendor: string | null;
  amount: number;
  receiptUrl: string | null;
  receiptDate: string | null;
  status: string;
  reimbursementId: string | null;
  createdAt: string;
};

type WorkerDetailTab =
  | "overview"
  | "work"
  | "receipts"
  | "advances"
  | "payments"
  | "statements"
  | "rates";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function monthKeyFromDate(workDate: string): string {
  return workDate.slice(0, 7);
}

function monthLabelEn(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function todayYmd(): string {
  return workerRateLocalYmd();
}

function fmtRateRange(row: WorkerRateHistoryView): string {
  return `${row.effectiveFrom} → ${row.effectiveTo ?? "Current"}`;
}

function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: ymdLocal(start), to: ymdLocal(end) };
}

function inDateRange(date: string, from: string, to: string): boolean {
  const ymd = date.slice(0, 10);
  return ymd >= from && ymd <= to;
}

function workerStatusLabel(balance: number): string {
  if (balance > 0.005) return "Ready to pay";
  if (balance < -0.005) return "Overpaid";
  return "Settled";
}

function entryEarned(
  e: Pick<LaborEntryWithJoins, "cost_amount" | "amount_snapshot" | "labor_cost_snapshot">
): number {
  return Number(e.labor_cost_snapshot ?? e.amount_snapshot ?? e.cost_amount ?? 0) || 0;
}

type EntryDayFallbackRates = { dailyRate?: number | null; halfDayRate?: number | null };

function entryDaysWorked(
  e: Pick<
    LaborEntryWithJoins,
    | "days_worked"
    | "morning"
    | "afternoon"
    | "notes"
    | "hours"
    | "cost_amount"
    | "amount_snapshot"
    | "labor_cost_snapshot"
    | "daily_rate_snapshot"
    | "overtime_hours"
    | "overtime_amount"
  >,
  rates?: EntryDayFallbackRates
) {
  if (e.days_worked !== null && e.days_worked !== undefined) {
    const snap = Number(e.days_worked);
    if (Number.isFinite(snap) && snap >= 0) return snap;
  }

  const morning = e.morning === true;
  const afternoon = e.afternoon === true;
  if (morning && afternoon) return 1;
  if (morning || afternoon) return 0.5;

  const dailyRate = Number(e.daily_rate_snapshot ?? rates?.dailyRate ?? 0) || 0;
  const halfDayRate =
    e.daily_rate_snapshot != null
      ? Number(e.daily_rate_snapshot) / 2
      : Number(rates?.halfDayRate ?? 0) || 0;
  const session = formatLaborEntrySessionLabel(e.notes, e.hours, {
    costAmount: entryEarned(e),
    dailyRate,
    halfDayRate,
    morning: e.morning,
    afternoon: e.afternoon,
  });
  if (session === "Full") return 1;
  if (session === "Half") return 0.5;
  if (session === "Absent") return 0;

  const notes = String(e.notes ?? "");
  const overtimeOnly =
    Number(e.overtime_hours ?? 0) > 0 ||
    Number(e.overtime_amount ?? 0) > 0 ||
    /\b(?:ot|overtime)[_ -]?(?:hours?|amount)?\b/i.test(notes);
  if (overtimeOnly) return 0;

  const hours = Number(e.hours);
  if (Math.abs(hours - 1) < 0.005) return 1;
  if (Math.abs(hours - 0.5) < 0.005) return 0.5;
  return 0;
}

function fmtDays(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtDayLabel(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${fmtDays(rounded)} ${Math.abs(rounded - 1) < 0.005 ? "day" : "days"}`;
}

function fmtCountLabel(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function buildWorkMonthGroups(entries: LaborEntryWithJoins[], rates?: EntryDayFallbackRates) {
  const map = new Map<string, { days: number; earned: number }>();
  for (const e of entries) {
    const k = monthKeyFromDate(e.work_date);
    const cur = map.get(k) ?? { days: 0, earned: 0 };
    cur.days += entryDaysWorked(e, rates);
    cur.earned += entryEarned(e);
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([monthKey, v]) => ({
      monthKey,
      label: monthLabelEn(monthKey),
      workDays: v.days,
      earned: v.earned,
      entries: entries
        .filter((entry) => monthKeyFromDate(entry.work_date) === monthKey)
        .sort((a, b) => b.work_date.localeCompare(a.work_date) || b.id.localeCompare(a.id)),
      projectCount: new Set(
        entries
          .filter((entry) => monthKeyFromDate(entry.work_date) === monthKey)
          .map((entry) => entry.project_id ?? entry.project_name ?? "unassigned")
      ).size,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function buildProjectTotals(entries: LaborEntryWithJoins[], rates?: EntryDayFallbackRates) {
  const map = new Map<string, { name: string; days: number; earned: number }>();
  for (const e of entries) {
    const pid = e.project_id ?? "";
    const name = e.project_name?.trim() ? e.project_name : pid ? "(Unknown project)" : "—";
    const cur = map.get(pid) ?? { name, days: 0, earned: 0 };
    cur.days += entryDaysWorked(e, rates);
    cur.earned += entryEarned(e);
    if (cur.name === "—" && name !== "—") cur.name = name;
    map.set(pid, cur);
  }
  return Array.from(map.entries())
    .map(([projectId, v]) => ({
      projectId,
      projectName: v.name,
      workDays: v.days,
      earned: v.earned,
    }))
    .sort((a, b) => b.earned - a.earned);
}

function SummaryTile({
  label,
  value,
  meta,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  meta?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-[76px] rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-2.5",
        "flex min-w-0 flex-col justify-between text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]",
        emphasis &&
          "border-[color:rgb(184_147_90_/_0.36)] bg-[rgb(184_147_90_/_0.12)] shadow-[0_1px_0_rgba(255,255,255,0.055)_inset,0_16px_34px_rgba(0,0,0,0.26)]",
        className
      )}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-[17px] font-semibold leading-tight tabular-nums text-[var(--neo-text-primary)]",
          emphasis && "text-[var(--neo-gold-soft)]"
        )}
      >
        {value}
      </p>
      {meta ? (
        <p className="mt-1 truncate text-[11px] text-[var(--neo-text-secondary)]">{meta}</p>
      ) : null}
    </div>
  );
}

function DetailSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-background/80">
      <header className="border-b border-border/60 px-4 py-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function QuickActionLink({
  href,
  icon: Icon,
  children,
  primary = false,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={primary ? "default" : "outline"}
      className="h-9 min-h-[44px] shrink-0 gap-1.5 rounded-sm md:min-h-9"
    >
      <Link href={href}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {children}
      </Link>
    </Button>
  );
}

export default function WorkerDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;

  const [worker, setWorker] = React.useState<Worker | null | undefined>(undefined);
  const [laborLedgerEntries, setLaborLedgerEntries] = React.useState<LaborEntryWithJoins[] | null>(
    null
  );
  const [expandedMonthKeys, setExpandedMonthKeys] = React.useState<string[]>([]);
  const workDefaultOpenAppliedRef = React.useRef<string | null>(null);
  const [rateHistory, setRateHistory] = React.useState<WorkerRateHistoryView[]>([]);
  const [rateDaily, setRateDaily] = React.useState("");
  const [rateEffectiveFrom, setRateEffectiveFrom] = React.useState(() => todayYmd());
  const [rateNotes, setRateNotes] = React.useState("");
  const [rateMessage, setRateMessage] = React.useState<string | null>(null);
  const [rateBusy, setRateBusy] = React.useState(false);
  const [rateApplyPreview, setRateApplyPreview] = React.useState<RateApplyPreview | null>(null);
  const [rateApplyBusy, setRateApplyBusy] = React.useState(false);

  const [financialSummary, setFinancialSummary] = React.useState<{
    totalLabor: number;
    totalReimbursements: number;
    totalWorkerInvoices: number;
    totalPayments: number;
    balance: number;
  } | null>(null);
  const [balanceDetail, setBalanceDetail] = React.useState<WorkerBalanceDetail | null>(null);
  const [advances, setAdvances] = React.useState<WorkerAdvanceRow[]>([]);
  const [receipts, setReceipts] = React.useState<WorkerReceiptRow[]>([]);
  const [workerInvoices, setWorkerInvoices] = React.useState<WorkerInvoice[]>([]);
  const [detailMessage, setDetailMessage] = React.useState<string | null>(null);

  const [monthly, setMonthly] = React.useState<{
    earned: number;
    paid: number;
    outstanding: number;
    from: string;
    to: string;
  } | null>(null);

  const refreshAll = React.useCallback(async () => {
    if (!id) return;
    const workerResponse = await fetch(`/api/labor/workers/${id}`, { cache: "no-store" }).catch(
      () => null
    );
    const workerJson = workerResponse?.ok
      ? ((await workerResponse.json().catch(() => null)) as {
          worker?: Worker & {
            currentDailyRateEffectiveFrom?: string | null;
            rateHistory?: WorkerRateHistoryView[];
          };
          usage?: { used: boolean; reason?: "entries" | "invoices" };
          rateHistory?: WorkerRateHistoryView[];
        } | null)
      : null;
    const w = workerJson?.worker ?? null;
    setWorker(w);
    const history = workerJson?.rateHistory ?? w?.rateHistory ?? [];
    setRateHistory(history);
    if (w) {
      setRateDaily(String(Number(w.dailyRate ?? w.halfDayRate ?? 0) || ""));
      setRateEffectiveFrom(todayYmd());
      setRateNotes("");
      setRateMessage(null);
    }
    if (w) {
      setDetailMessage(null);
      const ledgerResponse = await fetch(
        `/api/labor/entries?view=joined&workerId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      ).catch(() => null);
      const ledgerJson = ledgerResponse?.ok
        ? ((await ledgerResponse.json().catch(() => null)) as {
            entries?: LaborEntryWithJoins[];
          } | null)
        : null;
      const ledger = ledgerJson?.entries ?? [];
      setLaborLedgerEntries(ledger);

      let balanceJson: WorkerBalanceDetail | null = null;
      let invoicesAllForWorker: WorkerInvoice[] = [];
      try {
        const [balanceResponse, advancesResponse, receiptsResponse, invoicesAll] =
          await Promise.all([
            fetch(`/api/labor/workers/${id}/balance`, { cache: "no-store" }).catch(() => null),
            fetch(`/api/labor/advances?workerId=${encodeURIComponent(id)}&status=active`, {
              cache: "no-store",
            }).catch(() => null),
            fetch("/api/worker-receipts", { cache: "no-store" }).catch(() => null),
            getWorkerInvoices().catch(() => [] as WorkerInvoice[]),
          ]);

        balanceJson = balanceResponse?.ok
          ? ((await balanceResponse.json().catch(() => null)) as WorkerBalanceDetail | null)
          : null;
        setBalanceDetail(balanceJson);

        const advancesJson = advancesResponse?.ok
          ? ((await advancesResponse.json().catch(() => null)) as {
              advances?: WorkerAdvanceRow[];
            } | null)
          : null;
        setAdvances(advancesJson?.advances ?? []);

        const receiptsJson = receiptsResponse?.ok
          ? ((await receiptsResponse.json().catch(() => null)) as {
              receipts?: WorkerReceiptRow[];
            } | null)
          : null;
        const workerName = w.name.trim().toLowerCase();
        setReceipts(
          (receiptsJson?.receipts ?? []).filter(
            (r) =>
              r.workerId === id || (!r.workerId && r.workerName.trim().toLowerCase() === workerName)
          )
        );

        invoicesAllForWorker = invoicesAll.filter((invoice) => invoice.workerId === id);
        setWorkerInvoices(invoicesAllForWorker);
      } catch (e) {
        setBalanceDetail(null);
        setAdvances([]);
        setReceipts([]);
        setWorkerInvoices([]);
        setDetailMessage(
          e instanceof Error ? e.message : "Some worker detail data failed to load."
        );
      }

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
        const payments = balanceJson?.payments ?? [];
        let labor = 0;
        for (const e of ledger) {
          if (e.work_date < from || e.work_date > to) continue;
          labor += entryEarned(e);
        }
        let inv = 0;
        for (const x of invoicesAllForWorker) {
          const d = x.createdAt?.slice(0, 10) ?? "";
          if (d < from || d > to) continue;
          inv += Number(x.amount) || 0;
        }
        let paid = 0;
        for (const p of payments) {
          const d = p.date?.slice(0, 10) ?? "";
          if (d < from || d > to) continue;
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
      setLaborLedgerEntries(null);
      setRateHistory([]);
      setBalanceDetail(null);
      setAdvances([]);
      setReceipts([]);
      setWorkerInvoices([]);
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

  useBreadcrumbEntityLabel(worker?.name);

  const activeTab = React.useMemo<WorkerDetailTab>(() => {
    const raw = searchParams.get("tab") as WorkerDetailTab | null;
    return raw &&
      ["overview", "work", "receipts", "advances", "payments", "statements", "rates"].includes(raw)
      ? raw
      : "overview";
  }, [searchParams]);

  const targetedWorkEntryId = React.useMemo(() => {
    return (
      searchParams.get("entryId") ??
      searchParams.get("laborEntryId") ??
      searchParams.get("timeEntryId")
    );
  }, [searchParams]);

  const weekRange = React.useMemo(() => currentWeekRange(), []);

  const thisWeekDays = React.useMemo(() => {
    if (!laborLedgerEntries) return 0;
    return laborLedgerEntries
      .filter((entry) => inDateRange(entry.work_date, weekRange.from, weekRange.to))
      .reduce(
        (sum, entry) =>
          sum +
          entryDaysWorked(entry, {
            dailyRate: worker?.dailyRate,
            halfDayRate: worker?.halfDayRate,
          }),
        0
      );
  }, [laborLedgerEntries, weekRange, worker?.dailyRate, worker?.halfDayRate]);

  const balanceSummary = balanceDetail?.summary ?? {
    laborOwed: financialSummary?.balance ?? 0,
    reimbursements: 0,
    payments: financialSummary?.totalPayments ?? 0,
    advances: 0,
    balance: financialSummary?.balance ?? 0,
  };

  const lastPayment = React.useMemo(() => {
    const payments = balanceDetail?.payments ?? [];
    return [...payments].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }, [balanceDetail]);

  const recentLaborEntries = React.useMemo(() => {
    return [...(laborLedgerEntries ?? [])]
      .sort((a, b) => b.work_date.localeCompare(a.work_date) || b.id.localeCompare(a.id))
      .slice(0, 5);
  }, [laborLedgerEntries]);

  const recentReceipts = React.useMemo(() => {
    return [...receipts]
      .sort((a, b) =>
        (b.receiptDate ?? b.createdAt ?? "").localeCompare(a.receiptDate ?? a.createdAt ?? "")
      )
      .slice(0, 5);
  }, [receipts]);

  const recentReimbursements = React.useMemo(() => {
    return [...(balanceDetail?.reimbursements ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [balanceDetail]);

  const recentPayments = React.useMemo(() => {
    return [...(balanceDetail?.payments ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [balanceDetail]);

  const missingReceiptCount = React.useMemo(
    () =>
      (balanceDetail?.reimbursements ?? []).filter(
        (r) =>
          String(r.status).toLowerCase() !== "paid" &&
          !receipts.some((receipt) => receipt.reimbursementId === r.id)
      ).length,
    [balanceDetail, receipts]
  );

  const workMonthGroups = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildWorkMonthGroups(laborLedgerEntries, {
      dailyRate: worker?.dailyRate,
      halfDayRate: worker?.halfDayRate,
    });
  }, [laborLedgerEntries, worker?.dailyRate, worker?.halfDayRate]);

  const workTabSummary = React.useMemo(
    () =>
      workMonthGroups.reduce(
        (summary, group) => ({
          days: summary.days + group.workDays,
          earned: summary.earned + group.earned,
          entries: summary.entries + group.entries.length,
        }),
        { days: 0, earned: 0, entries: 0 }
      ),
    [workMonthGroups]
  );

  const projectTotalsAll = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildProjectTotals(laborLedgerEntries, {
      dailyRate: worker?.dailyRate,
      halfDayRate: worker?.halfDayRate,
    });
  }, [laborLedgerEntries, worker?.dailyRate, worker?.halfDayRate]);

  React.useEffect(() => {
    if (!id || workMonthGroups.length === 0) return;
    const defaultSignature = `${id}:${targetedWorkEntryId ?? "latest"}`;
    if (workDefaultOpenAppliedRef.current === defaultSignature) return;

    const targetGroup = targetedWorkEntryId
      ? workMonthGroups.find((group) =>
          group.entries.some((entry) => entry.id === targetedWorkEntryId)
        )
      : null;
    const currentMonth = monthKeyFromDate(todayYmd());
    const currentGroup = workMonthGroups.find((group) => group.monthKey === currentMonth);
    const defaultGroup = targetGroup ?? currentGroup ?? workMonthGroups[0];
    setExpandedMonthKeys(defaultGroup ? [defaultGroup.monthKey] : []);
    workDefaultOpenAppliedRef.current = defaultSignature;
  }, [id, targetedWorkEntryId, workMonthGroups]);

  const toggleMonth = (key: string) => {
    setExpandedMonthKeys((prev) =>
      prev.includes(key) ? prev.filter((monthKey) => monthKey !== key) : [...prev, key]
    );
  };

  const handleChangeDailyRate = async () => {
    if (!id) return;
    const nextRate = Number(rateDaily);
    if (!Number.isFinite(nextRate) || nextRate < 0) {
      setRateMessage("Enter a valid daily rate.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rateEffectiveFrom)) {
      setRateMessage("Choose an effective date.");
      return;
    }
    setRateBusy(true);
    setRateMessage(null);
    setRateApplyPreview(null);
    try {
      const response = await fetch(`/api/labor/workers/${id}/rate-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyRate: nextRate,
          effectiveFrom: rateEffectiveFrom,
          notes: rateNotes.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Failed to change daily rate.");
      await refreshAll();
      const result = body as { applyToUnpaidPreview?: RateApplyPreview | null } | null;
      setRateApplyPreview(result?.applyToUnpaidPreview ?? null);
      setRateMessage("Daily rate changed.");
    } catch (e) {
      setRateMessage(e instanceof Error ? e.message : "Failed to change daily rate.");
    } finally {
      setRateBusy(false);
    }
  };

  const handleApplyRateToUnpaidEntries = async () => {
    if (!id || !rateApplyPreview) return;
    setRateApplyBusy(true);
    setRateMessage(null);
    try {
      const response = await fetch(`/api/labor/workers/${id}/rate-history/apply-unpaid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateHistoryId: rateApplyPreview.rateHistoryId }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        summary?: RateApplyPreview;
      } | null;
      if (!response.ok) throw new Error(body?.message ?? "Failed to update unpaid labor entries.");
      const affected = body?.summary?.affectedCount ?? rateApplyPreview.affectedCount;
      await refreshAll();
      setRateApplyPreview(null);
      setRateMessage(
        affected === 1 ? "Updated 1 unpaid time entry." : `Updated ${affected} unpaid time entries.`
      );
    } catch (e) {
      setRateMessage(e instanceof Error ? e.message : "Failed to update unpaid labor entries.");
    } finally {
      setRateApplyBusy(false);
    }
  };

  if (!id) {
    return (
      <div className="mx-auto flex w-full max-w-[430px] sm:max-w-[460px] flex-col gap-6 px-4 py-6 md:max-w-5xl md:p-6">
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
      <div className="mx-auto flex w-full max-w-[430px] sm:max-w-[460px] flex-col gap-6 px-4 py-6 md:max-w-5xl md:p-6">
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
      <div className="mx-auto flex w-full max-w-[430px] sm:max-w-[460px] flex-col gap-6 px-4 py-6 md:max-w-5xl md:p-6">
        <PageHeader title="Worker Not Found" description="This worker does not exist." />
        <Link href="/workers">
          <Button variant="outline" className="w-fit rounded-sm">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const effectiveSince =
    (worker as Worker & { currentDailyRateEffectiveFrom?: string | null })
      .currentDailyRateEffectiveFrom ||
    rateHistory[0]?.effectiveFrom ||
    "—";
  const sessionLabelForEntry = (entry: LaborEntryWithJoins) =>
    formatLaborEntrySessionLabel(entry.notes, entry.hours, {
      costAmount: entryEarned(entry),
      dailyRate: entry.daily_rate_snapshot ?? worker.dailyRate,
      halfDayRate:
        entry.daily_rate_snapshot != null ? entry.daily_rate_snapshot / 2 : worker.halfDayRate,
      morning: entry.morning,
      afternoon: entry.afternoon,
    });

  return (
    <div className="dark neo-page-on-graphite mx-auto flex w-full max-w-[430px] flex-col gap-4 overflow-x-hidden px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:max-w-[460px] md:max-w-6xl md:gap-5 md:p-6">
      <PageHeader
        title={worker.name}
        description="Worker Center detail — work, receipts, advances, payments, statements, and rate history."
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
          </div>
        }
      />

      {detailMessage ? (
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {detailMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <SummaryTile
          label="Net To Pay"
          value={fmtUsd(balanceSummary.balance)}
          meta={workerStatusLabel(balanceSummary.balance)}
          emphasis={balanceSummary.balance > 0.005}
          className="order-first col-span-2 md:order-none md:col-span-1"
        />
        <SummaryTile
          label="Current Daily Rate"
          value={fmtUsd(worker.dailyRate)}
          meta={`Since ${effectiveSince}`}
        />
        <SummaryTile
          label="This Week Days"
          value={fmtDays(thisWeekDays)}
          meta={`${weekRange.from} to ${weekRange.to}`}
        />
        <SummaryTile label="Unpaid Labor" value={fmtUsd(balanceSummary.laborOwed)} />
        <SummaryTile label="Reimbursements" value={fmtUsd(balanceSummary.reimbursements)} />
        <SummaryTile label="Advances" value={fmtUsd(balanceSummary.advances)} />
        <SummaryTile
          label="Last Payment"
          value={lastPayment ? fmtUsd(lastPayment.amount) : "—"}
          meta={lastPayment ? formatDate(lastPayment.date, "compact") : undefined}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <QuickActionLink
          href={`/labor?workerId=${encodeURIComponent(id)}&addDaily=1`}
          icon={CalendarPlus}
        >
          Add Time Entry
        </QuickActionLink>
        <QuickActionLink
          href={`/upload-receipt?workerId=${encodeURIComponent(id)}&returnTo=${encodeWorkerReturnPath(id, "receipts")}`}
          icon={Upload}
        >
          Upload Receipt
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/reimbursements?workerId=${encodeURIComponent(id)}&new=1&returnTo=${encodeWorkerReturnPath(id, "receipts")}`}
          icon={ReceiptText}
        >
          Add Reimbursement
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/advances?workerId=${encodeURIComponent(id)}&new=1&returnTo=${encodeWorkerReturnPath(id, "advances")}`}
          icon={HandCoins}
        >
          Add Advance
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/workers/${encodeURIComponent(id)}/balance?returnTo=${encodeWorkerReturnPath(id, "payments")}`}
          icon={WalletCards}
          primary
        >
          Pay Worker
        </QuickActionLink>
        <QuickActionLink
          href={`/workers/${encodeURIComponent(id)}/statement?returnTo=${encodeWorkerReturnPath(id, "statements")}`}
          icon={FileText}
        >
          Create Statement
        </QuickActionLink>
      </div>

      <Tabs defaultValue={activeTab} className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="receipts">Receipts & Reimbursements</TabsTrigger>
            <TabsTrigger value="advances">Advances</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="statements">Statements</TabsTrigger>
            <TabsTrigger value="rates">Rate History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
            <DetailSection title="Recent Work" description="Newest labor entries for this worker.">
              {recentLaborEntries.length === 0 ? (
                <EmptyPanel>No recent time entries.</EmptyPanel>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentLaborEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{entry.project_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.work_date, "compact")} · {sessionLabelForEntry(entry)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {fmtUsd(entryEarned(entry))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>

            <DetailSection title="Alerts" description="Operational items to clear.">
              <div className="space-y-2 text-sm">
                {balanceSummary.balance > 0.005 ? (
                  <div className="flex gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span>Unpaid balance exists: {fmtUsd(balanceSummary.balance)}.</span>
                  </div>
                ) : null}
                {balanceSummary.advances > 0.005 ? (
                  <div className="flex gap-2 rounded-md border border-border/60 p-2">
                    <HandCoins
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>Open advances are included in net to pay.</span>
                  </div>
                ) : null}
                {missingReceiptCount > 0 ? (
                  <div className="flex gap-2 rounded-md border border-border/60 p-2">
                    <ReceiptText
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>{missingReceiptCount} reimbursement item may need receipt review.</span>
                  </div>
                ) : null}
                {balanceSummary.balance <= 0.005 &&
                balanceSummary.advances <= 0.005 &&
                missingReceiptCount === 0 ? (
                  <p className="rounded-md border border-border/60 p-2 text-muted-foreground">
                    No open alerts.
                  </p>
                ) : null}
              </div>
            </DetailSection>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <DetailSection title="Balance Breakdown">
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Unpaid labor</dt>
                  <dd className="font-medium tabular-nums">{fmtUsd(balanceSummary.laborOwed)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Reimbursements</dt>
                  <dd className="font-medium tabular-nums">
                    {fmtUsd(balanceSummary.reimbursements)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Advances</dt>
                  <dd className="font-medium tabular-nums">{fmtUsd(balanceSummary.advances)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border/60 pt-2">
                  <dt className="font-medium">Net to pay</dt>
                  <dd className="font-semibold tabular-nums">{fmtUsd(balanceSummary.balance)}</dd>
                </div>
              </dl>
            </DetailSection>

            <DetailSection title="This Month">
              {monthly ? (
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Earned</dt>
                    <dd className="font-medium tabular-nums">{fmtUsd(monthly.earned)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd className="font-medium tabular-nums">{fmtUsd(monthly.paid)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border/60 pt-2">
                    <dt className="font-medium">Outstanding</dt>
                    <dd className="font-semibold tabular-nums">{fmtUsd(monthly.outstanding)}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyPanel>No monthly summary.</EmptyPanel>
              )}
            </DetailSection>

            <DetailSection title="Recent Receipts / Reimbursements">
              {[...recentReceipts, ...recentReimbursements].length === 0 ? (
                <EmptyPanel>No recent receipts or reimbursements.</EmptyPanel>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentReceipts.map((r) => (
                    <div
                      key={`receipt-${r.id}`}
                      className="flex justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{r.vendor ?? r.expenseType}</span>
                      <span className="shrink-0 tabular-nums">{fmtUsd(r.amount)}</span>
                    </div>
                  ))}
                  {recentReimbursements.map((r) => (
                    <div key={`reimb-${r.id}`} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{r.vendor ?? "Reimbursement"}</span>
                      <span className="shrink-0 tabular-nums">{fmtUsd(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>

            <DetailSection title="Recent Payments">
              {recentPayments.length === 0 ? (
                <EmptyPanel>No payments yet.</EmptyPanel>
              ) : (
                <div className="divide-y divide-border/60">
                  {recentPayments.map((p) => (
                    <div key={p.id} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="text-muted-foreground">{formatDate(p.date, "compact")}</span>
                      <span className="font-medium tabular-nums">{fmtUsd(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent value="work" className="space-y-4">
          <DetailSection
            title="Work"
            description="Time entries for this worker. Daily rate snapshots are displayed as-is from existing labor rows."
          >
            {laborLedgerEntries === null ? (
              <p className="text-sm text-muted-foreground">Loading labor…</p>
            ) : laborLedgerEntries.length === 0 ? (
              <EmptyPanel>
                <div className="flex flex-col items-center gap-3">
                  <div>
                    <p className="font-medium text-foreground">No time entries yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add this worker&apos;s first labor row from Daily Labor.
                    </p>
                  </div>
                  <Button asChild size="sm" className="h-9 rounded-sm">
                    <Link href={`/labor?workerId=${encodeURIComponent(id)}&addDaily=1`}>
                      Add Time Entry
                    </Link>
                  </Button>
                </div>
              </EmptyPanel>
            ) : (
              <div className="space-y-3" data-testid="worker-work-month-groups">
                <div className="flex flex-col gap-3 rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                      Work Ledger
                    </p>
                    <p className="mt-1 text-sm text-[var(--neo-text-secondary)]">
                      {fmtCountLabel(workMonthGroups.length, "month")} ·{" "}
                      {fmtDayLabel(workTabSummary.days)} · {fmtUsd(workTabSummary.earned)} ·{" "}
                      {fmtCountLabel(workTabSummary.entries, "entry", "entries")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 min-h-[44px] rounded-sm border-[var(--neo-border)] bg-[var(--neo-surface)] text-[var(--neo-text-primary)] hover:bg-[var(--neo-surface-hover)] md:min-h-9"
                      onClick={() =>
                        setExpandedMonthKeys(workMonthGroups.map((group) => group.monthKey))
                      }
                    >
                      Expand all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 min-h-[44px] rounded-sm border-[var(--neo-border)] bg-transparent text-[var(--neo-text-secondary)] hover:bg-[var(--neo-surface-hover)] hover:text-[var(--neo-text-primary)] md:min-h-9"
                      onClick={() => setExpandedMonthKeys([])}
                    >
                      Collapse all
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {workMonthGroups.map((group) => {
                    const open = expandedMonthKeys.includes(group.monthKey);
                    const panelId = `worker-work-month-panel-${group.monthKey}`;
                    const projectSummary = fmtCountLabel(group.projectCount, "project");
                    return (
                      <section
                        key={group.monthKey}
                        data-testid={`worker-work-month-${group.monthKey}`}
                        className={cn(
                          "overflow-hidden rounded-lg border bg-[var(--neo-surface)] shadow-[var(--neo-shadow-panel)]",
                          open
                            ? "border-[color:rgb(184_147_90_/_0.34)]"
                            : "border-[var(--neo-border)]"
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={panelId}
                          className={cn(
                            "flex min-h-[64px] w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors",
                            "hover:bg-[var(--neo-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(184_147_90_/_0.52)]",
                            open && "bg-[rgb(184_147_90_/_0.08)]"
                          )}
                          onClick={() => toggleMonth(group.monthKey)}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--neo-text-primary)]">
                              {group.label}
                            </p>
                            <p className="mt-1 text-xs text-[var(--neo-text-secondary)]">
                              {fmtDayLabel(group.workDays)} · {fmtUsd(group.earned)} ·{" "}
                              {projectSummary}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="hidden text-right text-xs text-[var(--neo-text-tertiary)] sm:block">
                              {fmtCountLabel(group.entries.length, "entry", "entries")}
                            </span>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 text-[var(--neo-gold-soft)] transition-transform duration-200",
                                open && "rotate-90"
                              )}
                              aria-hidden
                            />
                          </div>
                        </button>

                        {open ? (
                          <div
                            id={panelId}
                            className="border-t border-[var(--neo-border)] bg-black/10"
                          >
                            <div className="hidden md:block">
                              <table className="w-full border-collapse text-sm table-row-compact">
                                <thead>
                                  <tr className="border-b border-[var(--neo-border)] bg-white/[0.02]">
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                                      Date
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                                      Project
                                    </th>
                                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                                      Session
                                    </th>
                                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                                      Earned
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.entries.map((entry) => (
                                    <tr
                                      key={entry.id}
                                      data-testid="worker-work-entry-row"
                                      className={cn(
                                        "border-b border-[var(--neo-border)] last:border-b-0",
                                        targetedWorkEntryId === entry.id &&
                                          "bg-[rgb(184_147_90_/_0.08)]"
                                      )}
                                    >
                                      <td className="px-3 py-2 tabular-nums text-[var(--neo-text-secondary)]">
                                        {formatDate(entry.work_date)}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-[var(--neo-text-primary)]">
                                        {entry.project_name ?? "—"}
                                      </td>
                                      <td className="px-3 py-2 text-[var(--neo-text-secondary)]">
                                        {sessionLabelForEntry(entry)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--neo-text-primary)]">
                                        {fmtUsd(entryEarned(entry))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <div className="grid gap-2 p-3 md:hidden">
                              {group.entries.map((entry) => (
                                <article
                                  key={entry.id}
                                  data-testid="worker-work-entry-card"
                                  className={cn(
                                    "rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-3",
                                    targetedWorkEntryId === entry.id &&
                                      "border-[color:rgb(184_147_90_/_0.34)] bg-[rgb(184_147_90_/_0.08)]"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-[var(--neo-text-primary)]">
                                        {formatDate(entry.work_date, "compact")}
                                      </p>
                                      <p className="mt-1 truncate text-xs text-[var(--neo-text-secondary)]">
                                        {entry.project_name ?? "—"}
                                      </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--neo-text-primary)]">
                                      {fmtUsd(entryEarned(entry))}
                                    </p>
                                  </div>
                                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--neo-text-tertiary)]">
                                    <span>{sessionLabelForEntry(entry)}</span>
                                    <span>
                                      {fmtDayLabel(
                                        entryDaysWorked(entry, {
                                          dailyRate: worker.dailyRate,
                                          halfDayRate: worker.halfDayRate,
                                        })
                                      )}
                                    </span>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </DetailSection>

          <div className="grid gap-4">
            <DetailSection title="Project Totals">
              {projectTotalsAll.length === 0 ? (
                <EmptyPanel>No project totals yet.</EmptyPanel>
              ) : (
                <div className="divide-y divide-border/60">
                  {projectTotalsAll.map((row) => (
                    <div
                      key={row.projectId || "none"}
                      className="flex justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{row.projectName}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {fmtDays(row.workDays)} days · {fmtUsd(row.earned)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4">
          <DetailSection title="Receipts" description="Receipt uploads tied to this worker.">
            {receipts.length === 0 ? (
              <EmptyPanel>No uploaded worker receipts yet.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Vendor
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(r.receiptDate ?? r.createdAt)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.vendor ?? r.expenseType}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.status}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Reimbursements"
            description="Pending and paid reimbursements from the worker balance ledger."
          >
            {(balanceDetail?.reimbursements ?? []).length === 0 ? (
              <EmptyPanel>No worker reimbursements yet.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Vendor
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Project
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(balanceDetail?.reimbursements ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(r.date)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.vendor ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {r.projectName ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.status}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </TabsContent>

        <TabsContent value="advances">
          <DetailSection
            title="Advances"
            description="Worker advances as loaded from the existing advances API."
          >
            {advances.length === 0 ? (
              <EmptyPanel>No active advances for this worker.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Project
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {advances.map((a) => (
                      <tr key={a.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(a.advanceDate)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{a.projectName ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground capitalize">{a.status}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(a.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </TabsContent>

        <TabsContent value="payments">
          <DetailSection
            title="Payments"
            description="Payment ledger from the existing worker balance API, using server-side access to avoid worker_payments permission errors."
          >
            {(balanceDetail?.payments ?? []).length === 0 ? (
              <EmptyPanel>No worker payments yet.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Method
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Notes
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Receipt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(balanceDetail?.payments ?? []).map((p) => (
                      <tr key={p.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(p.date)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{p.paymentMethod ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{p.notes ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(p.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Link
                            className="text-xs underline-offset-4 hover:underline"
                            href={`/labor/payments/${p.id}/receipt`}
                          >
                            Preview
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </TabsContent>

        <TabsContent value="statements" className="space-y-4">
          <DetailSection
            title="Statements"
            description="Worker statement and legacy worker invoices. Payroll Summary remains company-level."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-9 rounded-sm">
                <Link href={`/workers/${id}/statement`}>Create Statement</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 rounded-sm">
                <Link href={`/worker/${id}/monthly-report`}>Monthly Payroll Statement</Link>
              </Button>
            </div>
            {workerInvoices.length === 0 ? (
              <EmptyPanel>No worker invoices for this worker.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workerInvoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{invoice.status}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(Number(invoice.amount) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          <DetailSection title="Current Daily Rate">
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-md border border-border/70 bg-card/30 p-4">
                <p className="text-xs text-muted-foreground">Current Daily Rate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {fmtUsd(worker.dailyRate)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Effective since {effectiveSince}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/30 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Change Daily Rate
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs text-muted-foreground">
                    New daily rate
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rateDaily}
                      onChange={(e) => setRateDaily(e.target.value)}
                      className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm text-foreground tabular-nums"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-muted-foreground">
                    Effective date
                    <input
                      type="date"
                      value={rateEffectiveFrom}
                      onChange={(e) => setRateEffectiveFrom(e.target.value)}
                      className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm text-foreground tabular-nums"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-muted-foreground sm:col-span-2">
                    Note optional
                    <input
                      value={rateNotes}
                      onChange={(e) => setRateNotes(e.target.value)}
                      className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm text-foreground"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{rateMessage ?? " "}</p>
                  <Button
                    size="sm"
                    className="rounded-sm"
                    onClick={handleChangeDailyRate}
                    disabled={rateBusy}
                  >
                    {rateBusy ? "Saving…" : "Change Daily Rate"}
                  </Button>
                </div>
                {rateApplyPreview ? (
                  <div className="mt-4 rounded-md border border-amber-400/25 bg-amber-400/10 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                          Apply this rate to unpaid entries?
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          New rate {fmtUsd(rateApplyPreview.dailyRate)} / day ·{" "}
                          {rateApplyPreview.effectiveFrom} to{" "}
                          {rateApplyPreview.effectiveTo ?? "open-ended"}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">Affected unpaid entries</p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                          {rateApplyPreview.affectedCount}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-sm border border-border/60 bg-background/35 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          Old total
                        </p>
                        <p className="mt-1 font-semibold tabular-nums text-foreground">
                          {fmtUsd(rateApplyPreview.oldTotal)}
                        </p>
                      </div>
                      <div className="rounded-sm border border-border/60 bg-background/35 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          New total
                        </p>
                        <p className="mt-1 font-semibold tabular-nums text-foreground">
                          {fmtUsd(rateApplyPreview.newTotal)}
                        </p>
                      </div>
                      <div className="rounded-sm border border-border/60 bg-background/35 p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          Difference
                        </p>
                        <p className="mt-1 font-semibold tabular-nums text-foreground">
                          {fmtUsd(rateApplyPreview.difference)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Paid entries will not change. Existing payment receipts/statements will not
                      change. This only updates unpaid labor entries in the selected date range.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-sm"
                        onClick={() => {
                          setRateApplyPreview(null);
                          setRateMessage("Skipped unpaid entry snapshot updates.");
                        }}
                        disabled={rateApplyBusy}
                      >
                        Skip
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-sm"
                        onClick={handleApplyRateToUnpaidEntries}
                        disabled={rateApplyBusy || rateApplyPreview.affectedCount === 0}
                      >
                        {rateApplyBusy ? "Applying…" : "Apply to unpaid entries"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Rate History">
            {rateHistory.length === 0 ? (
              <EmptyPanel>No daily rate history yet.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Rate
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Effective
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateHistory.map((row) => (
                      <tr key={row.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 font-medium tabular-nums">
                          {fmtUsd(row.dailyRate)} / day
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {fmtRateRange(row)}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {row.notes?.trim() ? row.notes : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
