"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getWorkers,
  getProjects,
  getDailyWorkEntriesInRange,
  getWorkerReimbursements,
  getWorkerInvoices,
  getLaborInvoices,
  getWorkerPayments,
  getWorkerAdvances,
  includeLaborInvoicesInProjectLabor,
  type DailyWorkEntry,
  type WorkerReimbursement,
  type WorkerInvoice,
} from "@/lib/data";
import {
  balanceStatusLabel,
  buildPayrollSummaryRows,
  type PayrollSummaryComputeRow,
} from "./compute-payroll-summary-rows";
import { PayWorkerModal } from "./pay-worker-modal";
import { WorkerPaymentReceiptPreviewModal } from "@/components/labor/worker-payment-receipt-preview-modal";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { deleteWorkerAction } from "@/app/workers/actions";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { useToast } from "@/components/toast/toast-provider";
import { FilterBar } from "@/components/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MobileFabPlus,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import {
  ArrowLeftRight,
  CalendarDays,
  DollarSign,
  HandCoins,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type Row = PayrollSummaryComputeRow;

const psShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const psKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const psKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100/55 text-zinc-500 md:h-8 md:w-8 dark:bg-muted/60 dark:text-muted-foreground";

const AVATAR_RING = [
  "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700/50 dark:text-zinc-100",
  "bg-zinc-300/65 text-zinc-900 dark:bg-zinc-600/45 dark:text-zinc-100",
  "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/55 dark:text-zinc-100",
  "bg-zinc-200/70 text-zinc-800 dark:bg-zinc-700/48 dark:text-zinc-100",
  "bg-zinc-300/55 text-zinc-900 dark:bg-zinc-600/40 dark:text-zinc-100",
  "bg-zinc-100/95 text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100",
];

const workerAvatarRing = "ring-1 ring-inset ring-zinc-950/[0.055] dark:ring-white/[0.08]";

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  const one = parts[0] ?? name;
  return one.slice(0, 2).toUpperCase();
}

function avatarRingClass(seed: string): string {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
  return AVATAR_RING[s % AVATAR_RING.length] ?? AVATAR_RING[0];
}

