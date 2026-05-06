"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeftRight,
  Briefcase,
  DollarSign,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { FilterBar } from "@/components/filter-bar";
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
  deletable?: boolean;
};

const wbShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

/** KPI strip only — lighter edge + shadow than main surfaces */
const wbKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const wbKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100/90 text-zinc-500 md:h-8 md:w-8 dark:bg-muted dark:text-muted-foreground";

const AVATAR_RING = [
  "bg-sky-500/[0.09] text-sky-900 dark:text-sky-100",
  "bg-violet-500/[0.09] text-violet-900 dark:text-violet-100",
  "bg-emerald-500/[0.09] text-emerald-900 dark:text-emerald-100",
  "bg-amber-500/[0.09] text-amber-950 dark:text-amber-100",
  "bg-rose-500/[0.09] text-rose-900 dark:text-rose-100",
  "bg-cyan-500/[0.09] text-cyan-900 dark:text-cyan-100",
];

const workerAvatarRing =
  "ring-1 ring-inset ring-zinc-950/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-none dark:ring-white/[0.07]";

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  const one = parts[0] ?? name;
  return one.slice(0, 2).toUpperCase();
}

function avatarRingClass(workerId: string): string {
  let s = 0;
  for (let i = 0; i < workerId.length; i++) s += workerId.charCodeAt(i);
  return AVATAR_RING[s % AVATAR_RING.length] ?? AVATAR_RING[0];
}

