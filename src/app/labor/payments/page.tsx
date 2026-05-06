"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { WorkerPaymentReceiptPreviewModal } from "@/components/labor/worker-payment-receipt-preview-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Divide,
  DollarSign,
  ListOrdered,
  MoreHorizontal,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { FilterBar } from "@/components/filter-bar";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  deleteWorkerPayment,
  getProjects,
  getWorkerPayments,
  getLaborWorkersList,
  type WorkerPayment,
} from "@/lib/data";
import { dispatchClientDataSync } from "@/lib/sync-router-client";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const wpShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const wpKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const wpKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100/55 text-zinc-500 md:h-8 md:w-8 dark:bg-muted/60 dark:text-muted-foreground";

/** Zinc-only tints — payout history, not “demo” rainbow rings */
const AVATAR_RING = [
  "bg-zinc-200/75 text-zinc-900 dark:bg-zinc-700/45 dark:text-zinc-100",
  "bg-zinc-300/55 text-zinc-900 dark:bg-zinc-600/35 dark:text-zinc-100",
  "bg-zinc-200/60 text-zinc-800 dark:bg-zinc-700/40 dark:text-zinc-100",
  "bg-zinc-100/90 text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100",
  "bg-zinc-300/45 text-zinc-900 dark:bg-zinc-600/30 dark:text-zinc-100",
  "bg-zinc-200/50 text-zinc-800 dark:bg-zinc-700/38 dark:text-zinc-100",
];

const workerAvatarRing =
  "ring-1 ring-inset ring-zinc-950/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-none dark:ring-white/[0.07]";

const METHOD_DOT_CLASS =
  "h-[4px] w-[4px] shrink-0 rounded-full bg-zinc-400/65 ring-1 ring-zinc-950/[0.04] dark:bg-zinc-500/55 dark:ring-white/[0.06]";

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

function truncateId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function thisMonthPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function thisMonthLabel(): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
}

function PaymentMethodLabel({ method }: { method: string }) {
  const label = method.trim() || "—";
  if (label === "—") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={METHOD_DOT_CLASS} aria-hidden />
      <span className="min-w-0 truncate text-sm font-normal leading-snug text-zinc-600 dark:text-zinc-300">
        {label}
      </span>
    </span>
  );
}

function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <span className="ml-0.5 inline-flex opacity-0 group-hover/th:opacity-40" aria-hidden>
        <ArrowDown className="h-3 w-3" strokeWidth={2} />
      </span>
    );
  }
  return dir === "desc" ? (
    <ArrowDown className="ml-0.5 inline h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
  ) : (
    <ArrowUp className="ml-0.5 inline h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
  );
}

