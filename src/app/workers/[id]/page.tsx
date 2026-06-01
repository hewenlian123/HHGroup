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

type WorkerRateHistoryView = {
  id: string;
  dailyRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
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
  return new Date().toISOString().slice(0, 10);
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

function entryDaysWorked(e: Pick<LaborEntryWithJoins, "days_worked" | "morning" | "afternoon">) {
  const snap = Number(e.days_worked);
  if (Number.isFinite(snap) && snap >= 0) return snap;
  const morning = e.morning === true;
  const afternoon = e.afternoon === true;
  if (morning && afternoon) return 1;
  if (morning || afternoon) return 0.5;
  return 1;
}

function fmtDays(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.005) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function buildMonthlyTotals(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, { days: number; earned: number }>();
  for (const e of entries) {
    const k = monthKeyFromDate(e.work_date);
    const cur = map.get(k) ?? { days: 0, earned: 0 };
    cur.days += entryDaysWorked(e);
    cur.earned += entryEarned(e);
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([monthKey, v]) => ({
      monthKey,
      label: monthLabelEn(monthKey),
      workDays: v.days,
      earned: v.earned,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function buildProjectTotals(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, { name: string; days: number; earned: number }>();
  for (const e of entries) {
    const pid = e.project_id ?? "";
    const name = e.project_name?.trim() ? e.project_name : pid ? "(Unknown project)" : "—";
    const cur = map.get(pid) ?? { name, days: 0, earned: 0 };
    cur.days += entryDaysWorked(e);
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

function groupEntriesByProjectForMonth(entries: LaborEntryWithJoins[]) {
  const map = new Map<string, LaborEntryWithJoins[]>();
  for (const e of entries) {
    const pid = e.project_id ?? "";
    const list = map.get(pid) ?? [];
    list.push(e);
    map.set(pid, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.id.localeCompare(b.id));
  }
  return Array.from(map.entries())
    .map(([projectId, list]) => ({
      projectId,
      projectName: list[0]?.project_name?.trim()
        ? list[0].project_name!
        : projectId
          ? "(Unknown project)"
          : "—",
      entries: list,
      earned: list.reduce((s, x) => s + entryEarned(x), 0),
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
  const [expandedMonthKey, setExpandedMonthKey] = React.useState<string | null>(null);
  const [rateHistory, setRateHistory] = React.useState<WorkerRateHistoryView[]>([]);
  const [rateDaily, setRateDaily] = React.useState("");
  const [rateEffectiveFrom, setRateEffectiveFrom] = React.useState(() => todayYmd());
  const [rateNotes, setRateNotes] = React.useState("");
  const [rateMessage, setRateMessage] = React.useState<string | null>(null);
  const [rateBusy, setRateBusy] = React.useState(false);

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

  const weekRange = React.useMemo(() => currentWeekRange(), []);

  const thisWeekDays = React.useMemo(() => {
    if (!laborLedgerEntries) return 0;
    return laborLedgerEntries
      .filter((entry) => inDateRange(entry.work_date, weekRange.from, weekRange.to))
      .reduce((sum, entry) => sum + entryDaysWorked(entry), 0);
  }, [laborLedgerEntries, weekRange]);

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

  const monthlyTotals = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildMonthlyTotals(laborLedgerEntries);
  }, [laborLedgerEntries]);

  const projectTotalsAll = React.useMemo(() => {
    if (!laborLedgerEntries) return [];
    return buildProjectTotals(laborLedgerEntries);
  }, [laborLedgerEntries]);

  const expandedMonthEntries = React.useMemo(() => {
    if (!laborLedgerEntries || !expandedMonthKey) return [];
    const inMonth = laborLedgerEntries.filter(
      (e) => monthKeyFromDate(e.work_date) === expandedMonthKey
    );
    return groupEntriesByProjectForMonth(inMonth);
  }, [laborLedgerEntries, expandedMonthKey]);

  const toggleMonth = (key: string) => {
    setExpandedMonthKey((prev) => (prev === key ? null : key));
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
      setRateMessage("Daily rate changed.");
      await refreshAll();
    } catch (e) {
      setRateMessage(e instanceof Error ? e.message : "Failed to change daily rate.");
    } finally {
      setRateBusy(false);
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
        <QuickActionLink href={`/upload-receipt?workerId=${encodeURIComponent(id)}`} icon={Upload}>
          Upload Receipt
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/reimbursements?workerId=${encodeURIComponent(id)}&new=1`}
          icon={ReceiptText}
        >
          Add Reimbursement
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/advances?workerId=${encodeURIComponent(id)}&new=1`}
          icon={HandCoins}
        >
          Add Advance
        </QuickActionLink>
        <QuickActionLink
          href={`/labor/workers/${encodeURIComponent(id)}/balance`}
          icon={WalletCards}
          primary
        >
          Pay Worker
        </QuickActionLink>
        <QuickActionLink href={`/workers/${encodeURIComponent(id)}/statement`} icon={FileText}>
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
                          {formatDate(entry.work_date, "compact")} ·{" "}
                          {formatLaborEntrySessionLabel(entry.notes, entry.hours, {
                            costAmount: entryEarned(entry),
                            dailyRate: entry.daily_rate_snapshot ?? worker.dailyRate,
                            halfDayRate:
                              entry.daily_rate_snapshot != null
                                ? entry.daily_rate_snapshot / 2
                                : worker.halfDayRate,
                            morning: entry.morning,
                            afternoon: entry.afternoon,
                          })}
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
              <EmptyPanel>No labor entries for this worker.</EmptyPanel>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-sm table-row-compact">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Date
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Project
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Session
                      </th>
                      <th className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Earned
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborLedgerEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border/40">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {formatDate(entry.work_date)}
                        </td>
                        <td className="px-2 py-1.5 font-medium">{entry.project_name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {formatLaborEntrySessionLabel(entry.notes, entry.hours, {
                            costAmount: entryEarned(entry),
                            dailyRate: entry.daily_rate_snapshot ?? worker.dailyRate,
                            halfDayRate:
                              entry.daily_rate_snapshot != null
                                ? entry.daily_rate_snapshot / 2
                                : worker.halfDayRate,
                            morning: entry.morning,
                            afternoon: entry.afternoon,
                          })}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                          {fmtUsd(entryEarned(entry))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <DetailSection title="Monthly Totals">
              {monthlyTotals.length === 0 ? (
                <EmptyPanel>No monthly totals yet.</EmptyPanel>
              ) : (
                <div className="divide-y divide-border/60">
                  {monthlyTotals.map((row) => {
                    const open = expandedMonthKey === row.monthKey;
                    return (
                      <div key={row.monthKey}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 py-2 text-left"
                          onClick={() => toggleMonth(row.monthKey)}
                        >
                          <span className="font-medium">{row.label}</span>
                          <span className="flex items-center gap-3 text-sm text-muted-foreground">
                            {fmtDays(row.workDays)} days · {fmtUsd(row.earned)}
                            <ChevronRight
                              className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
                              aria-hidden
                            />
                          </span>
                        </button>
                        {open ? (
                          <div className="pb-3 text-sm text-muted-foreground">
                            {expandedMonthEntries.map((grp) => (
                              <div
                                key={grp.projectId || "none"}
                                className="flex justify-between gap-3 py-1"
                              >
                                <span className="truncate">{grp.projectName}</span>
                                <span className="shrink-0 tabular-nums">{fmtUsd(grp.earned)}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </DetailSection>

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
