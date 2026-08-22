"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import {
  AlertCircle,
  CalendarDays,
  CreditCard,
  DollarSign,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { deleteWorkerAction } from "../actions";
import { useToast } from "@/components/toast/toast-provider";

const neoControlClass =
  "hh-focus-ring h-11 min-h-[44px] rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] transition-colors hover:bg-[var(--hh-l3-selected)] md:h-10 md:min-h-10";

const neoDateControlClass = cn(neoControlClass, "[color-scheme:dark]");

const neoSelectClass =
  "hh-focus-ring h-11 min-h-[44px] w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] shadow-none transition-colors hover:bg-[var(--hh-l3-selected)] md:h-10 md:min-h-10";

const neoRefreshButtonClass =
  "hh-focus-ring h-11 min-h-[44px] w-full gap-1.5 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-table-cell font-semibold text-[var(--hh-text-primary)] shadow-none transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-selected)] hover:text-[var(--hh-text-primary)] md:h-10 md:min-h-10 lg:w-auto";

const neoPaginationButtonClass =
  "h-9 min-h-[40px] rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-table-cell font-semibold text-[var(--hh-text-primary)] shadow-none hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-selected)] disabled:bg-[var(--hh-l3-selected)] disabled:text-[var(--hh-text-tertiary)] max-md:min-h-[44px]";

const kpiTileClass =
  "rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-[var(--hh-text-primary)] shadow-operational transition-[border-color,background-color] duration-150 hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]";

const kpiIconClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] shadow-operational";

const tableHeaderCellClass =
  "px-3 py-2.5 text-left text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]";

const tableHeaderCellRightClass = cn(tableHeaderCellClass, "text-right tabular-nums");

const tableRowClass =
  "hh-focus-ring cursor-pointer border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--hh-l3-hover)]";

const tableCellClass =
  "px-3 py-2.5 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]";

const tableAmountCellClass =
  "px-3 py-2.5 text-right align-middle text-hh-table-cell font-semibold tabular-nums text-[var(--hh-text-primary)] whitespace-nowrap";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type Row = {
  workerId: string;
  workerName: string;
  workDays: number;
  earned: number;
  paid: number;
  outstanding: number;
};

type WorkerSummaryResponse = {
  ok?: boolean;
  message?: string;
  rows?: Row[];
};

