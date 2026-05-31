"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  StatusBadge,
  ConfirmDialog,
  DeleteRowAction,
  KpiTile,
  NeoAmount,
  NeoFieldLabel,
  NeoInput,
  NeoPanel,
  NeoSelect,
  NeoTable,
  FilterToolbar,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApBillWithProject } from "@/lib/data";
import { AP_BILL_TYPES, AP_BILL_STATUSES } from "@/lib/data";
import { MoreHorizontal, Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import {
  billsFilterFieldClass,
  billsGhostButtonClass,
  billsPrimaryButtonClass,
} from "./bills-ui-styles";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const dt = new Date(due.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return null;
  const diff = dt.getTime() - startOfToday().getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

type Props = {
  bills: ApBillWithProject[];
  summary: {
    totalOutstanding: number;
    overdueCount: number;
    overdueAmount: number;
    dueThisWeekCount: number;
    dueThisWeekAmount: number;
    paidThisMonthAmount: number;
  };
  projects: { id: string; name: string }[];
};

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : fallback;
}

export function BillsListClient({ bills, summary, projects }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localBills, setLocalBills] = React.useState<ApBillWithProject[]>(bills);
  React.useEffect(() => setLocalBills(bills), [bills]);
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const billType = searchParams.get("bill_type") ?? "";
  const projectId = searchParams.get("project_id") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const [searchInput, setSearchInput] = React.useState(search);
  React.useEffect(() => setSearchInput(search), [search]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const setFilters = React.useCallback(
    (updates: Record<string, string | boolean>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (v !== "" && v !== false) next.set(k, String(v));
        else next.delete(k);
      });
      router.push(`/bills?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleVoid = React.useCallback(async (id: string) => {
    setActionError(null);
    const response = await fetch(`/api/bills/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void" }),
    });
    if (response.ok) {
      setVoidConfirmId(null);
      setLocalBills((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "Void" as const } : b))
      );
    } else {
      setActionError(await readApiMessage(response, "Failed to void bill."));
    }
  }, []);

  const handleDeleteDraft = React.useCallback(async (id: string) => {
    let snapshot: ApBillWithProject[] | undefined;
    setLocalBills((prev) => {
      snapshot = prev;
      return prev.filter((b) => b.id !== id);
    });
    setActionError(null);
    const response = await fetch(`/api/bills/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      if (snapshot) setLocalBills(snapshot);
      setActionError(await readApiMessage(response, "Failed to delete bill."));
    }
  }, []);

  const activeDrawerFilterCount =
    (status ? 1 : 0) +
    (billType ? 1 : 0) +
    (projectId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const statusPill = React.useCallback(
    (
      bill: ApBillWithProject
    ): { label: string; variant: Parameters<typeof StatusBadge>[0]["variant"] } => {
      if (bill.status === "Paid") return { label: "Paid", variant: "success" };
      if (bill.status === "Void") return { label: "Void", variant: "muted" };
      const d = daysUntil(bill.due_date);
      if (d != null && d < 0) return { label: "Overdue", variant: "danger" };
      if (d != null && d <= 7) return { label: "Due Soon", variant: "warning" };
      return { label: "Pending", variant: "warning" };
    },
    []
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 overflow-x-hidden text-[var(--neo-text-primary)] md:gap-5",
        mobileListPagePaddingClass,
        "max-md:!gap-3"
      )}
    >
      <MobileListHeader
        title="Bills"
        fab={<MobileFabPlus href="/bills/new" ariaLabel="New bill" />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <NeoInput
              type="text"
              placeholder="Vendor, reference…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => setFilters({ search: searchInput })}
              onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
              className={cn("h-10 pl-8 text-sm", billsFilterFieldClass)}
              aria-label="Search bills"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <NeoFieldLabel>Status</NeoFieldLabel>
          <NeoSelect
            value={status}
            onChange={(e) => setFilters({ status: e.target.value })}
            className={cn("w-full", billsFilterFieldClass)}
          >
            <option value="">All</option>
            {AP_BILL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NeoSelect>
        </div>
        <div className="space-y-2">
          <NeoFieldLabel>Type</NeoFieldLabel>
          <NeoSelect
            value={billType}
            onChange={(e) => setFilters({ bill_type: e.target.value })}
            className={cn("w-full", billsFilterFieldClass)}
          >
            <option value="">All</option>
            {AP_BILL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NeoSelect>
        </div>
        <div className="space-y-2">
          <NeoFieldLabel>Project</NeoFieldLabel>
          <NeoSelect
            value={projectId}
            onChange={(e) => setFilters({ project_id: e.target.value })}
            className={cn("w-full", billsFilterFieldClass)}
          >
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NeoSelect>
        </div>
        <div className="space-y-2">
          <NeoFieldLabel>Date from</NeoFieldLabel>
          <NeoInput
            type="date"
            value={dateFrom}
            onChange={(e) => setFilters({ date_from: e.target.value })}
            className={cn("w-full tabular-nums [color-scheme:dark]", billsFilterFieldClass)}
          />
        </div>
        <div className="space-y-2">
          <NeoFieldLabel>Date to</NeoFieldLabel>
          <NeoInput
            type="date"
            value={dateTo}
            onChange={(e) => setFilters({ date_to: e.target.value })}
            className={cn("w-full tabular-nums [color-scheme:dark]", billsFilterFieldClass)}
          />
        </div>
        <Button
          type="button"
          className={cn("w-full rounded-[0.625rem]", billsPrimaryButtonClass)}
          onClick={() => setFiltersOpen(false)}
        >
          Done
        </Button>
      </MobileFilterSheet>

      {actionError ? (
        <p
          className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[12px] font-medium text-rose-200"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <section className="hidden min-w-0 grid-cols-2 gap-3 md:grid lg:grid-cols-4">
        <KpiTile label="Outstanding" value={formatCurrency(summary.totalOutstanding)} />
        <KpiTile label="Overdue" value={formatCurrency(summary.overdueAmount)} />
        <KpiTile label="Due this week" value={formatCurrency(summary.dueThisWeekAmount)} />
        <KpiTile
          label="Paid this month"
          value={formatCurrency(summary.paidThisMonthAmount)}
          tone="positive"
        />
      </section>

      <NeoPanel className="hidden md:block" bodyClassName="p-3">
        <FilterToolbar className="border-0 bg-transparent p-0 shadow-none">
          <div className="flex w-full min-w-0 flex-col gap-4">
            <div className="min-w-0 space-y-1.5">
              <NeoFieldLabel>Search</NeoFieldLabel>
              <NeoInput
                type="text"
                placeholder="Vendor, reference…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={() => setFilters({ search: searchInput })}
                onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
                className={billsFilterFieldClass}
              />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 space-y-1.5">
                <NeoFieldLabel>Status</NeoFieldLabel>
                <NeoSelect
                  value={status}
                  onChange={(e) => setFilters({ status: e.target.value })}
                  className={billsFilterFieldClass}
                >
                  <option value="">All</option>
                  {AP_BILL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NeoSelect>
              </div>
              <div className="min-w-0 space-y-1.5">
                <NeoFieldLabel>Type</NeoFieldLabel>
                <NeoSelect
                  value={billType}
                  onChange={(e) => setFilters({ bill_type: e.target.value })}
                  className={billsFilterFieldClass}
                >
                  <option value="">All</option>
                  {AP_BILL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NeoSelect>
              </div>
              <div className="min-w-0 space-y-1.5">
                <NeoFieldLabel>Project</NeoFieldLabel>
                <NeoSelect
                  value={projectId}
                  onChange={(e) => setFilters({ project_id: e.target.value })}
                  className={billsFilterFieldClass}
                >
                  <option value="">All</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NeoSelect>
              </div>
              <div className="min-w-0 space-y-1.5">
                <NeoFieldLabel>Date range</NeoFieldLabel>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <NeoInput
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setFilters({ date_from: e.target.value })}
                    className={cn(
                      "w-full min-w-0 tabular-nums [color-scheme:dark] sm:flex-1",
                      billsFilterFieldClass
                    )}
                  />
                  <span className="hidden shrink-0 text-sm text-[var(--neo-text-tertiary)] sm:inline">
                    –
                  </span>
                  <NeoInput
                    type="date"
                    value={dateTo}
                    onChange={(e) => setFilters({ date_to: e.target.value })}
                    className={cn(
                      "w-full min-w-0 tabular-nums [color-scheme:dark] sm:flex-1",
                      billsFilterFieldClass
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </FilterToolbar>
      </NeoPanel>

      {/* Table or empty state */}
      {localBills.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<MoreHorizontal className="h-8 w-8 opacity-80" aria-hidden />}
            message="No bills yet. Create one to track payables."
            action={
              <Button asChild size="sm" className={billsPrimaryButtonClass}>
                <Link href="/bills/new">New bill</Link>
              </Button>
            }
          />
          <NeoPanel
            className="hidden md:flex"
            bodyClassName="flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center"
          >
            <p className="text-[15px] font-medium text-[var(--neo-text-primary)]">No bills yet</p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--neo-text-secondary)]">
              Track vendor, labor, and other payables in one place.
            </p>
            <Button asChild size="touch" className={cn("mt-5", billsPrimaryButtonClass)}>
              <Link href="/bills/new">Create first bill</Link>
            </Button>
          </NeoPanel>
        </>
      ) : (
        <>
          <div className="min-w-0 divide-y divide-[var(--neo-border)] md:hidden">
            {localBills.map((bill) => {
              const s = statusPill(bill);
              return (
                <div
                  key={bill.id}
                  className="group relative flex min-h-[52px] min-w-0 items-center py-2.5"
                >
                  <Link
                    href={`/bills/${bill.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 pr-10 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
                        {bill.vendor_name}
                      </p>
                      <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                        {[
                          bill.bill_no,
                          bill.project_name ?? "No project",
                          bill.subcontractor_name ? `Subcontract ${bill.subcontractor_name}` : null,
                          `Due ${formatDate(bill.due_date)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <NeoAmount className="text-sm">{formatCurrency(bill.amount)}</NeoAmount>
                      <span className="text-[11px] text-[var(--neo-text-tertiary)]">
                        Bal {formatCurrency(bill.balance_amount)}
                      </span>
                      <StatusBadge label={s.label} variant={s.variant} />
                    </div>
                  </Link>
                  {bill.status === "Draft" && bill.paid_amount <= 0 ? (
                    <div
                      className="absolute right-0 top-1/2 -translate-y-1/2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <DeleteRowAction onDelete={() => handleDeleteDraft(bill.id)} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <NeoPanel className="hidden min-w-0 md:block" bodyClassName="p-0">
            <NeoTable
              className="rounded-none border-0 shadow-none"
              tableClassName="min-w-[720px] lg:min-w-0"
            >
              <thead>
                <tr>
                  <th className={tableRawThClass}>Vendor</th>
                  <th className={tableRawThClass}>Project</th>
                  <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
                  <th className={cn(tableRawThClass, "text-right tabular-nums")}>Balance</th>
                  <th className={tableRawThClass}>Due date</th>
                  <th className={tableRawThClass}>Status</th>
                  <th className={cn(tableRawThClass, "w-10 px-1")} aria-hidden />
                </tr>
              </thead>
              <tbody>
                {localBills.map((bill) => (
                  <tr
                    key={bill.id}
                    className={listTableRowClassName}
                    onClick={() => startTransition(() => router.push(`/bills/${bill.id}`))}
                  >
                    <td className={cn(tableRawTdClass, "max-w-[220px]")}>
                      <span
                        className={cn(
                          "block truncate font-medium text-[var(--neo-text-primary)] hover:underline",
                          listTablePrimaryCellClassName
                        )}
                      >
                        {bill.vendor_name}
                      </span>
                      {bill.bill_no ? (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--neo-text-tertiary)]">
                          {bill.bill_no}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        tableRawTdClass,
                        "max-w-[240px] text-[var(--neo-text-secondary)]"
                      )}
                    >
                      <span className="block truncate">{bill.project_name ?? "—"}</span>
                      {bill.project_id && bill.subcontract_id ? (
                        <Link
                          href={`/projects/${bill.project_id}/subcontracts/${bill.subcontract_id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5 block truncate text-[11px] text-[var(--neo-gold)] underline-offset-2 hover:underline"
                        >
                          {bill.subcontractor_name
                            ? `Subcontract: ${bill.subcontractor_name}`
                            : "Linked subcontract"}
                        </Link>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        tableRawTdClass,
                        "text-right whitespace-nowrap",
                        TYPO.amount,
                        listTableAmountCellClassName
                      )}
                    >
                      <NeoAmount>{formatCurrency(bill.amount)}</NeoAmount>
                    </td>
                    <td
                      className={cn(
                        tableRawTdClass,
                        "text-right whitespace-nowrap",
                        TYPO.amount,
                        listTableAmountCellClassName
                      )}
                    >
                      <NeoAmount>{formatCurrency(bill.balance_amount)}</NeoAmount>
                    </td>
                    <td className={cn(tableRawTdClass, TYPO.date)}>{formatDate(bill.due_date)}</td>
                    <td className={tableRawTdClass}>
                      {(() => {
                        const s = statusPill(bill);
                        return <StatusBadge label={s.label} variant={s.variant} />;
                      })()}
                    </td>
                    <td
                      className={cn(tableRawTdClass, "px-1")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {bill.status === "Draft" && bill.paid_amount <= 0 ? (
                          <DeleteRowAction onDelete={() => handleDeleteDraft(bill.id)} />
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn("h-8 w-8 p-0", billsGhostButtonClass)}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[140px]">
                            <DropdownMenuItem asChild>
                              <Link href={`/bills/${bill.id}`}>Open</Link>
                            </DropdownMenuItem>
                            {bill.status !== "Paid" && bill.status !== "Void" && (
                              <DropdownMenuItem asChild>
                                <Link href={`/bills/${bill.id}?addPayment=1`}>Add payment</Link>
                              </DropdownMenuItem>
                            )}
                            {bill.status !== "Void" && (
                              <DropdownMenuItem asChild>
                                <Link href={`/bills/${bill.id}/edit`}>Edit</Link>
                              </DropdownMenuItem>
                            )}
                            {bill.status !== "Void" && (
                              <DropdownMenuItem
                                className="text-[var(--neo-text-secondary)]"
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setVoidConfirmId(bill.id);
                                }}
                              >
                                Void
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
          </NeoPanel>
        </>
      )}

      <ConfirmDialog
        open={voidConfirmId !== null}
        onOpenChange={(open) => !open && setVoidConfirmId(null)}
        title="Void bill?"
        description="This cannot be undone."
        confirmLabel="Void"
        destructive
        onConfirm={() => {
          if (voidConfirmId) void handleVoid(voidConfirmId);
        }}
      />
    </div>
  );
}
