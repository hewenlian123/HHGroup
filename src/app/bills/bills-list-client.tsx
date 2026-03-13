"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StatusBadge, ConfirmDialog } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const billType = searchParams.get("bill_type") ?? "";
  const projectId = searchParams.get("project_id") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";

  const [searchInput, setSearchInput] = React.useState(search);
  React.useEffect(() => setSearchInput(search), [search]);

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
    const result = await voidBillAction(id);
    if (result.ok) {
      setVoidConfirmId(null);
      router.refresh();
    }
  }, [router]);

  const handleDeleteDraft = React.useCallback(async (id: string) => {
    const result = await deleteBillDraftAction(id);
    if (result.ok) {
      setDeleteConfirmId(null);
      router.refresh();
    }
  }, [router]);

  const statusPill = React.useCallback((bill: ApBillWithProject): { label: string; variant: Parameters<typeof StatusBadge>[0]["variant"] } => {
    if (bill.status === "Paid") return { label: "Paid", variant: "success" };
    if (bill.status === "Void") return { label: "Void", variant: "muted" };
    const d = daysUntil(bill.due_date);
    if (d != null && d < 0) return { label: "Overdue", variant: "danger" };
    if (d != null && d <= 7) return { label: "Due Soon", variant: "warning" };
    return { label: "Pending", variant: "muted" };
  }, []);

  return (
    <div className="flex flex-col gap-6 text-foreground [font-family:var(--font-inter),var(--font-geist-sans),sans-serif]">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2 border-b border-border/60 pb-4 md:grid-cols-4">
        <div className="rounded-sm border border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtUsd(summary.totalOutstanding)}</p>
        </div>
        <div className="rounded-sm border border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Overdue</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtUsd(summary.overdueAmount)}</p>
        </div>
        <div className="rounded-sm border border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Due This Week</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtUsd(summary.dueThisWeekAmount)}</p>
        </div>
        <div className="rounded-sm border border-border/60 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Paid This Month</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtUsd(summary.paidThisMonthAmount)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="space-y-3">
        <Input
          type="text"
          placeholder="Search bills..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={() => setFilters({ search: searchInput })}
          onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
          className="w-full rounded-sm border border-border/60 bg-background"
        />
        {/* Filters: stack vertically on mobile */}
        <div className="grid grid-cols-1 gap-3 border-b border-border/60 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setFilters({ status: e.target.value })}
              className="mt-1 min-h-[44px] w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm md:min-h-0 md:h-9"
            >
              <option value="">All</option>
              {AP_BILL_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={billType}
              onChange={(e) => setFilters({ bill_type: e.target.value })}
              className="mt-1 min-h-[44px] w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm md:min-h-0 md:h-9"
            >
              <option value="">All</option>
              {AP_BILL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={projectId}
              onChange={(e) => setFilters({ project_id: e.target.value })}
              className="mt-1 min-h-[44px] w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm md:min-h-0 md:h-9"
            >
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date range</label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setFilters({ date_from: e.target.value })}
                className="w-full rounded-sm border border-border/60 bg-background sm:flex-1"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setFilters({ date_to: e.target.value })}
                className="w-full rounded-sm border border-border/60 bg-background sm:flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table or empty state */}
      {bills.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">No bills yet</p>
          <Button asChild size="touch" className="mt-4 rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90">
            <Link href="/bills/new">Create First Bill</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: card layout */}
          <div className="flex flex-col gap-3 md:hidden">
            {bills.map((bill) => {
              const s = statusPill(bill);
              return (
                <Link
                  key={bill.id}
                  href={`/bills/${bill.id}`}
                  className="block rounded-sm border border-border/60 bg-background p-4 transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{bill.vendor_name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground truncate">{bill.project_name ?? "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="tabular-nums font-medium">{fmtUsd(bill.amount)}</span>
                        <span className="text-muted-foreground">Due {formatDate(bill.due_date)}</span>
                      </div>
                    </div>
                    <StatusBadge label={s.label} variant={s.variant} />
                  </div>
                </Link>
              );
            })}
          </div>
          {/* Desktop/tablet: table */}
          <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="table-head-label py-3 px-3 text-left">Vendor</th>
                <th className="table-head-label py-3 px-3 text-left">Project</th>
                <th className="table-head-label py-3 px-3 text-right tabular-nums">Amount</th>
                <th className="table-head-label py-3 px-3 text-left">Due Date</th>
                <th className="table-head-label py-3 px-3 text-left">Status</th>
                <th className="w-10 px-1" />
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr
                  key={bill.id}
                  className="h-12 border-b border-[#E5E7EB] last:border-b-0"
                >
                  <td className="py-0 px-3 align-middle">
                    <Link
                      href={`/bills/${bill.id}`}
                      className="block max-w-[220px] truncate font-medium text-foreground hover:underline"
                    >
                      {bill.vendor_name}
                    </Link>
                  </td>
                  <td className="py-0 px-3 align-middle text-muted-foreground">
                    <span className="block max-w-[240px] truncate">{bill.project_name ?? "—"}</span>
                  </td>
                  <td className="py-0 px-3 text-right align-middle tabular-nums whitespace-nowrap">
                    {fmtUsd(bill.amount)}
                  </td>
                  <td className="py-0 px-3 align-middle text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(bill.due_date)}
                  </td>
                  <td className="py-0 px-3 align-middle">
                    {(() => {
                      const s = statusPill(bill);
                      return <StatusBadge label={s.label} variant={s.variant} />;
                    })()}
                  </td>
                  <td className="py-0 px-1 align-middle">
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
                        {bill.status === "Draft" && bill.paid_amount <= 0 && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onSelect={(e) => {
                              e.preventDefault();
                              setDeleteConfirmId(bill.id);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        onConfirm={() => { if (voidConfirmId) void handleVoid(voidConfirmId); }}
      />
      <ConfirmDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Delete draft?"
        description="This bill has no payments and will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteConfirmId) void handleDeleteDraft(deleteConfirmId); }}
      />
    </div>
  );
}
