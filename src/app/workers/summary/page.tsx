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
import { Search, Users } from "lucide-react";
import {
  getWorkers,
  getLaborEntriesWithJoins,
  getDailyWorkEntriesInRange,
  getWorkerInvoices,
  getWorkerPayments,
  totalPayForEntry,
  type WorkerInvoice,
} from "@/lib/data";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { deleteWorkerAction } from "../actions";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { useToast } from "@/components/toast/toast-provider";

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

type SortKey = keyof Omit<Row, "workerId">;

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 inline-block w-3" aria-hidden />;
  return (
    <span
      className="ml-0.5 inline-block w-3 text-[10px] font-normal text-muted-foreground"
      aria-hidden
    >
      {dir === "asc" ? "↑" : "↓"}
    </span>
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
      const [workers, laborEntries, invoicesAll, payments] = await Promise.all([
        getWorkers(),
        getLaborEntriesWithJoins({ date_from: fromDate, date_to: toDate }).catch(() => []),
        getWorkerInvoices().catch(() => [] as WorkerInvoice[]),
        getWorkerPayments({ fromDate, toDate, limit: 5000 }).catch(() => []),
      ]);

      const laborByWorker = new Map<string, number>();
      const workDaysByWorker = new Map<string, number>();
      for (const e of laborEntries) {
        const wid = e.worker_id;
        if (!wid) continue;
        const amt = Number(e.cost_amount ?? 0) || 0;
        laborByWorker.set(wid, (laborByWorker.get(wid) ?? 0) + amt);
        workDaysByWorker.set(wid, (workDaysByWorker.get(wid) ?? 0) + 1);
      }

      if (laborEntries.length === 0) {
        const daily = await getDailyWorkEntriesInRange(fromDate, toDate).catch(() => []);
        for (const e of daily) {
          laborByWorker.set(e.workerId, (laborByWorker.get(e.workerId) ?? 0) + totalPayForEntry(e));
          if (e.dayType !== "absent") {
            workDaysByWorker.set(e.workerId, (workDaysByWorker.get(e.workerId) ?? 0) + 1);
          }
        }
      }

      const invoiceByWorker = new Map<string, number>();
      for (const inv of invoicesAll as WorkerInvoice[]) {
        const d = inv.createdAt?.slice(0, 10) ?? "";
        if (d && (d < fromDate || d > toDate)) continue;
        invoiceByWorker.set(
          inv.workerId,
          (invoiceByWorker.get(inv.workerId) ?? 0) + (Number(inv.amount) || 0)
        );
      }

      const paidByWorker = new Map<string, number>();
      for (const p of payments) {
        paidByWorker.set(p.workerId, (paidByWorker.get(p.workerId) ?? 0) + (Number(p.amount) || 0));
      }

      const nameById = new Map(workers.map((w) => [w.id, w.name] as const));

      const out: Row[] = workers.map((w) => {
        const labor = laborByWorker.get(w.id) ?? 0;
        const inv = invoiceByWorker.get(w.id) ?? 0;
        const earned = labor + inv;
        const paid = paidByWorker.get(w.id) ?? 0;
        const outstanding = earned - paid;
        const workDays = workDaysByWorker.get(w.id) ?? 0;
        return {
          workerId: w.id,
          workerName: nameById.get(w.id) ?? w.name ?? w.id,
          workDays,
          earned,
          paid,
          outstanding,
        };
      });

      setRows(out);
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
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Worker Summary"
          subtitle="Labor entry count (work days), earned vs paid, and outstanding in the selected range. Click a row to open the worker dashboard."
          actions={
            <Link href="/workers" className="text-sm text-muted-foreground hover:text-foreground">
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
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search worker…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-8 text-sm"
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
          <p className="text-xs font-medium text-muted-foreground">From</p>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">To</p>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sort by</p>
          <select
            value={sort.key}
            onChange={(e) =>
              setSort((s) => ({
                key: e.target.value as SortKey,
                dir: e.target.value === "workerName" ? "asc" : "desc",
              }))
            }
            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="workerName">Worker</option>
            <option value="workDays">Work days</option>
            <option value="earned">Earned</option>
            <option value="paid">Paid</option>
            <option value="outstanding">Outstanding</option>
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Direction</p>
          <select
            value={sort.dir}
            onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full rounded-sm"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
        <Button
          type="button"
          className="w-full rounded-sm"
          onClick={() => setMobileFiltersOpen(false)}
        >
          Done
        </Button>
      </MobileFilterSheet>

      <div className="hidden md:flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          From
        </label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 w-[152px]"
        />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          To
        </label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 w-[152px]"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search worker…"
          className="h-9 min-w-[180px]"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 ml-auto"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="border-b border-border/60 py-3 md:hidden">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="font-medium uppercase tracking-wider text-muted-foreground">Work days</p>
            <p className="mt-0.5 tabular-nums text-base font-semibold">{totals.workDays}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wider text-muted-foreground">Earned</p>
            <p className="mt-0.5 tabular-nums text-base font-semibold">{fmtUsd(totals.earned)}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wider text-muted-foreground">Paid</p>
            <p className="mt-0.5 tabular-nums text-base font-semibold">{fmtUsd(totals.paid)}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wider text-muted-foreground">
              Outstanding
            </p>
            <p
              className={cn(
                "mt-0.5 tabular-nums text-base font-semibold",
                totals.outstanding > 0.005 ? "text-destructive" : ""
              )}
            >
              {fmtUsd(totals.outstanding)}
            </p>
          </div>
        </div>
      </div>

      <div className="md:hidden divide-y divide-gray-100 dark:divide-border/60">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : paged.length === 0 ? (
          <MobileEmptyState
            icon={<Users className="h-5 w-5" />}
            message="No workers in this range."
          />
        ) : (
          paged.map((r) => (
            <div
              key={r.workerId}
              role="button"
              tabIndex={0}
              className="flex min-h-[48px] cursor-pointer flex-col justify-center gap-1 py-2 text-left"
              onClick={() => router.push(`/workers/${r.workerId}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/workers/${r.workerId}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground">{r.workerName}</p>
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
              <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
                <span>{r.workDays} days</span>
                <span>Earned {fmtUsd(r.earned)}</span>
                <span>Paid {fmtUsd(r.paid)}</span>
                <span className={r.outstanding > 0.005 ? "font-medium text-destructive" : ""}>
                  Out {fmtUsd(r.outstanding)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground md:hidden">
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
            className="h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="hidden md:block">
        <div className="grid gap-4 border-b border-border/60 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Work days (entries)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-right">{totals.workDays}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Earned
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-right">
              {fmtUsd(totals.earned)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Paid
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-right">
              {fmtUsd(totals.paid)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total Outstanding
            </p>
            <p
              className={
                totals.outstanding > 0.005
                  ? "mt-1 text-lg font-semibold tabular-nums text-right text-destructive"
                  : "mt-1 text-lg font-semibold tabular-nums text-right"
              }
            >
              {fmtUsd(totals.outstanding)}
            </p>
          </div>
        </div>

        <div className="table-responsive border-b border-border/60">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5 border-spacing-x-0 text-sm table-row-compact md:min-w-0">
            <thead>
              <tr className="border-b border-border/60">
                <th
                  className="cursor-pointer select-none py-2.5 px-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
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
                  className="cursor-pointer select-none py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums w-[88px]"
                  onClick={() => toggleSort("workDays")}
                  aria-sort={
                    sort.key === "workDays"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  Work days
                  <SortGlyph active={sort.key === "workDays"} dir={sort.dir} />
                </th>
                <th
                  className="cursor-pointer select-none py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
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
                  className="cursor-pointer select-none py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
                  onClick={() => toggleSort("paid")}
                  aria-sort={
                    sort.key === "paid" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  Paid
                  <SortGlyph active={sort.key === "paid"} dir={sort.dir} />
                </th>
                <th
                  className="cursor-pointer select-none py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums"
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
                <th className="py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground w-12">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-b border-border/40">
                  <td colSpan={6} className="py-6 px-3 text-center text-xs text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr className="border-b border-border/40">
                  <td colSpan={6} className="py-6 px-3 text-center text-xs text-muted-foreground">
                    No workers.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr
                    key={r.workerId}
                    className={listTableRowClassName}
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
                        "first:rounded-l-xl py-1.5 px-3 font-medium",
                        listTablePrimaryCellClassName
                      )}
                    >
                      {r.workerName}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {r.workDays}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 px-3 text-right tabular-nums",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.earned)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 px-3 text-right tabular-nums text-muted-foreground",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd(r.paid)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 px-3 text-right tabular-nums font-medium",
                        listTableAmountCellClassName,
                        r.outstanding > 0.005 ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {fmtUsd(r.outstanding)}
                    </td>
                    <td
                      className="last:rounded-r-xl py-1.5 px-3 text-right"
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

        <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
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
              className="h-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
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
