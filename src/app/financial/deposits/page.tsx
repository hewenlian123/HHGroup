"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { getDeposits, type DepositWithMeta } from "@/lib/data";
import { EmptyState } from "@/components/empty-state";
import { Banknote, CalendarDays, Link2, Search, Wallet } from "lucide-react";
import {
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";

const depositsShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const kpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/45 text-zinc-400 dark:bg-muted/45 dark:text-muted-foreground";

export default function DepositsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <DepositsPageInner />
    </React.Suspense>
  );
}

function DepositsPageInner() {
  const [deposits, setDeposits] = React.useState<DepositWithMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [accountFilter, setAccountFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const load = React.useCallback(async () => {
    const list = await getDeposits();
    setDeposits(list);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const projectOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of deposits) {
      const n = (d.project_name ?? "").trim();
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deposits]);

  const accountOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of deposits) {
      const n = (d.account ?? "").trim();
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deposits]);

  const filteredDeposits = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const from = dateFrom ? dateFrom.slice(0, 10) : "";
    const to = dateTo ? dateTo.slice(0, 10) : "";
    return deposits.filter((row) => {
      if (projectFilter && (row.project_name ?? "").trim() !== projectFilter) return false;
      if (accountFilter && (row.account ?? "").trim() !== accountFilter) return false;
      const d = (row.date ?? "").slice(0, 10);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (!q) return true;
      const hay = [
        row.date,
        row.description,
        row.project_name,
        row.invoice_no,
        row.payment_method,
        row.account,
        row.payment_id,
        String(row.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [deposits, searchQuery, projectFilter, accountFilter, dateFrom, dateTo]);

  const activeDrawerFilterCount =
    (projectFilter ? 1 : 0) + (accountFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const summary = React.useMemo(() => {
    const totalDeposited = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const depositCount = deposits.length;
    const ym = new Date().toISOString().slice(0, 7);
    const thisMonthTotal = deposits
      .filter((d) => String(d.date ?? "").startsWith(ym))
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const linkedPayments = deposits.filter((d) => Boolean(d.payment_id)).length;
    return { totalDeposited, depositCount, thisMonthTotal, linkedPayments };
  }, [deposits]);

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:max-w-6xl md:gap-4 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Deposits"
            subtitle="Cash In and deposit records created automatically when customer payments are received."
          />
        </div>

        <MobileListHeader
          title="Deposits"
          fab={<span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
        />

        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customer, project, payment, account…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 min-h-[44px] pl-8 text-sm"
                aria-label="Search deposits"
              />
            </div>
          }
        />

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Project</p>
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All projects</option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Account</p>
            <Select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All accounts</option>
              {accountOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Date range</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 tabular-nums"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 tabular-nums"
              />
            </div>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {/* KPI summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total deposited
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.totalDeposited)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Banknote className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Deposit count
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.depositCount)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  This month
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.thisMonthTotal)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Link2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Linked payments
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.linkedPayments)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter/search surface */}
        <div className={cn(depositsShell, "p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Search
              </label>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Customer, project, payment, account…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 min-h-[44px] pl-8 text-sm"
                  aria-label="Search deposits"
                />
              </div>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Project
              </label>
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
              >
                <option value="">All projects</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Account
              </label>
              <Select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
              >
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-zinc-100/80 pt-3 dark:border-border/60">
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Date from
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Date to
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 min-h-[44px] rounded-sm shadow-none sm:h-9 sm:min-h-0"
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={cn(depositsShell, "px-4 py-10 text-center")}>
            <p className="text-sm text-muted-foreground">Loading deposits…</p>
          </div>
        ) : deposits.length === 0 ? (
          <div className={cn(depositsShell, "px-4 py-10 text-center")}>
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No deposits yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Deposits will appear here automatically when customer payments are received.
            </p>
          </div>
        ) : filteredDeposits.length === 0 ? (
          <EmptyState
            title="No deposits match your filters"
            description="Try adjusting the search or date range."
            icon={null}
            action={
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-sm shadow-none"
                onClick={() => {
                  setSearchQuery("");
                  setProjectFilter("");
                  setAccountFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <section className={cn(depositsShell, "overflow-hidden p-0")}>
            <div className="hidden md:grid grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(120px,0.75fr)_minmax(160px,0.9fr)_minmax(120px,0.7fr)_minmax(110px,0.6fr)_44px] gap-3 border-b border-border/60 px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              <div>Date</div>
              <div>Customer</div>
              <div>Project</div>
              <div>Payment</div>
              <div>Account</div>
              <div className="text-right">Amount</div>
              <div>Status</div>
              <div />
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {filteredDeposits.map((row) => (
                <div
                  key={row.id}
                  className="group px-3 py-3 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(120px,0.75fr)_minmax(160px,0.9fr)_minmax(120px,0.7fr)_minmax(110px,0.6fr)_44px] md:items-center md:gap-3"
                >
                  <div className="font-mono text-sm tabular-nums text-muted-foreground md:text-sm">
                    {formatDate(row.date)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {row.description ?? "—"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                      {row.project_name ?? "—"} · Payment {row.payment_id?.slice(0, 8) ?? "—"}
                    </div>
                  </div>
                  <div className="hidden min-w-0 md:block">
                    <div className="truncate text-sm text-foreground">
                      {row.project_name ?? "—"}
                    </div>
                  </div>
                  <div className="hidden md:block font-mono text-sm tabular-nums text-muted-foreground">
                    {row.payment_id ? row.payment_id.slice(0, 8) : "—"}
                  </div>
                  <div className="hidden md:block min-w-0 truncate text-sm text-muted-foreground">
                    {row.account ?? "—"}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 md:mt-0 md:block md:text-right">
                    <div className="md:hidden text-xs text-muted-foreground">
                      {(row.payment_method ?? "—") + " · " + (row.account ?? "—")}
                    </div>
                    <div
                      className={cn(TYPO.amount, "text-sm text-emerald-700 dark:text-emerald-400")}
                    >
                      {formatCurrency(row.amount)}
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-900/30">
                      Recorded
                    </span>
                  </div>
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      appearance="list"
                      ariaLabel="Deposit actions"
                      actions={[
                        {
                          label: "View payments",
                          onClick: () => (window.location.href = "/financial/payments"),
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