function truncateId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function BalanceChip({ balance }: { balance: number }) {
  const base =
    "inline-flex w-fit min-h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums tracking-tight shadow-none";
  if (balance > 0) {
    return (
      <span
        className={cn(
          base,
          "border-rose-500/10 bg-rose-500/[0.03] text-rose-900/78 dark:border-rose-500/12 dark:bg-rose-500/[0.05] dark:text-rose-100/78"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-rose-500/40" aria-hidden />
        Unpaid
      </span>
    );
  }
  if (balance < 0) {
    return (
      <span
        className={cn(
          base,
          "border-blue-500/12 bg-blue-500/[0.04] text-blue-950/75 dark:border-blue-500/14 dark:bg-blue-500/[0.06] dark:text-blue-100/78"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-blue-500/45" aria-hidden />
        Overpaid
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "border-emerald-500/10 bg-emerald-500/[0.03] text-emerald-900/75 dark:border-emerald-500/12 dark:bg-emerald-500/[0.05] dark:text-emerald-100/78"
      )}
    >
      <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/40" aria-hidden />
      Paid
    </span>
  );
}

export default function PayrollSummaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const defaultFrom = startOfMonth.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(today);
  const [projectId, setProjectId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: keyof Omit<Row, "workerId">; dir: "asc" | "desc" }>(
    {
      key: "balance",
      dir: "desc",
    }
  );
  const [page, setPage] = React.useState(1);
  const pageSize = 12;

  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payTarget, setPayTarget] = React.useState<Row | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [receiptPaymentId, setReceiptPaymentId] = React.useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [
        w,
        p,
        laborEntries,
        reimbursementsAll,
        invoicesAll,
        laborInvoicesAll,
        paymentsAll,
        advancesAll,
      ] = await Promise.all([
        getWorkers(),
        getProjects(),
        getDailyWorkEntriesInRange(fromDate, toDate),
        getWorkerReimbursements(),
        getWorkerInvoices(),
        getLaborInvoices(),
        getWorkerPayments({ fromDate, toDate }),
        getWorkerAdvances({ fromDate, toDate }),
      ]);
      setProjects(p);

      const projectFilter = projectId || null;

      const out = buildPayrollSummaryRows({
        fromDate,
        toDate,
        projectFilter,
        includeLaborInvoices: includeLaborInvoicesInProjectLabor,
        workers: w,
        laborEntries: laborEntries as DailyWorkEntry[],
        reimbursementsAll: reimbursementsAll as WorkerReimbursement[],
        workerInvoicesAll: invoicesAll as WorkerInvoice[],
        laborInvoicesAll,
        paymentsAll,
        advancesAll,
      });

      setRows(out);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.workerName.toLowerCase().includes(q)) : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "workerName") return a.workerName.localeCompare(b.workerName) * dir;
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [rows, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort, fromDate, toDate, projectId]);

  const toggleSort = (key: keyof Omit<Row, "workerId">) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  /** Monthly report page uses calendar month; align with the range “From” date. */
  const payrollMonthYm = fromDate.slice(0, 7);

  const summary = React.useMemo(() => {
    let earned = 0;
    let reimbursements = 0;
    let shouldPay = 0;
    let paid = 0;
    let balance = 0;
    for (const r of rows) {
      earned += r.earned;
      reimbursements += r.reimbursements;
      shouldPay += r.shouldPay;
      paid += r.paid;
      balance += r.balance;
    }
    const workers = rows.length;
    return { earned, reimbursements, shouldPay, paid, outstanding: balance, workers };
  }, [rows]);

  const initialLoading = loading && rows.length === 0;
  const refreshing = loading && rows.length > 0;

  const selectFieldClass =
    "h-10 w-full min-w-0 rounded-md border border-zinc-200/65 bg-white px-3 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-zinc-200 hover:bg-zinc-50/40 focus-visible:border-zinc-300/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400/18 dark:border-border/80 dark:bg-card dark:text-foreground dark:hover:bg-muted/25 dark:focus-visible:ring-zinc-500/25";

  const dateInputClass = cn(
    selectFieldClass,
    "font-mono text-[13px] tabular-nums text-zinc-600 [color-scheme:light] dark:text-zinc-400 dark:[color-scheme:dark]",
    "bg-zinc-50/45 hover:bg-zinc-50/65 dark:bg-muted/15 dark:hover:bg-muted/25"
  );

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 dark:bg-background sm:max-w-[460px] md:max-w-6xl md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-1.5 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-zinc-900 [&_p]:mt-0 [&_p]:text-[13px] [&_p]:leading-snug [&_p]:text-muted-foreground dark:[&_h1]:text-foreground"
            title="Payroll Summary"
            subtitle="Labor cost, reimbursements, payments, and worker balance overview."
            actions={
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)] dark:border-border/55 dark:bg-card">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Labor
              </span>
            }
          />
        </div>

        <MobileListHeader
          title="Payroll Summary"
          fab={<MobileFabPlus href="/labor" ariaLabel="Labor home" />}
        />

        {initialLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(psKpiTile, "flex h-[52px] items-center gap-2 px-3 md:h-[62px]")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-2">
            <div
              className={cn(
                psKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total Earned
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.earned)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This period</p>
              </div>
            </div>
            <div
              className={cn(
                psKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <HandCoins className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Reimbursements
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.reimbursements)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This period</p>
              </div>
            </div>
            <div
              className={cn(
                psKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <ArrowLeftRight
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Should Pay
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.shouldPay)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This period</p>
              </div>
            </div>
            <div
              className={cn(
                psKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Paid
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.paid)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This period</p>
              </div>
            </div>
            <div
              className={cn(
                psKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Outstanding
                </p>
                <p
                  className={cn(
                    "mt-0.5 truncate text-base font-medium tabular-nums leading-none md:text-xl",
                    summary.outstanding < 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-zinc-900 dark:text-foreground"
                  )}
                >
                  {fmtUsd(summary.outstanding)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">This period</p>
              </div>
            </div>
            <div
              className={cn(
                psKpiTile,
                "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(psKpiIcon, "mt-0.5 md:mt-0")}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Workers
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.workers}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Active</p>
              </div>
            </div>
          </div>
        )}

        <div className={cn(psShell, "p-3 md:p-3")}>
          <FilterBar className="gap-2.5 sm:gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:flex-nowrap">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={cn(dateInputClass, "h-10 sm:w-[152px]")}
                aria-label="From"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={cn(dateInputClass, "h-10 sm:w-[152px]")}
                aria-label="To"
              />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(selectFieldClass, "h-10 sm:min-w-[180px] md:min-w-[200px]")}
                aria-label="Project"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row md:max-w-[min(100%,320px)]">
              <div className="relative w-full min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search worker…"
                  className="h-11 min-h-[44px] border-zinc-200/65 bg-white pl-8 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-white focus-visible:border-zinc-300/90 focus-visible:ring-zinc-400/18 md:h-10 md:min-h-10"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-full shrink-0 gap-1.5 rounded-sm border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-zinc-50/90 lg:ml-auto lg:w-auto dark:border-border dark:bg-transparent dark:hover:bg-muted/30"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </FilterBar>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="md:hidden">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn(psShell, "space-y-3 p-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className={cn(psShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No workers found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting your date range, project, or search query.
              </p>
            </div>
          ) : (
            paged.map((r) => (
              <div
                key={r.workerId}
                className={cn(
                  psShell,
                  "space-y-3 p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-zinc-200/70 dark:hover:border-border/60"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    onClick={() => router.push(`/workers/${r.workerId}`)}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none tabular-nums antialiased",
                        workerAvatarRing,
                        avatarRingClass(r.workerId)
                      )}
                      aria-hidden
                    >
                      {workerInitials(r.workerName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                        {r.workerName}
                      </span>
                      <span className="mt-0.5 block max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-500/75 dark:text-zinc-400/85">
                        {truncateId(r.workerId)}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-start gap-1">
                    <BalanceChip balance={r.balance} />
                    <RowActionsMenu
                      appearance="list"
                      ariaLabel={`Actions for ${r.workerName}`}
                      actions={[
                        { label: "View", onClick: () => router.push(`/workers/${r.workerId}`) },
                        { label: "Edit", onClick: () => router.push("/workers") },
                        {
                          label: "Delete",
                          onClick: async () => {
                            if (deletingId) return;
                            if (
                              !window.confirm(
                                `Delete worker "${r.workerName}"? This cannot be undone.`
                              )
                            )
                              return;
                            setDeletingId(r.workerId);
                            const res = await deleteWorkerAction(r.workerId);
                            if (!res.ok) {
                              toast({
                                title: "Delete failed",
                                description: res.error,
                                variant: "error",
                              });
                            } else {
                              toast({ title: "Deleted", variant: "success" });
                            }
                            setDeletingId(null);
                            await load();
                          },
                          destructive: true,
                          disabled: deletingId === r.workerId,
                        },
                      ]}
                    />
                  </div>
                </div>
                <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs tabular-nums">
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Earned
                    </dt>
                    <dd className="min-w-0 break-words text-[12px] text-zinc-700 dark:text-zinc-200">
                      {fmtUsd(r.earned)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Reimb.
                    </dt>
                    <dd className="min-w-0 break-words text-[12px] text-zinc-700 dark:text-zinc-200">
                      {fmtUsd(r.reimbursements)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Should pay
                    </dt>
                    <dd className="min-w-0 break-words text-[12px] text-zinc-700 dark:text-zinc-200">
                      {fmtUsd(r.shouldPay)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Paid
                    </dt>
                    <dd className="min-w-0 break-words text-[12px] text-zinc-700 dark:text-zinc-200">
                      {fmtUsd(r.paid)}
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Balance
                    </dt>
                    <dd className="min-w-0 font-medium leading-snug text-zinc-900 dark:text-foreground">
                      <span className="block text-[16px] tabular-nums tracking-tight">
                        {fmtUsd(r.balance)}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                        {balanceStatusLabel(r.balance)}
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 min-h-[44px] rounded-sm shadow-none md:h-8 md:min-h-0"
                      onClick={() => {
                        setPayTarget(r);
                        setPayOpen(true);
                      }}
                    >
                      Pay Worker
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 min-h-[44px] rounded-sm shadow-none md:h-8 md:min-h-0"
                      asChild
                    >
                      <Link
                        href={`/worker/${encodeURIComponent(r.workerId)}/monthly-report?month=${encodeURIComponent(payrollMonthYm)}`}
                      >
                        Monthly Report
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div
          className={cn(
            psShell,
            "hidden overflow-hidden md:block",
            refreshing && rows.length > 0 && "pointer-events-none opacity-60"
          )}
          aria-busy={refreshing && rows.length > 0 ? true : undefined}
        >
          {refreshing && rows.length > 0 ? (
            <div className="flex justify-center border-b border-zinc-100/90 py-1 dark:border-border/50">
              <span className="text-xs text-muted-foreground">Updating…</span>
            </div>
          ) : null}
          <div className="overflow-x-auto pb-1 md:pb-3">
            <table className="w-full min-w-[980px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100/90 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th
                    className="min-w-[240px] px-3 py-2 text-left text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground cursor-pointer select-none"
                    onClick={() => toggleSort("workerName")}
                  >
                    Worker
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground tabular-nums cursor-pointer select-none"
                    onClick={() => toggleSort("earned")}
                  >
                    Earned
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground tabular-nums cursor-pointer select-none"
                    onClick={() => toggleSort("reimbursements")}
                  >
                    Reimb.
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground tabular-nums cursor-pointer select-none"
                    onClick={() => toggleSort("shouldPay")}
                  >
                    Should Pay
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground tabular-nums cursor-pointer select-none"
                    onClick={() => toggleSort("paid")}
                  >
                    Paid
                  </th>
                  <th
                    className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground tabular-nums cursor-pointer select-none"
                    onClick={() => toggleSort("balance")}
                  >
                    Balance
                  </th>
                  <th className="w-[120px] px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
                    Pay
                  </th>
                  <th className="w-[220px] px-3 py-2 text-right text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-100/55 dark:border-border/35">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <Skeleton className="ml-auto h-4 w-16" />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-8 w-24 rounded-sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-8 w-28 rounded-sm" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                        No results
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try adjusting your date range, project, or search query.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr
                      key={r.workerId}
                      className={cn(
                        listTableRowClassName,
                        "border-b border-zinc-100/45 dark:border-border/22",
                        "!transition-colors duration-150 ease-out motion-reduce:!transition-none",
                        "hover:!bg-zinc-50/[0.38] dark:hover:!bg-muted/[0.06]",
                        "focus-within:!bg-zinc-50/28 dark:focus-within:!bg-muted/[0.05]"
                      )}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open ${r.workerName}`}
                      onClick={() => router.push(`/workers/${r.workerId}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/workers/${r.workerId}`);
                        }
                      }}
                    >
                      <td className={cn("px-3 py-2.5 align-middle", listTablePrimaryCellClassName)}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none tabular-nums antialiased",
                              workerAvatarRing,
                              avatarRingClass(r.workerId)
                            )}
                            aria-hidden
                          >
                            {workerInitials(r.workerName)}
                          </span>
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                              {r.workerName}
                            </p>
                            <p className="max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-500/75 dark:text-zinc-400/85">
                              {truncateId(r.workerId)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right align-middle tabular-nums",
                          listTableAmountCellClassName
                        )}
                      >
                        {fmtUsd(r.earned)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right align-middle tabular-nums",
                          listTableAmountCellClassName
                        )}
                      >
                        {fmtUsd(r.reimbursements)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right align-middle tabular-nums",
                          listTableAmountCellClassName
                        )}
                      >
                        {fmtUsd(r.shouldPay)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right align-middle tabular-nums",
                          listTableAmountCellClassName
                        )}
                      >
                        {fmtUsd(r.paid)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right align-middle tabular-nums",
                          listTableAmountCellClassName
                        )}
                      >
                        <div className="text-base font-semibold tabular-nums tracking-tight text-zinc-800 dark:text-zinc-100">
                          {fmtUsd(r.balance)}
                        </div>
                        <div className="mt-0.5 flex justify-end">
                          <BalanceChip balance={r.balance} />
                        </div>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm border-zinc-200/80 bg-transparent text-muted-foreground shadow-none hover:bg-zinc-50 hover:text-foreground dark:border-border dark:hover:bg-muted/30"
                          onClick={() => {
                            setPayTarget(r);
                            setPayOpen(true);
                          }}
                        >
                          Pay Worker
                        </Button>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <RowActionsMenu
                            appearance="list"
                            ariaLabel={`Actions for ${r.workerName}`}
                            actions={[
                              {
                                label: "View",
                                onClick: () => router.push(`/workers/${r.workerId}`),
                              },
                              {
                                label: "Monthly Report",
                                onClick: () =>
                                  router.push(
                                    `/worker/${encodeURIComponent(r.workerId)}/monthly-report?month=${encodeURIComponent(payrollMonthYm)}`
                                  ),
                              },
                              { label: "Edit", onClick: () => router.push("/workers") },
                              {
                                label: "Delete",
                                onClick: async () => {
                                  if (deletingId) return;
                                  if (
                                    !window.confirm(
                                      `Delete worker "${r.workerName}"? This cannot be undone.`
                                    )
                                  )
                                    return;
                                  setDeletingId(r.workerId);
                                  const res = await deleteWorkerAction(r.workerId);
                                  if (!res.ok) {
                                    toast({
                                      title: "Delete failed",
                                      description: res.error,
                                      variant: "error",
                                    });
                                  } else {
                                    toast({ title: "Deleted", variant: "success" });
                                  }
                                  setDeletingId(null);
                                  await load();
                                },
                                destructive: true,
                                disabled: deletingId === r.workerId,
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-zinc-100/90 px-3 py-3 text-sm text-muted-foreground dark:border-border/50">
            <div className="flex flex-col gap-3 max-md:[&_button]:min-h-11 sm:flex-row sm:items-center sm:justify-between">
              <span className="tabular-nums">
                {filtered.length === 0
                  ? "0"
                  : Math.min(filtered.length, (page - 1) * pageSize + 1).toString()}
                –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 text-sm text-muted-foreground max-md:[&_button]:min-h-11 sm:flex-row sm:items-center sm:justify-between md:hidden">
          <span className="tabular-nums">
            {filtered.length === 0
              ? "0"
              : Math.min(filtered.length, (page - 1) * pageSize + 1).toString()}
            –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        {payTarget ? (
          <PayWorkerModal
            open={payOpen}
            onOpenChange={setPayOpen}
            workerId={payTarget.workerId}
            workerName={payTarget.workerName}
            defaultAmount={Math.max(0, payTarget.balance)}
            onSuccess={load}
            onPaymentSuccess={(payment) => {
              if (payment.id) {
                setReceiptPaymentId(payment.id);
                setReceiptOpen(true);
              }
            }}
          />
        ) : null}

        <WorkerPaymentReceiptPreviewModal
          paymentId={receiptPaymentId}
          open={receiptOpen}
          onOpenChange={(open) => {
            setReceiptOpen(open);
            if (!open) setReceiptPaymentId(null);
          }}
        />
      </div>
    </div>
  );
}
