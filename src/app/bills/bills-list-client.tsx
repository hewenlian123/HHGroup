"use client";

import {
  refreshRscNonBlocking,
  syncRouterNonBlocking,
} from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  StatusBadge,
  ConfirmDialog,
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
import {
  Ban,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react";
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

type BillsSummary = Props["summary"];

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : fallback;
}

async function readApiBody(response: Response): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function isBillsSummary(value: unknown): value is BillsSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<keyof BillsSummary, unknown>;
  return (
    typeof candidate.totalOutstanding === "number" &&
    typeof candidate.overdueCount === "number" &&
    typeof candidate.overdueAmount === "number" &&
    typeof candidate.dueThisWeekCount === "number" &&
    typeof candidate.dueThisWeekAmount === "number" &&
    typeof candidate.paidThisMonthAmount === "number"
  );
}

function messageFromBody(body: Record<string, unknown> | null, fallback: string): string {
  return typeof body?.message === "string" ? body.message : fallback;
}

function localMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function localOutstandingBalance(bill: ApBillWithProject): number {
  if (bill.status === "Void" || bill.status === "Paid") return 0;
  const derived = Math.max(0, localMoney(bill.amount - bill.paid_amount));
  if (bill.balance_amount <= 0 && derived > 0) return derived;
  return Math.max(0, localMoney(bill.balance_amount));
}

function currentSummaryWindow() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  return {
    today,
    weekStart: startOfWeek.toISOString().slice(0, 10),
    weekEnd: endOfWeek.toISOString().slice(0, 10),
  };
}

function subtractBillFromSummary(summary: BillsSummary, bill: ApBillWithProject): BillsSummary {
  const balance = localOutstandingBalance(bill);
  if (balance <= 0) return summary;

  const { today, weekStart, weekEnd } = currentSummaryWindow();
  const due = bill.due_date ?? "";
  const isOverdue = due !== "" && due < today;
  const isDueThisWeek = due !== "" && due >= weekStart && due <= weekEnd;

  return {
    ...summary,
    totalOutstanding: Math.max(0, localMoney(summary.totalOutstanding - balance)),
    overdueCount: isOverdue ? Math.max(0, summary.overdueCount - 1) : summary.overdueCount,
    overdueAmount: isOverdue
      ? Math.max(0, localMoney(summary.overdueAmount - balance))
      : summary.overdueAmount,
    dueThisWeekCount: isDueThisWeek
      ? Math.max(0, summary.dueThisWeekCount - 1)
      : summary.dueThisWeekCount,
    dueThisWeekAmount: isDueThisWeek
      ? Math.max(0, localMoney(summary.dueThisWeekAmount - balance))
      : summary.dueThisWeekAmount,
  };
}