function PaymentRowActionsMenu({
  ariaLabel,
  onViewReceipt,
  onDelete,
  layout,
}: {
  ariaLabel: string;
  onViewReceipt: () => void;
  onDelete: () => void;
  layout: "desktop" | "mobile";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 rounded-sm text-muted-foreground/45 outline-none transition-colors",
            "hover:bg-zinc-100/90 hover:text-foreground focus-visible:ring-2 focus-visible:ring-zinc-400/30 dark:hover:bg-muted/45 dark:hover:text-foreground",
            layout === "mobile" ? "h-11 w-11 min-h-[44px] min-w-[44px]" : "h-8 w-8 md:h-8 md:w-8"
          )}
          aria-label={ariaLabel}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[10rem] rounded-md border border-border/60 bg-popover p-1 shadow-[var(--shadow-popover)]"
      >
        <DropdownMenuItem
          className="cursor-pointer text-sm"
          onSelect={() => {
            onViewReceipt();
          }}
        >
          View receipt
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn(
            "cursor-pointer text-sm text-destructive focus:bg-destructive/10 focus:text-destructive",
            "dark:focus:bg-destructive/15 dark:focus:text-destructive"
          )}
          onSelect={() => {
            onDelete();
          }}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function WorkerPaymentsPage() {
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getLaborWorkersList>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const [sort, setSort] = React.useState<{
    key: "paymentDate" | "amount" | "method";
    dir: "asc" | "desc";
  }>({
    key: "paymentDate",
    dir: "desc",
  });
  const [receiptPreviewId, setReceiptPreviewId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [w, p, list] = await Promise.all([
        getLaborWorkersList(),
        getProjects(),
        getWorkerPayments({ limit: 500 }),
      ]);
      setWorkers(w);
      setProjects(p);
      setRows(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const workerNameById = React.useMemo(
    () => new Map(workers.map((w) => [w.id, w.name] as const)),
    [workers]
  );
  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name] as const)),
    [projects]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = workerNameById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            String(r.amount ?? "")
              .toLowerCase()
              .includes(q) ||
            (r.paymentMethod ?? "").toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "method")
        return (
          (String(a.paymentMethod ?? "").localeCompare(String(b.paymentMethod ?? "")) || 0) * dir
        );
      return (String(a.paymentDate).localeCompare(String(b.paymentDate)) || 0) * dir;
    });
  }, [rows, query, workerNameById, projectNameById, sort]);

  const summary = React.useMemo(() => {
    const prefix = thisMonthPrefix();
    let thisMonthTotal = 0;
    const workerIds = new Set<string>();
    let totalPaid = 0;
    for (const r of rows) {
      totalPaid += r.amount ?? 0;
      workerIds.add(r.workerId);
      if (String(r.paymentDate).startsWith(prefix)) thisMonthTotal += r.amount ?? 0;
    }
    const count = rows.length;
    const avgPayment = count > 0 ? totalPaid / count : 0;
    return {
      totalPaid,
      count,
      thisMonthTotal,
      workersPaid: workerIds.size,
      avgPayment,
    };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => setPage(1), [query, sort]);

  const toggleSort = (key: "paymentDate" | "amount" | "method") => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this payment record?")) return;
    let snapshot: WorkerPayment[] | undefined;
    setRows((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== id);
    });
    try {
      await deleteWorkerPayment(id);
      dispatchClientDataSync({ reason: "worker-payment-deleted" });
      void load();
    } catch (e) {
      if (snapshot) setRows(snapshot);
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const sortFilterActive = sort.key !== "paymentDate" || sort.dir !== "desc" ? 1 : 0;
  const initialLoading = loading && rows.length === 0;
  const refreshing = loading && rows.length > 0;

  const searchInput = (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search payments, workers…"
        className="h-11 min-h-[44px] pl-8 text-sm md:h-10 md:min-h-10"
        aria-label="Search payments and workers"
      />
    </div>
  );

  const thClass =
    "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground";
  const thRight =
    "px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums";
  const sortableTh =
    "group/th cursor-pointer select-none text-muted-foreground transition-colors hover:text-zinc-600 dark:hover:text-zinc-300";

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <WorkerPaymentReceiptPreviewModal
        paymentId={receiptPreviewId}
        open={receiptPreviewId != null}
        onOpenChange={(o) => {
          if (!o) setReceiptPreviewId(null);
        }}
      />

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
            title="Worker Payments"
            subtitle="Payment history for worker payouts."
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 gap-1.5 shadow-none"
                asChild
              >
                <Link href="/labor/payroll">
                  <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                  Payroll Summary
                </Link>
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Worker Payments"
          fab={<MobileFabPlus href="/labor/payroll" ariaLabel="Open payroll summary" />}
        />

        {!initialLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            <div
              className={cn(
                wpKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total paid
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.totalPaid)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">All time</p>
              </div>
            </div>
            <div
              className={cn(
                wpKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Payments count
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.count}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">All records</p>
              </div>
            </div>
            <div
              className={cn(
                wpKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  This month
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.thisMonthTotal)}
                </p>
                <p className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground">
                  {thisMonthLabel()}
                </p>
              </div>
            </div>
            <div
              className={cn(
                wpKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Workers paid
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.workersPaid}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Unique</p>
              </div>
            </div>
            <div
              className={cn(
                wpKpiTile,
                "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <Divide className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Avg payment
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.avgPayment)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Per payment</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(wpKpiTile, "flex h-[52px] items-center gap-2 px-3 md:h-[62px]")}
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
          activeFilterCount={sortFilterActive}
          filtersTriggerClassName="h-11 min-h-[44px]"
          searchSlot={searchInput}
        />

        <FilterBar className="hidden min-w-0 md:flex md:flex-row md:items-center md:gap-3 md:pb-0 md:pt-0">
          <div className="min-w-0 flex-1">{searchInput}</div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5 rounded-sm shadow-none"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 gap-1.5 shadow-none"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </FilterBar>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sort by</p>
            <Select
              value={sort.key}
              onChange={(e) =>
                setSort((s) => ({
                  ...s,
                  key: e.target.value as "paymentDate" | "amount" | "method",
                }))
              }
              className="w-full"
            >
              <option value="paymentDate">Payment date</option>
              <option value="amount">Amount</option>
              <option value="method">Payment method</option>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Order</p>
            <Select
              value={sort.dir}
              onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
              className="w-full"
            >
              <option value="desc">Newest / high first</option>
              <option value="asc">Oldest / low first</option>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] w-full rounded-sm"
            onClick={() => {
              void load();
              setFiltersOpen(false);
            }}
            disabled={loading}
          >
            <SubmitSpinner loading={loading} className="mr-2" />
            Refresh
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

        {/* Mobile stacked cards */}
        <div className="md:hidden">
          {initialLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn(wpShell, "space-y-3 p-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-11 w-11 shrink-0 rounded-sm" />
                  </div>
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className={cn(wpShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No payments yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Payouts you record will appear here with receipt links.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No payments match your search."
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
              {paged.map((r) => {
                const wName = workerNameById.get(r.workerId) ?? r.workerId;
                const proj = r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : null;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      wpShell,
                      "space-y-3 p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-zinc-200/70 dark:hover:border-border/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none tabular-nums antialiased",
                            workerAvatarRing,
                            avatarRingClass(r.workerId)
                          )}
                          aria-hidden
                        >
                          {workerInitials(wName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                            {wName}
                          </p>
                          <p className="mt-0.5 max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-400/70 dark:text-zinc-500/75">
                            {truncateId(r.workerId)}
                          </p>
                        </div>
                      </div>
                      <PaymentRowActionsMenu
                        ariaLabel={`Actions for payment ${wName}`}
                        layout="mobile"
                        onViewReceipt={() => setReceiptPreviewId(r.id)}
                        onDelete={() => handleDelete(r.id)}
                      />
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100/70 pb-2 dark:border-border/40">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Amount
                      </span>
                      <span className="max-w-full min-w-0 text-right text-xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground">
                        {fmtUsd(r.amount)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Method
                        </dt>
                        <dd className="min-w-0 pt-0.5">
                          <PaymentMethodLabel method={r.paymentMethod ?? ""} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Date
                        </dt>
                        <dd className="truncate pt-0.5 font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
                          {r.paymentDate}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Project
                        </dt>
                        <dd className="truncate pt-0.5 text-zinc-700 dark:text-zinc-200">
                          {proj ?? "—"}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Notes
                        </dt>
                        <dd className="line-clamp-2 break-words pt-0.5 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                          {r.notes?.trim() ? r.notes : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div
          className={cn(
            wpShell,
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
            <table className="w-full min-w-[880px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className={cn(thClass, "min-w-[200px]")}>Worker</th>
                  <th className={cn(thClass, "min-w-[120px]")}>Project</th>
                  <th
                    className={cn(thRight, sortableTh)}
                    onClick={() => toggleSort("amount")}
                    aria-sort={
                      sort.key === "amount"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <span className="flex w-full items-center justify-end gap-0.5">
                      Amount
                      <SortCaret active={sort.key === "amount"} dir={sort.dir} />
                    </span>
                  </th>
                  <th
                    className={cn(thClass, sortableTh)}
                    onClick={() => toggleSort("method")}
                    aria-sort={
                      sort.key === "method"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <span className="inline-flex items-center gap-0.5">
                      Payment method
                      <SortCaret active={sort.key === "method"} dir={sort.dir} />
                    </span>
                  </th>
                  <th
                    className={cn(thClass, "whitespace-nowrap", sortableTh)}
                    onClick={() => toggleSort("paymentDate")}
                    aria-sort={
                      sort.key === "paymentDate"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <span className="inline-flex items-center gap-0.5">
                      Payment date
                      <SortCaret active={sort.key === "paymentDate"} dir={sort.dir} />
                    </span>
                  </th>
                  <th className={cn(thClass, "min-w-[140px]")}>Notes</th>
                  <th className="w-12 px-2 py-2 text-right align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialLoading ? (
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
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-3 py-2.5">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right align-middle">
                        <Skeleton className="ml-auto h-8 w-8 rounded-sm" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                        No payments yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Payouts you record will appear here with receipt links.
                      </p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No payments match your search.
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => {
                    const wName = workerNameById.get(r.workerId) ?? r.workerId;
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          listTableRowStaticClassName,
                          "border-b border-zinc-100/55 dark:border-border/30",
                          "transition-[background-color] duration-200 ease-out motion-reduce:transition-none",
                          "hover:bg-zinc-50/40 dark:hover:bg-muted/8",
                          "focus-within:bg-zinc-50/30 dark:focus-within:bg-muted/6"
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
                              {workerInitials(wName)}
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                                {wName}
                              </p>
                              <p className="max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-400/70 dark:text-zinc-500/75">
                                {truncateId(r.workerId)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 align-middle text-sm text-zinc-600 dark:text-zinc-300">
                          {r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-base font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-foreground">
                          {fmtUsd(r.amount)}
                        </td>
                        <td className="max-w-[160px] px-3 py-2.5 align-middle text-sm">
                          <PaymentMethodLabel method={r.paymentMethod ?? ""} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                          {r.paymentDate}
                        </td>
                        <td
                          className="max-w-[220px] truncate px-3 py-2.5 align-middle text-sm text-zinc-600 dark:text-zinc-400"
                          title={r.notes ?? undefined}
                        >
                          {r.notes?.trim() ? r.notes : "—"}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2.5 text-right align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end">
                            <PaymentRowActionsMenu
                              ariaLabel={`Actions for payment ${wName}`}
                              layout="desktop"
                              onViewReceipt={() => setReceiptPreviewId(r.id)}
                              onDelete={() => handleDelete(r.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col gap-3 border-t border-zinc-200/70 pt-3 text-sm text-muted-foreground dark:border-border/60 md:border-t-0 md:pt-0",
            "sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <span className="tabular-nums">
            {filtered.length === 0
              ? "0"
              : String(Math.min(filtered.length, (page - 1) * pageSize + 1))}
            –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
          </span>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-11 min-h-[44px] flex-1 rounded-sm shadow-none sm:h-8 sm:min-h-0 sm:flex-none"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11 min-h-[44px] flex-1 rounded-sm shadow-none sm:h-8 sm:min-h-0 sm:flex-none"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