type SortKey = keyof Omit<Row, "workerId">;

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 inline-block w-3" aria-hidden />;
  return (
    <span
      className="ml-0.5 inline-block w-3 text-hh-table-header font-normal text-[var(--hh-text-tertiary)]"
      aria-hidden
    >
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function SummaryKpi({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "neutral" | "gold" | "emerald" | "rose";
}) {
  const valueClass =
    tone === "rose"
      ? "text-[var(--hh-danger)]"
      : tone === "emerald"
        ? "text-[var(--hh-success)]"
        : tone === "gold"
          ? "text-[var(--hh-text-primary)]"
          : "text-[var(--hh-text-primary)]";

  return (
    <div className={cn(kpiTileClass, "flex min-h-[76px] items-center gap-3")}>
      <span
        className={cn(
          kpiIconClass,
          tone === "rose" && "text-[var(--hh-danger)]",
          tone === "emerald" && "text-[var(--hh-success)]"
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
          {label}
        </p>
        <p className={cn("mt-1 text-hh-financial-total font-semibold hh-fin", valueClass)}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function WorkerSummaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  const defaultFrom = startOfMonth.toISOString().slice(0, 10);

  const [fromDate, setFromDate] = React.useState(defaultFrom);
  const [toDate, setToDate] = React.useState(today);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: keyof Omit<Row, "workerId">; dir: "asc" | "desc" }>(
    {
      key: "outstanding",
      dir: "desc",
    }
  );
  const [page, setPage] = React.useState(1);
  const pageSize = 15;

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const response = await fetch(`/api/workers/summary?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as WorkerSummaryResponse;
      if (!response.ok) throw new Error(body.message ?? "Failed to load worker summary.");
      setRows(body.rows ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    void load();
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

  const totals = React.useMemo(() => {
    let earned = 0;
    let paid = 0;
    let outstanding = 0;
    let workDays = 0;
    for (const r of filtered) {
      earned += r.earned;
      paid += r.paid;
      outstanding += r.outstanding;
      workDays += r.workDays;
    }
    return { earned, paid, outstanding, workDays };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort, fromDate, toDate]);

  const toggleSort = (key: SortKey) => {
    setSort((s) => {
      if (s.key === key) return { key, dir: s.dir === "asc" ? "desc" : "asc" };
      const defaultDir: "asc" | "desc" = key === "workerName" ? "asc" : "desc";
      return { key, dir: defaultDir };
    });
  };

  const activeMobileFilterCount =
    (query.trim() ? 1 : 0) + (fromDate !== defaultFrom || toDate !== today ? 1 : 0);

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-3 pb-4 sm:max-w-[460px] md:max-w-none md:gap-3 md:px-6 md:pb-6 md:pt-4",
          mobileListPagePaddingClass,
          "max-md:!gap-3"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-[var(--hh-border)] pb-3 lg:items-baseline lg:gap-x-4 [&_h1]:!text-hh-page-title [&_h1]:!font-semibold [&_h1]:!text-[var(--hh-text-primary)] [&_p]:!mt-1 [&_p]:!max-w-3xl [&_p]:!text-hh-body [&_p]:!text-[var(--hh-text-secondary)]"
            title="Worker Summary"
            subtitle="Labor entry count (work days), earned vs paid, and outstanding in the selected range. Click a row to open the worker dashboard."
            actions={
              <Link
                href="/workers"
                className="inline-flex min-h-9 items-center rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-table-cell font-semibold text-[var(--hh-text-primary)] shadow-none transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-selected)] hover:text-[var(--hh-text-primary)]"
              >
                Worker Profile
              </Link>
            }
          />
        </div>

        <MobileListHeader
          title="Worker Summary"
          fab={<MobileFabPlus href="/workers" ariaLabel="Worker profiles" />}
        />
        <MobileSearchFiltersRow
          filterSheetOpen={mobileFiltersOpen}
          onOpenFilters={() => setMobileFiltersOpen(true)}
          activeFilterCount={activeMobileFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
              <Input
                type="text"
                placeholder="Search worker…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={cn(neoControlClass, "pl-8")}
                aria-label="Search workers"
              />
            </div>
          }
        />
        <MobileFilterSheet
          open={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          title="Filters"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              From
            </p>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={neoDateControlClass}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              To
            </p>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={neoDateControlClass}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              Sort by
            </p>
            <select
              value={sort.key}
              onChange={(e) =>
                setSort(() => ({
                  key: e.target.value as SortKey,
                  dir: e.target.value === "workerName" ? "asc" : "desc",
                }))
              }
              className={neoSelectClass}
            >
              <option value="workerName">Worker</option>
              <option value="workDays">Work days</option>
              <option value="earned">Earned</option>
              <option value="paid">Paid</option>
              <option value="outstanding">Outstanding</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              Direction
            </p>
            <select
              value={sort.dir}
              onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
              className={neoSelectClass}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={neoRefreshButtonClass}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <Button
            type="button"
            className="min-h-[44px] w-full rounded-hh-standard bg-[var(--hh-action-primary)] text-hh-control text-[var(--hh-action-primary-foreground)] hover:opacity-90"
            onClick={() => setMobileFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        <div className="hidden items-end gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 shadow-operational md:flex">
          <div className="space-y-1.5">
            <label className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              From
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={cn(neoDateControlClass, "w-[152px]")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              To
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={cn(neoDateControlClass, "w-[152px]")}
            />
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search worker…"
              className={cn(neoControlClass, "pl-8")}
              aria-label="Search workers"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className={neoRefreshButtonClass}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        </div>

        {message ? (
          <p className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 text-sm text-[var(--hh-text-secondary)] shadow-operational">
            {message}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryKpi
            icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />}
            label="Work Days"
            value={totals.workDays}
          />
          <SummaryKpi
            icon={<DollarSign className="h-4 w-4" strokeWidth={1.75} />}
            label="Total Earned"
            value={fmtUsd(totals.earned)}
            tone="gold"
          />
          <SummaryKpi
            icon={<CreditCard className="h-4 w-4" strokeWidth={1.75} />}
            label="Total Paid"
            value={fmtUsd(totals.paid)}
            tone={Math.abs(totals.paid) > 0.005 ? "emerald" : "neutral"}
          />
          <SummaryKpi
            icon={<AlertCircle className="h-4 w-4" strokeWidth={1.75} />}
            label="Total Outstanding"
            value={fmtUsd(totals.outstanding)}
            tone={totals.outstanding > 0.005 ? "rose" : "neutral"}
          />
        </div>

        <div className="md:hidden">
          {loading ? (
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-8 text-center text-sm text-[var(--hh-text-secondary)] shadow-operational">
              Loading…
            </div>
          ) : paged.length === 0 ? (
            <div className="rounded-hh-standard border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] px-4 py-8">
              <MobileEmptyState
                icon={<Users className="h-5 w-5" />}
                message="No workers in this range."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {paged.map((r) => (
                <div
                  key={r.workerId}
                  role="button"
                  tabIndex={0}
                  className="hh-focus-ring flex min-h-[84px] cursor-pointer flex-col justify-center gap-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-left shadow-operational transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]"
                  onClick={() => router.push(`/workers/${r.workerId}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/workers/${r.workerId}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-[var(--hh-text-primary)]">{r.workerName}</p>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--hh-text-secondary)]">
                    <span>{r.workDays} days</span>
                    <span className="text-right">Earned {fmtUsd(r.earned)}</span>
                    <span>Paid {fmtUsd(r.paid)}</span>
                    <span
                      className={cn(
                        "text-right font-medium",
                        r.outstanding > 0.005
                          ? "text-[var(--hh-danger)]"
                          : "text-[var(--hh-text-secondary)]"
                      )}
                    >
                      Out {fmtUsd(r.outstanding)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-sm text-[var(--hh-text-secondary)] shadow-operational md:hidden">
          <span className="tabular-nums">
            {filtered.length === 0
              ? "0"
              : `${Math.min(filtered.length, (page - 1) * pageSize + 1)}–${Math.min(filtered.length, page * pageSize)}`}{" "}
            of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className={neoPaginationButtonClass}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={neoPaginationButtonClass}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="hidden overflow-hidden rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-operational md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm md:min-w-0">
              <thead>
                <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l3-selected)]">
                  <th
                    className={cn(tableHeaderCellClass, "cursor-pointer select-none pl-4")}
                    onClick={() => toggleSort("workerName")}
                    aria-sort={
                      sort.key === "workerName"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Worker
                    <SortGlyph active={sort.key === "workerName"} dir={sort.dir} />
                  </th>
                  <th
                    className={cn(
                      tableHeaderCellRightClass,
                      "w-[104px] cursor-pointer select-none"
                    )}
                    onClick={() => toggleSort("workDays")}
                    aria-sort={
                      sort.key === "workDays"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Work Days
                    <SortGlyph active={sort.key === "workDays"} dir={sort.dir} />
                  </th>
                  <th
                    className={cn(tableHeaderCellRightClass, "cursor-pointer select-none")}
                    onClick={() => toggleSort("earned")}
                    aria-sort={
                      sort.key === "earned"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Earned
                    <SortGlyph active={sort.key === "earned"} dir={sort.dir} />
                  </th>
                  <th
                    className={cn(tableHeaderCellRightClass, "cursor-pointer select-none")}
                    onClick={() => toggleSort("paid")}
                    aria-sort={
                      sort.key === "paid"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Paid
                    <SortGlyph active={sort.key === "paid"} dir={sort.dir} />
                  </th>
                  <th
                    className={cn(tableHeaderCellRightClass, "cursor-pointer select-none")}
                    onClick={() => toggleSort("outstanding")}
                    aria-sort={
                      sort.key === "outstanding"
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    Outstanding
                    <SortGlyph active={sort.key === "outstanding"} dir={sort.dir} />
                  </th>
                  <th className={cn(tableHeaderCellRightClass, "w-14 pr-4")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-sm text-[var(--hh-text-secondary)]"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6">
                      <div className="rounded-hh-standard border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] px-4 py-8 text-center">
                        <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                          No workers in this range.
                        </p>
                        <p className="mt-1 text-xs text-[var(--hh-text-secondary)]">
                          Adjust the dates or search to review worker totals.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr
                      key={r.workerId}
                      className={tableRowClass}
                      onClick={() => router.push(`/workers/${r.workerId}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/workers/${r.workerId}`);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open ${r.workerName} dashboard`}
                    >
                      <td
                        className={cn(
                          tableCellClass,
                          "pl-4 font-semibold text-[var(--hh-text-primary)]"
                        )}
                      >
                        {r.workerName}
                      </td>
                      <td className={cn(tableCellClass, "text-right tabular-nums")}>
                        {r.workDays} days
                      </td>
                      <td className={tableAmountCellClass}>{fmtUsd(r.earned)}</td>
                      <td className={cn(tableAmountCellClass, "text-[var(--hh-text-secondary)]")}>
                        {fmtUsd(r.paid)}
                      </td>
                      <td
                        className={cn(
                          tableAmountCellClass,
                          r.outstanding > 0.005
                            ? "text-[var(--hh-danger)]"
                            : "text-[var(--hh-text-primary)]"
                        )}
                      >
                        {fmtUsd(r.outstanding)}
                      </td>
                      <td
                        className="px-3 py-2.5 pr-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--hh-border)] bg-[var(--hh-l3-selected)] px-4 py-3 text-sm text-[var(--hh-text-secondary)]">
            <span className="tabular-nums">
              {filtered.length === 0
                ? "0"
                : `${Math.min(filtered.length, (page - 1) * pageSize + 1)}–${Math.min(filtered.length, page * pageSize)}`}{" "}
              of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className={neoPaginationButtonClass}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={neoPaginationButtonClass}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