export function BillsListClient({ bills, summary, projects }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localBills, setLocalBills] = React.useState<ApBillWithProject[]>(bills);
  React.useEffect(() => setLocalBills(bills), [bills]);
  const [localSummary, setLocalSummary] = React.useState(summary);
  React.useEffect(() => setLocalSummary(summary), [summary]);
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const billType = searchParams.get("bill_type") ?? "";
  const projectId = searchParams.get("project_id") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const showVoidBills =
    searchParams.get("show_void_bills") === "1" || searchParams.get("show_void_bills") === "true";

  const [searchInput, setSearchInput] = React.useState(search);
  const [showVoidInput, setShowVoidInput] = React.useState(showVoidBills);
  React.useEffect(() => setSearchInput(search), [search]);
  React.useEffect(() => setShowVoidInput(showVoidBills), [showVoidBills]);

  useOnAppSync(
    React.useCallback(() => {
      refreshRscNonBlocking(router);
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

  const handleVoid = React.useCallback(
    async (id: string) => {
      setActionError(null);
      const targetBill = localBills.find((bill) => bill.id === id);
      const response = await fetch(`/api/bills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void" }),
      });
      if (response.ok) {
        setVoidConfirmId(null);
        if (targetBill) {
          setLocalSummary((prev) => subtractBillFromSummary(prev, targetBill));
        }
        setLocalBills((prev) =>
          showVoidBills
            ? prev.map((b) => (b.id === id ? { ...b, status: "Void" as const } : b))
            : prev.filter((b) => b.id !== id)
        );
        syncRouterNonBlocking(router);
      } else {
        setActionError(await readApiMessage(response, "Failed to void bill."));
      }
    },
    [localBills, router, showVoidBills]
  );

  const handleApprove = React.useCallback(
    async (id: string) => {
      setActionError(null);
      const response = await fetch(`/api/bills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (response.ok) {
        setLocalBills((prev) =>
          prev.map((bill) => (bill.id === id ? { ...bill, status: "Pending" as const } : bill))
        );
        syncRouterNonBlocking(router);
      } else {
        setActionError(await readApiMessage(response, "Failed to approve bill."));
      }
    },
    [router]
  );

  const handleDeleteDraft = React.useCallback(
    async (id: string) => {
      const deletedBill = localBills.find((bill) => bill.id === id);
      const billsSnapshot = localBills;
      const summarySnapshot = localSummary;
      setLocalBills((prev) => prev.filter((b) => b.id !== id));
      if (deletedBill) setLocalSummary((prev) => subtractBillFromSummary(prev, deletedBill));
      setActionError(null);
      const response = await fetch(`/api/bills/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await readApiBody(response);
      if (response.ok) {
        setDeleteConfirmId(null);
        if (isBillsSummary(body?.summary)) setLocalSummary(body.summary);
        refreshRscNonBlocking(router);
        return;
      }
      setLocalBills(billsSnapshot);
      setLocalSummary(summarySnapshot);
      setActionError(messageFromBody(body, "Failed to delete bill."));
    },
    [localBills, localSummary, router]
  );

  const activeDrawerFilterCount =
    (status ? 1 : 0) +
    (billType ? 1 : 0) +
    (projectId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (showVoidBills ? 1 : 0);

  const statusPill = React.useCallback(
    (
      bill: ApBillWithProject
    ): { label: string; variant: Parameters<typeof StatusBadge>[0]["variant"] } => {
      if (bill.status === "Paid") return { label: "Paid", variant: "success" };
      if (bill.status === "Void") return { label: "Void", variant: "muted" };
      if (bill.status === "Draft") return { label: "Draft", variant: "muted" };
      if (bill.status === "Partially Paid") return { label: "Partially Paid", variant: "warning" };
      return { label: "Pending", variant: "warning" };
    },
    []
  );

  const renderBillActions = React.useCallback(
    (bill: ApBillWithProject) => {
      const canApprove = bill.status === "Draft";
      const canDelete = bill.status === "Draft" && bill.paid_amount <= 0;
      const canPay = bill.status === "Pending" || bill.status === "Partially Paid";
      const canVoid =
        bill.status === "Pending" || bill.status === "Partially Paid" || bill.status === "Paid";

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("!h-11 !w-11 p-0 md:!h-8 md:!w-8", billsGhostButtonClass)}
              aria-label={`Actions for bill ${bill.vendor_name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem asChild>
              <Link href={`/bills/${bill.id}`}>
                <ExternalLink className="h-4 w-4" />
                Open
              </Link>
            </DropdownMenuItem>
            {canApprove ? (
              <DropdownMenuItem
                onSelect={() => {
                  void handleApprove(bill.id);
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </DropdownMenuItem>
            ) : null}
            {canPay ? (
              <DropdownMenuItem asChild>
                <Link href={`/bills/${bill.id}?addPayment=1`}>
                  <CreditCard className="h-4 w-4" />
                  Pay
                </Link>
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                className="text-[var(--hh-danger)] focus:text-[var(--hh-danger)]"
                onSelect={(e) => {
                  e.preventDefault();
                  setDeleteConfirmId(bill.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            ) : null}
            {canVoid ? (
              <DropdownMenuItem
                className="text-[var(--hh-text-secondary)]"
                onSelect={(e) => {
                  e.preventDefault();
                  setVoidConfirmId(bill.id);
                }}
              >
                <Ban className="h-4 w-4" />
                Void
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [handleApprove]
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 overflow-x-hidden text-[var(--hh-text-primary)] md:gap-5",
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
            aria-label="Bill status"
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
        <label className="flex min-h-11 items-center gap-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-body text-[var(--hh-text-primary)]">
          <input
            aria-label="Show void bills"
            type="checkbox"
            checked={showVoidInput}
            onChange={(e) => {
              setShowVoidInput(e.target.checked);
              setFilters({ show_void_bills: e.target.checked });
            }}
            className="h-4 w-4 rounded-hh-compact border-[var(--hh-border)] accent-[var(--hh-action-primary)]"
          />
          Show void bills
        </label>
        <div className="space-y-2">
          <NeoFieldLabel>Type</NeoFieldLabel>
          <NeoSelect
            aria-label="Bill type"
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
            aria-label="Bill project"
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
            aria-label="Bills date from"
            type="date"
            value={dateFrom}
            onChange={(e) => setFilters({ date_from: e.target.value })}
            className={cn("w-full tabular-nums", billsFilterFieldClass)}
          />
        </div>
        <div className="space-y-2">
          <NeoFieldLabel>Date to</NeoFieldLabel>
          <NeoInput
            aria-label="Bills date to"
            type="date"
            value={dateTo}
            onChange={(e) => setFilters({ date_to: e.target.value })}
            className={cn("w-full tabular-nums", billsFilterFieldClass)}
          />
        </div>
        <Button
          type="button"
          className={cn("w-full rounded-hh-standard", billsPrimaryButtonClass)}
          onClick={() => setFiltersOpen(false)}
        >
          Done
        </Button>
      </MobileFilterSheet>

      {actionError ? (
        <p
          className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-hh-error text-[var(--hh-danger)]"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <section className="hidden min-w-0 grid-cols-2 gap-3 md:grid lg:grid-cols-4">
        <KpiTile label="Outstanding" value={formatCurrency(localSummary.totalOutstanding)} />
        <KpiTile label="Overdue" value={formatCurrency(localSummary.overdueAmount)} />
        <KpiTile label="Due this week" value={formatCurrency(localSummary.dueThisWeekAmount)} />
        <KpiTile
          label="Paid this month"
          value={formatCurrency(localSummary.paidThisMonthAmount)}
          tone="positive"
        />
      </section>

      <NeoPanel className="hidden md:block" bodyClassName="p-3">
        <FilterToolbar className="border-0 bg-transparent p-0 shadow-none">
          <div className="flex w-full min-w-0 flex-col gap-4">
            <div className="min-w-0 space-y-1.5">
              <NeoFieldLabel>Search</NeoFieldLabel>
              <NeoInput
                aria-label="Search bills"
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
                  aria-label="Bill status"
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
                  aria-label="Bill type"
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
                  aria-label="Bill project"
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
                    aria-label="Bills date from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setFilters({ date_from: e.target.value })}
                    className={cn("w-full min-w-0 tabular-nums sm:flex-1", billsFilterFieldClass)}
                  />
                  <span className="hidden shrink-0 text-sm text-[var(--hh-text-tertiary)] sm:inline">
                    –
                  </span>
                  <NeoInput
                    aria-label="Bills date to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setFilters({ date_to: e.target.value })}
                    className={cn("w-full min-w-0 tabular-nums sm:flex-1", billsFilterFieldClass)}
                  />
                </div>
              </div>
            </div>
            <label className="flex min-h-10 w-fit items-center gap-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-table-cell font-medium text-[var(--hh-text-secondary)]">
              <input
                aria-label="Show void bills"
                type="checkbox"
                checked={showVoidInput}
                onChange={(e) => {
                  setShowVoidInput(e.target.checked);
                  setFilters({ show_void_bills: e.target.checked });
                }}
                className="h-4 w-4 rounded-hh-compact border-[var(--hh-border)] accent-[var(--hh-action-primary)]"
              />
              Show void bills
            </label>
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
            <p className="text-hh-panel-title text-[var(--hh-text-primary)]">No bills yet</p>
            <p className="mt-1 max-w-sm text-hh-table-cell text-[var(--hh-text-secondary)]">
              Track vendor, labor, and other payables in one place.
            </p>
            <Button asChild size="touch" className={cn("mt-5", billsPrimaryButtonClass)}>
              <Link href="/bills/new">Create first bill</Link>
            </Button>
          </NeoPanel>
        </>
      ) : (
        <>
          <div className="min-w-0 divide-y divide-[var(--hh-border)] md:hidden">
            {localBills.map((bill) => {
              const s = statusPill(bill);
              return (
                <div
                  key={bill.id}
                  className="group relative flex min-h-[52px] min-w-0 items-center py-2.5"
                >
                  <Link
                    href={`/bills/${bill.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 pr-12 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--hh-text-primary)]">
                        {bill.vendor_name}
                      </p>
                      <p className="truncate text-xs text-[var(--hh-text-secondary)]">
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
                      <span className="text-hh-status text-[var(--hh-text-tertiary)]">
                        Bal {formatCurrency(bill.balance_amount)}
                      </span>
                      <StatusBadge label={s.label} variant={s.variant} />
                    </div>
                  </Link>
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    {renderBillActions(bill)}
                  </div>
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
                          "block truncate font-medium text-[var(--hh-text-primary)] hover:underline",
                          listTablePrimaryCellClassName
                        )}
                      >
                        {bill.vendor_name}
                      </span>
                      {bill.bill_no ? (
                        <span className="hh-fin mt-0.5 block truncate text-hh-status text-[var(--hh-text-tertiary)]">
                          {bill.bill_no}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        tableRawTdClass,
                        "max-w-[240px] text-[var(--hh-text-secondary)]"
                      )}
                    >
                      <span className="block truncate">{bill.project_name ?? "—"}</span>
                      {bill.project_id && bill.subcontract_id ? (
                        <Link
                          href={`/projects/${bill.project_id}/subcontracts/${bill.subcontract_id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5 block truncate text-hh-status text-[var(--hh-information)] underline-offset-2 hover:underline"
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
                      <div className="flex items-center justify-end">{renderBillActions(bill)}</div>
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
        description="This will void this bill and keep audit history."
        confirmLabel="Void"
        destructive
        onConfirm={() => {
          if (voidConfirmId) void handleVoid(voidConfirmId);
        }}
      />
      <ConfirmDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Delete bill?"
        description="This will permanently delete this bill."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteConfirmId) void handleDeleteDraft(deleteConfirmId);
        }}
      />
    </div>
  );
}
