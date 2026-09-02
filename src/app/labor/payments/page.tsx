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
import { NeoAmount, NeoMobileCard, NeoTable, NeoToolbar } from "@/components/base";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import type { WorkerPayment } from "@/lib/worker-payments-db";
import { dispatchClientDataSync } from "@/lib/sync-router-client";
import { formatCurrency, formatDate } from "@/lib/formatters";

const wpKpiTile =
  "rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational md:rounded-hh-task";

const wpKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)] md:h-8 md:w-8";

const wpKpiTileLayout =
  "flex min-h-[52px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5";

const mobilePaymentListViewportClass = "min-h-[260px]";

const AVATAR_RING = [
  "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]",
  "bg-[var(--hh-l3-hover)] text-[var(--hh-text-primary)]",
  "bg-[var(--hh-l1-workspace)] text-[var(--hh-text-primary)]",
  "bg-[var(--hh-l3-pressed)] text-[var(--hh-text-primary)]",
];

const workerAvatarRing = "ring-1 ring-inset ring-[var(--hh-border)] shadow-operational";

const METHOD_DOT_CLASS =
  "h-[4px] w-[4px] shrink-0 rounded-full bg-[var(--hh-text-tertiary)] ring-1 ring-[var(--hh-border)]";

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

function thisMonthPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function thisMonthLabel(): string {
  return formatDate(new Date(), "month");
}

