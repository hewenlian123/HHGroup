"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StatusBadge, ConfirmDialog, DeleteRowAction } from "@/components/base";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApBillWithProject } from "@/lib/data";
import { AP_BILL_TYPES, AP_BILL_STATUSES } from "@/lib/data";
import { deleteBillDraftAction, voidBillAction } from "./actions";
import { MoreHorizontal } from "lucide-react";

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

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

export function BillsListClient({ bills, summary, projects }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localBills, setLocalBills] = React.useState<ApBillWithProject[]>(bills);
  React.useEffect(() => setLocalBills(bills), [bills]);
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);

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
      void syncRouterAndClients(router);
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
      const result = await voidBillAction(id);
      if (result.ok) {
        setVoidConfirmId(null);
        void syncRouterAndClients(router);
      }
    },
    [router]
  );

  const handleDeleteDraft = React.useCallback(
    async (id: string) => {
      let snapshot: ApBillWithProject[] | undefined;
      setLocalBills((prev) => {
        snapshot = prev;
        return prev.filter((b) => b.id !== id);
      });
      const result = await deleteBillDraftAction(id);
      if (result.ok) {
        void syncRouterAndClients(router);
      } else {
        if (snapshot) setLocalBills(snapshot);
      }
    },
    [router]
  );

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
    <div className="flex flex-col gap-6 text-foreground [font-family:var(--font-inter),var(--font-geist-sans),sans-serif]">
      <Card className="overflow-hidden p-0">
        <div className="grid divide-y divide-[#E5E7EB] sm:grid-cols-2 sm:divide-y-0 md:grid-cols-4 md:divide-x dark:divide-border/60">
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Outstanding
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827] dark:text-foreground">
              {fmtUsd(summary.totalOutstanding)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Overdue
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827] dark:text-foreground">
              {fmtUsd(summary.overdueAmount)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Due This Week
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827] dark:text-foreground">
              {fmtUsd(summary.dueThisWeekAmount)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Paid This Month
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
              {fmtUsd(summary.paidThisMonthAmount)}
            </p>
          </div>
        </div>
      </Card>

      <FilterBar>
        <div className="flex w-full flex-col gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
              Search
            </p>
            <Input
              type="text"
              placeholder="Vendor, reference…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => setFilters({ search: searchInput })}
              onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
                Status
              </p>
              <Select
                value={status}
                onChange={(e) => setFilters({ status: e.target.value })}
                className="min-h-[44px] md:min-h-9"
              >
                <option value="">All</option>
                {AP_BILL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
                Type
              </p>
              <Select
                value={billType}
                onChange={(e) => setFilters({ bill_type: e.target.value })}
                className="min-h-[44px] md:min-h-9"
              >
                <option value="">All</option>
                {AP_BILL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
                Project
              </p>
              <Select
                value={projectId}
                onChange={(e) => setFilters({ project_id: e.target.value })}
                className="min-h-[44px] md:min-h-9"
              >
                <option value="">All</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
                Date range
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setFilters({ date_from: e.target.value })}
                  className="w-full sm:flex-1"
                />
                <span className="text-muted-foreground text-sm shrink-0 hidden sm:inline">–</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setFilters({ date_to: e.target.value })}
                  className="w-full sm:flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      </FilterBar>

      {/* Table or empty state */}
      {localBills.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">No bills yet</p>
          <Button
            asChild
            size="touch"
            className="mt-4 rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
          >
            <Link href="/bills/new">Create First Bill</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="flex flex-col gap-3 md:hidden">
            {localBills.map((bill) => {
              const s = statusPill(bill);
              return (
                <div key={bill.id} className="group relative">
                  <Link
                    href={`/bills/${bill.id}`}
                    className="block rounded-sm border border-[#E5E7EB] bg-background p-4 transition-colors hover:bg-[#F9FAFB] active:bg-[#F9FAFB]/80 dark:border-border/60 dark:hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 pr-8">
                        <p className="font-medium text-foreground truncate">{bill.vendor_name}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground truncate">
                          {bill.project_name ?? "—"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="tabular-nums font-medium">{fmtUsd(bill.amount)}</span>
                          <span className="text-muted-foreground">
                            Due {formatDate(bill.due_date)}
                          </span>
                        </div>
                      </div>
                      <StatusBadge label={s.label} variant={s.variant} />
                    </div>
                  </Link>
                  {bill.status === "Draft" && bill.paid_amount <= 0 ? (
                    <div
                      className="absolute right-2 top-2"
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
          {/* Desktop/tablet: table */}
          <div className="hidden md:block airtable-table-wrap airtable-table-wrap--ruled">
            <div className="airtable-table-scroll">
              <table className="min-w-[640px] w-full text-[13px] md:min-w-0">
                <thead>
                  <tr>
                    <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Vendor
                    </th>
                    <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Project
                    </th>
                    <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Amount
                    </th>
                    <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Due Date
                    </th>
                    <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Status
                    </th>
                    <th className="h-8 w-10 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {localBills.map((bill) => (
                    <tr
                      key={bill.id}
                      className={cn(
                        listTableRowClassName,
                        "transition-colors hover:bg-[#F5F7FA] dark:hover:bg-muted/30"
                      )}
                      onClick={() => router.push(`/bills/${bill.id}`)}
                    >
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                        <span
                          className={cn(
                            "block max-w-[220px] truncate font-medium text-foreground hover:underline",
                            listTablePrimaryCellClassName
                          )}
                        >
                          {bill.vendor_name}
                        </span>
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                        <span className="block max-w-[240px] truncate">
                          {bill.project_name ?? "—"}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums whitespace-nowrap",
                          listTableAmountCellClassName
                        )}
                      >
                        {fmtUsd(bill.amount)}
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums whitespace-nowrap text-muted-foreground">
                        {formatDate(bill.due_date)}
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                        {(() => {
                          const s = statusPill(bill);
                          return <StatusBadge label={s.label} variant={s.variant} />;
                        })()}
                      </td>
                      <td
                        className="h-11 min-h-[44px] px-1 py-0 align-middle text-[13px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          {bill.status === "Draft" && bill.paid_amount <= 0 ? (
                            <DeleteRowAction onDelete={() => handleDeleteDraft(bill.id)} />
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
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
                                  className="text-muted-foreground"
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
              </table>
            </div>
          </div>
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
