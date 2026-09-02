"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { NeoAmount, NeoMobileCard, NeoStatus, NeoTable, NeoToolbar } from "@/components/base";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { formatCurrency } from "@/lib/formatters";
import { workerDetailPathWithReturnTo, workforceReportsReturnPath } from "@/lib/worker-return-path";

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

/** KPI strip only — lighter edge + shadow than main surfaces */
const wbKpiTile =
  "rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational md:rounded-hh-task";

const wbKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)] md:h-8 md:w-8";

const AVATAR_RING = [
  "bg-slate-500/[0.08] text-slate-900 dark:text-slate-100",
  "bg-zinc-500/[0.08] text-zinc-900 dark:text-zinc-100",
  "bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)] text-[var(--hh-success)]",
  "bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)] text-[var(--hh-warning)]",
  "bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)] text-[var(--hh-danger)]",
  "bg-slate-600/[0.08] text-slate-900 dark:text-slate-100",
];

const workerAvatarRing =
  "ring-1 ring-inset ring-zinc-950/[0.05] shadow-operational dark:shadow-none dark:ring-white/[0.07]";

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
    return <NeoStatus label="Owed" variant="danger" />;
  }
  return <NeoStatus label="Paid" variant="success" />;
}

export default function WorkerBalancesPage() {
  const pathname = usePathname();
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
  const workerDetailHref = React.useCallback(
    (workerId: string) =>
      pathname.startsWith("/reports/workforce")
        ? workerDetailPathWithReturnTo(workerId, workforceReportsReturnPath("balances"))
        : `/workers/${encodeURIComponent(workerId)}`,
    [pathname]
  );

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
        " min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          " page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-[var(--hh-border)] pb-3 lg:items-baseline lg:gap-x-4 [&_h1]:!text-hh-financial-total [&_h1]:!font-semibold [&_h1]:!leading-none [&_h1]:!tracking-normal [&_h1]:!text-[var(--hh-text-primary)] [&_p]:!mt-1 [&_p]:!max-w-xl [&_p]:!text-hh-body [&_p]:!leading-snug [&_p]:!text-[var(--hh-text-secondary)]"
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
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
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
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Total balance
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.totalBalance)}
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
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Labor owed
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.laborOwed)}
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
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Reimbursements
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.reimbursements)}
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
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Advances
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.advances)}
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

        <NeoToolbar className="hidden min-w-0 md:flex md:flex-row md:items-center md:gap-3 md:pb-0 md:pt-0">
          <div className="min-w-0 flex-1">{searchInput}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-1.5 rounded-hh-compact shadow-none"
            onClick={() => setFiltersOpen(true)}
          >
            Filters
          </Button>
        </NeoToolbar>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] w-full rounded-hh-compact"
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
            className="h-11 min-h-[44px] w-full rounded-hh-compact"
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
                <NeoMobileCard key={i} className="space-y-3 p-3">
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
                </NeoMobileCard>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <NeoMobileCard className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--hh-text-primary)]">No workers yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Balances appear when workers have labor, reimbursements, or payments.
              </p>
            </NeoMobileCard>
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
                <NeoMobileCard
                  key={r.workerId}
                  data-testid={`worker-balance-card-${r.workerId}`}
                  className="space-y-3 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-hh-metadata font-semibold leading-none tabular-nums antialiased",
                        workerAvatarRing,
                        avatarRingClass(r.workerId)
                      )}
                      aria-hidden
                    >
                      {workerInitials(r.workerName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={workerDetailHref(r.workerId)}
                        title={r.workerName}
                        className="line-clamp-2 text-hh-section-title font-semibold leading-snug tracking-normal text-[var(--hh-text-primary)] hover:underline"
                      >
                        {r.workerName}
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100/90 pb-2 dark:border-border/50">
                    <span className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                      Balance
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <NeoAmount
                        tone={r.balance > 0 ? "danger" : "income"}
                        className="text-xl tracking-normal"
                      >
                        {formatCurrency(r.balance)}
                      </NeoAmount>
                      <BalanceStatusChip balance={r.balance} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Labor
                      </dt>
                      <dd className="truncate">
                        <NeoAmount>{formatCurrency(r.laborOwed)}</NeoAmount>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Reimbursements
                      </dt>
                      <dd className="truncate">
                        <NeoAmount>{formatCurrency(r.reimbursements)}</NeoAmount>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Payments
                      </dt>
                      <dd className="truncate">
                        <NeoAmount tone="income">{formatCurrency(r.payments)}</NeoAmount>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Advances
                      </dt>
                      <dd className="truncate">
                        <NeoAmount>{formatCurrency(r.advances)}</NeoAmount>
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2 border-t border-zinc-100/90 pt-2 dark:border-border/50">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 min-h-[44px] flex-1 rounded-hh-compact shadow-none"
                      asChild
                    >
                      <Link href={workerDetailHref(r.workerId)}>Open Worker</Link>
                    </Button>
                    {r.deletable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 min-h-[44px] flex-1 rounded-hh-compact text-destructive shadow-none hover:bg-[var(--hh-danger-soft-fill)] hover:text-destructive"
                        aria-label={`Delete ${r.workerName}`}
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <NeoTable
          className={cn(
            "hidden md:block",
            refreshing && rows.length > 0 && "pointer-events-none opacity-60"
          )}
          tableClassName="min-w-[720px] lg:min-w-0"
          busy={refreshing && rows.length > 0}
        >
          <thead>
            <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
              <th className="min-w-[200px] px-3 py-2 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                Worker
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums">
                Labor
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums">
                Reimbursements
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums">
                Payments
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums">
                Advances
              </th>
              <th className="min-w-[128px] whitespace-nowrap px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums">
                Balance
              </th>
              <th className="w-14 px-2 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
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
                    <Skeleton className="ml-auto h-8 w-8 rounded-hh-compact" />
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
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No workers match your search.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr
                  key={r.workerId}
                  data-testid={`worker-balance-row-${r.workerId}`}
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
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-hh-status font-semibold leading-none tabular-nums antialiased",
                          workerAvatarRing,
                          avatarRingClass(r.workerId)
                        )}
                        aria-hidden
                      >
                        {workerInitials(r.workerName)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={workerDetailHref(r.workerId)}
                          title={r.workerName}
                          className="line-clamp-2 text-hh-table-cell font-semibold leading-snug tracking-normal text-zinc-900 hover:underline dark:text-foreground"
                        >
                          {r.workerName}
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <NeoAmount>{formatCurrency(r.laborOwed)}</NeoAmount>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <NeoAmount>{formatCurrency(r.reimbursements)}</NeoAmount>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <NeoAmount tone="income">{formatCurrency(r.payments)}</NeoAmount>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <NeoAmount>{formatCurrency(r.advances)}</NeoAmount>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <NeoAmount
                        tone={r.balance > 0 ? "danger" : "income"}
                        className="text-base tracking-normal"
                      >
                        {formatCurrency(r.balance)}
                      </NeoAmount>
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
                        className="h-10 w-10 rounded-hh-compact text-muted-foreground/35 opacity-100 transition-opacity hover:bg-zinc-100/80 hover:text-destructive dark:text-muted-foreground/30 dark:hover:bg-muted/40 md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
        </NeoTable>

        <Dialog
          open={deleteTarget != null}
          onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
        >
          <DialogContent className="max-w-sm rounded-hh-compact border-border/60 p-5">
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