function BalanceStatusChip({ balance }: { balance: number }) {
  if (balance > 0) {
    return (
      <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-rose-500/[0.07] bg-gradient-to-b from-rose-500/[0.045] to-rose-500/[0.02] px-2 py-px text-[10px] font-medium tracking-wide tabular-nums text-rose-800/78 dark:border-rose-400/12 dark:from-rose-500/[0.06] dark:to-transparent dark:text-rose-100/78">
        <span
          className="h-[5px] w-[5px] shrink-0 rounded-full bg-rose-500/45 shadow-[0_0_0_1px_rgba(244,63,94,0.12)]"
          aria-hidden
        />
        Owed
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-emerald-500/[0.07] bg-gradient-to-b from-emerald-500/[0.04] to-emerald-500/[0.015] px-2 py-px text-[10px] font-medium tracking-wide tabular-nums text-emerald-800/75 dark:border-emerald-400/12 dark:from-emerald-500/[0.055] dark:to-transparent dark:text-emerald-100/78">
      <span
        className="h-[5px] w-[5px] shrink-0 rounded-full bg-emerald-500/42 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
        aria-hidden
      />
      Paid
    </span>
  );
}

function truncateId(id: string, max = 8): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-3)}`;
}

export default function WorkerBalancesPage() {
  const [rows, setRows] = React.useState<WorkerBalanceRow[]>([]);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const firstLoadRef = React.useRef(true);
  const fetchGenRef = React.useRef(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkerBalanceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const load = React.useCallback(async () => {
    const gen = ++fetchGenRef.current;
    if (firstLoadRef.current) setInitialLoading(true);
    else setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/worker-balances?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load.");
      if (gen !== fetchGenRef.current) return;
      setRows(data.balances ?? []);
    } catch (e) {
      if (gen === fetchGenRef.current) {
        setMessage(e instanceof Error ? e.message : "Failed to load.");
        setRows([]);
      }
    } finally {
      if (gen === fetchGenRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
        firstLoadRef.current = false;
      }
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/labor/worker-balances/${encodeURIComponent(deleteTarget.workerId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Delete failed.");
      if (typeof data.warning === "string" && data.warning.trim()) {
        setMessage(data.warning.trim());
      } else {
        setMessage(null);
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, load]);

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.workerName.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const summary = React.useMemo(() => {
    const workersOwed = rows.filter((r) => r.balance > 0).length;
    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const laborOwed = rows.reduce((s, r) => s + r.laborOwed, 0);
    const reimbursements = rows.reduce((s, r) => s + r.reimbursements, 0);
    const advances = rows.reduce((s, r) => s + r.advances, 0);
    return { workersOwed, totalBalance, laborOwed, reimbursements, advances };
  }, [rows]);

  const fetchBusy = initialLoading || refreshing;

  const searchInput = (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search workers…"
        className="h-11 min-h-[44px] pl-8 text-sm md:h-10 md:min-h-10"
        aria-label="Search workers"
      />
    </div>
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
            title="Worker Balances"
            subtitle="Labor owed, reimbursements, payments, and balance per worker."
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 gap-1.5 shadow-none md:min-h-9"
                onClick={() => void load()}
                disabled={fetchBusy}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", fetchBusy && "animate-spin")} aria-hidden />
                {fetchBusy ? "Loading…" : "Refresh"}
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Balances"
          fab={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 rounded-full border-zinc-200/80 shadow-none dark:border-border/60"
              aria-label="Refresh balances"
              onClick={() => void load()}
              disabled={fetchBusy}
            >
              <RefreshCw className={cn("h-4 w-4", fetchBusy && "animate-spin")} aria-hidden />
            </Button>
          }
        />

        {!initialLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            <div
              className={cn(
                wbKpiTile,
                "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={wbKpiIcon}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Workers owed
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.workersOwed}
                </p>
              </div>
            </div>
            <div
              className={cn(
                wbKpiTile,
                "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={wbKpiIcon}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total balance
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.totalBalance)}
                </p>
              </div>
            </div>
            <div
              className={cn(
                wbKpiTile,
                "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={wbKpiIcon}>
                <Briefcase className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Labor owed
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.laborOwed)}
                </p>
              </div>
            </div>
            <div
              className={cn(
                wbKpiTile,
                "flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={wbKpiIcon}>
                <FileText className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Reimbursements
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.reimbursements)}
                </p>
              </div>
            </div>
            <div
              className={cn(
                wbKpiTile,
                "col-span-2 flex min-h-[48px] items-center gap-1.5 px-2 py-1.5 sm:col-span-1 md:h-[62px] md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={wbKpiIcon}>
                <ArrowLeftRight
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Advances
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.advances)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(wbKpiTile, "flex h-[52px] items-center gap-2 px-3 md:h-[62px]")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={0}
          filtersTriggerClassName="h-11 min-h-[44px]"
          searchSlot={searchInput}
        />

        <FilterBar className="hidden min-w-0 md:flex md:flex-row md:items-center md:gap-3 md:pb-0 md:pt-0">
          <div className="min-w-0 flex-1">{searchInput}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-1.5 rounded-sm shadow-none"
            onClick={() => setFiltersOpen(true)}
          >
            Filters
          </Button>
        </FilterBar>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] w-full rounded-sm"
            onClick={() => {
              void load();
              setFiltersOpen(false);
            }}
            disabled={fetchBusy}
          >
            <SubmitSpinner loading={fetchBusy} className="mr-2" />
            Refresh balances
          </Button>
          <Button
            type="button"
            className="h-11 min-h-[44px] w-full rounded-sm"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {message ? (
          <p className="border-b border-zinc-200/80 pb-2 text-sm text-muted-foreground dark:border-border/60">
            {message}
          </p>
        ) : null}

        {/* Mobile: stacked cards */}
        <div className="md:hidden">
          {initialLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn(wbShell, "space-y-3 p-3")}>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-[min(200px,55%)]" />
                      <Skeleton className="h-3 w-[min(120px,40%)]" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-full max-w-[140px]" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className={cn(wbShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No workers yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Balances appear when workers have labor, reimbursements, or payments.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No workers match your search."
            />
          ) : (
            <div
              className={cn("flex flex-col gap-2", refreshing && "pointer-events-none opacity-60")}
              aria-busy={refreshing || undefined}
            >
              {refreshing ? (
                <div className="flex justify-center py-1">
                  <span className="text-xs text-muted-foreground">Updating…</span>
                </div>
              ) : null}
              {filteredRows.map((r) => (
                <div
                  key={r.workerId}
                  className={cn(
                    wbShell,
                    "space-y-3 p-3 transition-[box-shadow,border-color] duration-150 hover:border-zinc-300/80 dark:hover:border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
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
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/labor/workers/${r.workerId}/balance`}
                        title={r.workerName}
                        className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-zinc-900 hover:underline dark:text-foreground"
                      >
                        {r.workerName}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-[9px] tabular-nums text-zinc-400/65 dark:text-zinc-500/80">
                        {truncateId(r.workerId)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100/90 pb-2 dark:border-border/50">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Balance
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground">
                        {fmtUsd(r.balance)}
                      </span>
                      <BalanceStatusChip balance={r.balance} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Labor
                      </dt>
                      <dd className="truncate tabular-nums text-zinc-800 dark:text-zinc-100">
                        {fmtUsd(r.laborOwed)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Reimb.
                      </dt>
                      <dd className="truncate tabular-nums text-zinc-800 dark:text-zinc-100">
                        {fmtUsd(r.reimbursements)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Payments
                      </dt>
                      <dd className="truncate tabular-nums text-zinc-800 dark:text-zinc-100">
                        {fmtUsd(r.payments)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Advances
                      </dt>
                      <dd className="truncate tabular-nums text-zinc-800 dark:text-zinc-100">
                        {fmtUsd(r.advances)}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2 border-t border-zinc-100/90 pt-2 dark:border-border/50">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 min-h-[44px] flex-1 rounded-sm shadow-none"
                      asChild
                    >
                      <Link href={`/labor/workers/${r.workerId}/balance`}>Open detail</Link>
                    </Button>
                    {r.deletable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 min-h-[44px] flex-1 rounded-sm text-destructive shadow-none hover:bg-rose-500/[0.06] hover:text-destructive"
                        aria-label={`Delete ${r.workerName}`}
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div
          className={cn(
            wbShell,
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className="min-w-[200px] px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Worker
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    Labor
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    Reimb.
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    Payments
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    Advances
                  </th>
                  <th className="min-w-[128px] whitespace-nowrap px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    Balance
                  </th>
                  <th className="w-14 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-100/80 dark:border-border/40">
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
                        <td key={j} className="px-3 py-2.5 text-right">
                          <Skeleton className="ml-auto h-4 w-14" />
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right">
                        <Skeleton className="ml-auto h-8 w-8 rounded-sm" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="border-b border-zinc-100/80 dark:border-border/40">
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                        No workers yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Balances appear when workers have labor, reimbursements, or payments.
                      </p>
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr className="border-b border-zinc-100/80 dark:border-border/40">
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No workers match your search.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr
                      key={r.workerId}
                      className={cn(
                        listTableRowStaticClassName,
                        "border-b border-zinc-100/70 dark:border-border/35",
                        "transition-[background-color] duration-200 ease-out motion-reduce:transition-none",
                        "hover:bg-zinc-50/55 dark:hover:bg-muted/10",
                        "focus-within:bg-zinc-50/45 dark:focus-within:bg-muted/8"
                      )}
                    >
                      <td className="px-3 py-2.5 align-middle">
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
                            <Link
                              href={`/labor/workers/${r.workerId}/balance`}
                              title={r.workerName}
                              className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-zinc-900 hover:underline dark:text-foreground"
                            >
                              {r.workerName}
                            </Link>
                            <p className="max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-400/70 dark:text-zinc-500/75">
                              {truncateId(r.workerId)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">
                        {fmtUsd(r.laborOwed)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">
                        {fmtUsd(r.reimbursements)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">
                        {fmtUsd(r.payments)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">
                        {fmtUsd(r.advances)}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-base font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground">
                            {fmtUsd(r.balance)}
                          </span>
                          <BalanceStatusChip balance={r.balance} />
                        </div>
                      </td>
                      <td
                        className="px-2 py-2.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.deletable ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-sm text-muted-foreground/35 opacity-100 transition-opacity hover:bg-zinc-100/80 hover:text-destructive dark:text-muted-foreground/30 dark:hover:bg-muted/40 md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                            aria-label={`Delete ${r.workerName}`}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="inline-block w-8" aria-hidden />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog
          open={deleteTarget != null}
          onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
        >
          <DialogContent className="max-w-sm rounded-md border-border/60 p-5">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Delete worker?</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Remove{" "}
                <span className="font-medium text-foreground">{deleteTarget?.workerName}</span> from
                workers. Only allowed when balance is $0.00 with no labor entries or payments.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 border-t border-border/60 pt-3 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                className="btn-outline-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={confirmDelete} disabled={deleteBusy}>
                <SubmitSpinner loading={deleteBusy} className="mr-2" />
                {deleteBusy ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