function PaymentMethodLabel({ method }: { method: string }) {
  const label = method.trim() || "—";
  if (label === "—") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={METHOD_DOT_CLASS} aria-hidden />
      <span className="min-w-0 truncate text-sm font-normal leading-snug text-[var(--hh-text-secondary)]">
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
    <ArrowDown
      className="ml-0.5 inline h-3 w-3 shrink-0 text-[var(--hh-text-tertiary)]"
      aria-hidden
    />
  ) : (
    <ArrowUp
      className="ml-0.5 inline h-3 w-3 shrink-0 text-[var(--hh-text-tertiary)]"
      aria-hidden
    />
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
            "shrink-0 rounded-hh-compact text-muted-foreground/45 outline-none transition-colors",
            "hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]",
            layout === "mobile"
              ? "h-11 w-11 min-h-[44px] min-w-[44px]"
              : "h-11 w-11 min-h-[44px] min-w-[44px] lg:h-8 lg:w-8 lg:min-h-8 lg:min-w-8"
          )}
          aria-label={ariaLabel}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[10rem] rounded-hh-compact border border-border/60 bg-popover p-1 shadow-floating"
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
            "cursor-pointer text-sm text-[var(--hh-danger)] focus:bg-[var(--hh-danger-soft-fill)] focus:text-[var(--hh-danger)]"
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
  const [workers, setWorkers] = React.useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
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
      const response = await fetch("/api/labor/worker-payments?limit=500", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        payments?: WorkerPayment[];
        workers?: Array<{ id: string; name: string }>;
        projects?: Array<{ id: string; name: string }>;
      };
      if (!response.ok) throw new Error(body.message ?? "Failed to load worker payments.");
      setWorkers(body.workers ?? []);
      setProjects(body.projects ?? []);
      setRows(body.payments ?? []);
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
      const response = await fetch(`/api/labor/worker-payments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Delete failed.");
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
        className="h-11 min-h-[44px] pl-8 text-sm lg:h-10 lg:min-h-10"
        aria-label="Search payments and workers"
      />
    </div>
  );

  const thClass =
    "px-3 py-2 text-left text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]";
  const thRight =
    "px-3 py-2 text-right text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)] tabular-nums";
  const sortableTh =
    "group/th cursor-pointer select-none transition-colors hover:text-[var(--hh-text-primary)]";

  return (
    <div
      className={cn(
        " min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]",
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
          " page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-[var(--hh-border)] pb-3 lg:items-baseline lg:gap-x-4 [&_h1]:!text-hh-financial-total [&_h1]:!font-semibold [&_h1]:!leading-none [&_h1]:!tracking-normal [&_h1]:!text-[var(--hh-text-primary)] [&_p]:!mt-1 [&_p]:!max-w-xl [&_p]:!text-hh-body [&_p]:!leading-snug [&_p]:!text-[var(--hh-text-secondary)]"
            title="Worker Payments"
            subtitle="Payment history for worker payouts."
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-11 min-h-[44px] shrink-0 gap-1.5 shadow-none lg:h-9 lg:min-h-9"
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
            <div className={cn(wpKpiTile, wpKpiTileLayout)}>
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Total paid
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-[var(--hh-text-primary)] md:text-xl">
                  {formatCurrency(summary.totalPaid)}
                </p>
                <p className="mt-0.5 text-hh-status leading-none text-muted-foreground">All time</p>
              </div>
            </div>
            <div className={cn(wpKpiTile, wpKpiTileLayout)}>
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Payments count
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-[var(--hh-text-primary)] md:text-xl">
                  {summary.count}
                </p>
                <p className="mt-0.5 text-hh-status leading-none text-muted-foreground">
                  All records
                </p>
              </div>
            </div>
            <div className={cn(wpKpiTile, wpKpiTileLayout)}>
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  This month
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-[var(--hh-text-primary)] md:text-xl">
                  {formatCurrency(summary.thisMonthTotal)}
                </p>
                <p className="mt-0.5 truncate text-hh-status leading-none text-muted-foreground">
                  {thisMonthLabel()}
                </p>
              </div>
            </div>
            <div className={cn(wpKpiTile, wpKpiTileLayout)}>
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Workers paid
                </p>
                <p className="mt-0.5 text-base font-semibold tabular-nums leading-none text-[var(--hh-text-primary)] md:text-xl">
                  {summary.workersPaid}
                </p>
                <p className="mt-0.5 text-hh-status leading-none text-muted-foreground">Unique</p>
              </div>
            </div>
            <div className={cn(wpKpiTile, wpKpiTileLayout, "col-span-2 sm:col-span-1")}>
              <span className={cn(wpKpiIcon, "mt-0.5 md:mt-0")}>
                <Divide className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-hh-status font-medium uppercase leading-none tracking-normal text-muted-foreground md:text-hh-status md:normal-case md:tracking-normal">
                  Avg payment
                </p>
                <p className="mt-0.5 truncate text-base font-semibold tabular-nums leading-none text-[var(--hh-text-primary)] md:text-xl">
                  {formatCurrency(summary.avgPayment)}
                </p>
                <p className="mt-0.5 text-hh-status leading-none text-muted-foreground">
                  Per payment
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(wpKpiTile, wpKpiTileLayout, i === 4 && "col-span-2 sm:col-span-1")}
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

        <NeoToolbar className="hidden min-w-0 md:flex md:flex-row md:items-center md:gap-3 md:pb-0 md:pt-0">
          <div className="min-w-0 flex-1">{searchInput}</div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 min-h-[44px] shrink-0 gap-1.5 rounded-hh-compact shadow-none lg:h-10 lg:min-h-10"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11 min-h-[44px] shrink-0 gap-1.5 shadow-none lg:h-10 lg:min-h-10"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </NeoToolbar>

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
            className="h-11 min-h-[44px] w-full rounded-hh-compact"
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
            className="h-11 min-h-[44px] w-full rounded-hh-compact"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {message ? (
          <p className="border-b border-[var(--hh-border)] pb-2 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {/* Mobile stacked cards */}
        <div className={cn("md:hidden", mobilePaymentListViewportClass)}>
          {initialLoading ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 2 }).map((_, i) => (
                <NeoMobileCard key={i} className="min-h-[122px] space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-11 w-11 shrink-0 rounded-hh-compact" />
                  </div>
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-16 w-full" />
                </NeoMobileCard>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <NeoMobileCard className="min-h-[122px] px-4 py-10 text-center">
              <p className="text-sm font-medium text-[var(--hh-text-primary)]">No payments yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Payouts you record will appear here with receipt links.
              </p>
            </NeoMobileCard>
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
                  <NeoMobileCard key={r.id} className="min-h-[122px] space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-hh-metadata font-semibold leading-none tabular-nums antialiased",
                            workerAvatarRing,
                            avatarRingClass(r.workerId)
                          )}
                          aria-hidden
                        >
                          {workerInitials(wName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-hh-table-cell font-semibold leading-snug tracking-normal text-[var(--hh-text-primary)]">
                            {wName}
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
                    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--hh-border)] pb-2">
                      <span className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                        Amount
                      </span>
                      <NeoAmount
                        tone="income"
                        className="max-w-full min-w-0 text-right text-xl tracking-normal"
                      >
                        {formatCurrency(r.amount)}
                      </NeoAmount>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                          Method
                        </dt>
                        <dd className="min-w-0 pt-0.5">
                          <PaymentMethodLabel method={r.paymentMethod ?? ""} />
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                          Date
                        </dt>
                        <dd className="truncate pt-0.5 hh-fin text-[var(--hh-text-secondary)]">
                          {formatDate(r.paymentDate)}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                          Project
                        </dt>
                        <dd className="truncate pt-0.5 text-[var(--hh-text-secondary)]">
                          {proj ?? "—"}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                          Notes
                        </dt>
                        <dd className="line-clamp-2 break-words pt-0.5 text-sm leading-snug text-[var(--hh-text-secondary)]">
                          {r.notes?.trim() ? r.notes : "—"}
                        </dd>
                      </div>
                    </dl>
                  </NeoMobileCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <NeoTable
          className={cn(
            "hidden md:block",
            refreshing && rows.length > 0 && "pointer-events-none opacity-60"
          )}
          tableClassName="min-w-[880px] lg:min-w-0"
          busy={refreshing && rows.length > 0}
        >
          <thead>
            <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)]">
              <th className={cn(thClass, "min-w-[200px]")}>Worker</th>
              <th className={cn(thClass, "min-w-[120px]")}>Project</th>
              <th
                className={cn(thRight, sortableTh)}
                onClick={() => toggleSort("amount")}
                aria-sort={
                  sort.key === "amount" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
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
                  sort.key === "method" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
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
              <th className="w-12 px-2 py-2 text-right align-middle text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {initialLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--hh-border)]">
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
                    <Skeleton className="ml-auto h-8 w-8 rounded-hh-compact" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr className="border-b border-[var(--hh-border)]">
                <td colSpan={7} className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                    No payments yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Payouts you record will appear here with receipt links.
                  </p>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr className="border-b border-[var(--hh-border)]">
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-muted-foreground">
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
                      "border-b border-[var(--hh-border)]",
                      "transition-[background-color] duration-200 ease-out motion-reduce:transition-none",
                      "hover:bg-[var(--hh-l3-hover)]",
                      "focus-within:bg-[var(--hh-l3-selected)]"
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
                          {workerInitials(wName)}
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-hh-table-cell font-semibold leading-snug tracking-normal text-[var(--hh-text-primary)]">
                            {wName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 align-middle text-sm text-[var(--hh-text-secondary)]">
                      {r.projectId ? (projectNameById.get(r.projectId) ?? r.projectId) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle">
                      <NeoAmount tone="income" className="text-base tracking-normal">
                        {formatCurrency(r.amount)}
                      </NeoAmount>
                    </td>
                    <td className="max-w-[160px] px-3 py-2.5 align-middle text-sm">
                      <PaymentMethodLabel method={r.paymentMethod ?? ""} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle hh-fin text-sm tabular-nums text-[var(--hh-text-secondary)]">
                      {formatDate(r.paymentDate)}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-3 py-2.5 align-middle text-sm text-[var(--hh-text-secondary)]"
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
        </NeoTable>

        <div
          className={cn(
            "flex flex-col gap-3 border-t border-[var(--hh-border)] pt-3 text-sm text-muted-foreground md:border-t-0 md:pt-0",
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
              className="h-11 min-h-[44px] flex-1 rounded-hh-compact shadow-none lg:h-8 lg:min-h-0 lg:flex-none"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11 min-h-[44px] flex-1 rounded-hh-compact shadow-none lg:h-8 lg:min-h-0 lg:flex-none"
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
