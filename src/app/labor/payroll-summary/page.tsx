"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import {
  getPayrollSummary,
  getDailyWorkEntriesForWorker,
  totalPayForEntry,
  type PayrollSummaryRow,
  type DailyWorkEntry,
} from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultRange(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const from = `${y}-${m}-01`;
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export default function PayrollSummaryPage() {
  const defaults = React.useMemo(getDefaultRange, []);
  const [fromDate, setFromDate] = React.useState(defaults.from);
  const [toDate, setToDate] = React.useState(defaults.to);
  const [rows, setRows] = React.useState<PayrollSummaryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detailWorkerId, setDetailWorkerId] = React.useState<string | null>(null);
  const [detailEntries, setDetailEntries] = React.useState<
    (DailyWorkEntry & { projectName?: string })[]
  >([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const load = React.useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getPayrollSummary(fromDate, toDate);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll summary.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openWorkerDetail = async (workerId: string) => {
    setDetailWorkerId(workerId);
    try {
      const entries = await getDailyWorkEntriesForWorker(workerId, fromDate, toDate);
      setDetailEntries(entries);
    } catch {
      setDetailEntries([]);
    }
  };

  const displayRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.workerName.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const totalDays = rows.reduce((s, r) => s + r.daysWorked, 0);
  const totalOt = rows.reduce((s, r) => s + r.otTotal, 0);
  const totalPay = rows.reduce((s, r) => s + r.totalPay, 0);

  const mobileTotalDays = displayRows.reduce((s, r) => s + r.daysWorked, 0);
  const mobileTotalOt = displayRows.reduce((s, r) => s + r.otTotal, 0);
  const mobileTotalPay = displayRows.reduce((s, r) => s + r.totalPay, 0);

  const activeDrawerFilterCount =
    (fromDate !== defaults.from || toDate !== defaults.to ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Payroll Summary"
          subtitle="Summarize labor entries by worker for a date range."
          actions={
            <Link
              href="/labor"
              className="text-sm text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:inline-flex max-md:items-center"
            >
              Labor
            </Link>
          }
        />
      </div>
      <MobileListHeader
        title="Payroll Summary"
        fab={<MobileFabPlus href="/labor" ariaLabel="Labor home" />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workers…"
              className="h-10 pl-8 text-sm"
              aria-label="Search workers"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
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
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      <div className="hidden grid-cols-1 gap-3 border-b border-border/60 pb-3 sm:grid-cols-2 sm:items-end md:grid lg:flex lg:flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            From
          </label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 max-md:min-h-11 w-full rounded-md sm:w-[152px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            To
          </label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 max-md:min-h-11 w-full rounded-md sm:w-[152px]"
          />
        </div>
      </div>
      {error ? <p className="py-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="border-b border-border/60 pb-3 md:hidden">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No labor entries for this range."
          />
        ) : displayRows.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No workers match your search."
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-border/60">
              {displayRows.map((r) => (
                <div key={r.workerId} className="flex min-h-[48px] flex-col gap-2 py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="btn-outline-ghost h-8 w-fit -ml-2 rounded-sm font-medium text-foreground"
                    onClick={() => openWorkerDetail(r.workerId)}
                  >
                    {r.workerName}
                  </Button>
                  <dl className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                    <div>
                      <dt className="text-muted-foreground">Days</dt>
                      <dd className="font-medium">{r.daysWorked}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">OT</dt>
                      <dd>${fmtUsd(r.otTotal)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pay</dt>
                      <dd className="font-medium">${fmtUsd(r.totalPay)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border/60 pt-3 text-xs font-medium tabular-nums">
              <div className="flex justify-between border-b border-border/60 pb-2">
                <span>Total days</span>
                <span>{mobileTotalDays}</span>
              </div>
              <div className="flex justify-between py-2">
                <span>Total OT</span>
                <span>${fmtUsd(mobileTotalOt)}</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2">
                <span>Total pay</span>
                <span>${fmtUsd(mobileTotalPay)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="hidden overflow-x-auto border-b border-border/60 md:block">
        <table className="w-full min-w-[480px] border-collapse text-sm lg:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Days Worked
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                OT Total
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Total Pay
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  No labor entries for this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.workerId} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-8 font-medium -ml-2 text-foreground"
                      onClick={() => openWorkerDetail(r.workerId)}
                    >
                      {r.workerName}
                    </Button>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">{r.daysWorked}</td>
                  <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(r.otTotal)}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">
                    ${fmtUsd(r.totalPay)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-medium">
              <td className="py-2 px-4">Total</td>
              <td className="py-2 px-4 text-right tabular-nums">{totalDays}</td>
              <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(totalOt)}</td>
              <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(totalPay)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {detailWorkerId && (
        <div className="border-t border-border/60 pt-4">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {rows.find((r) => r.workerId === detailWorkerId)?.workerName ?? "Worker"} — Detail
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost h-8 max-md:min-h-11 w-full sm:w-auto"
              onClick={() => setDetailWorkerId(null)}
            >
              Close
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Project
                  </th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Day Type
                  </th>
                  <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                    OT
                  </th>
                  <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                    Pay
                  </th>
                </tr>
              </thead>
              <tbody>
                {detailEntries.length === 0 ? (
                  <tr className="border-b border-border/40">
                    <td colSpan={5} className="py-4 px-4 text-center text-muted-foreground text-xs">
                      No entries.
                    </td>
                  </tr>
                ) : (
                  detailEntries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40">
                      <td className="py-2 px-4 tabular-nums">{e.workDate}</td>
                      <td className="py-2 px-4 text-muted-foreground">
                        {e.projectName ?? e.projectId ?? "—"}
                      </td>
                      <td className="py-2 px-4 capitalize">{e.dayType.replace("_", " ")}</td>
                      <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(e.otAmount)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-medium">
                        ${fmtUsd(totalPayForEntry(e))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
