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
  const overdueOnly = searchParams.get("overdue_only") === "1" || searchParams.get("overdue_only") === "true";

  const [searchInput, setSearchInput] = React.useState(search);
  React.useEffect(() => setSearchInput(search), [search]);

  const setFilters = React.useCallback(
    (updates: Record<string, string | boolean>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([k, v]) => {
        if (k === "overdue_only") {
          if (v) next.set("overdue_only", "1");
          else next.delete("overdue_only");
        } else if (v !== "" && v !== false) next.set(k, String(v));
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

  const statusVariant = (s: string): "success" | "warning" | "muted" => {
    if (s === "Paid") return "success";
    if (s === "Partially Paid" || s === "Pending") return "warning";
    return "muted";
  };

  return (
    <div className="flex flex-col gap-6 text-foreground [font-family:var(--font-inter),var(--font-geist-sans),sans-serif]">
      {/* Summary row */}
      <div className={`border-b border-[#E5E7EB] pb-6 text-sm text-muted-foreground`}>
        <span className="tabular-nums font-semibold text-foreground">
          Outstanding {fmtUsd(summary.totalOutstanding)}
        </span>
        <span className="mx-3 text-muted-foreground">·</span>
        <span>Overdue {summary.overdueCount}</span>
        <span className="mx-3">·</span>
        <span className="tabular-nums">Due this week {fmtUsd(summary.dueThisWeekAmount)}</span>
        <span className="mx-3">·</span>
        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
          Paid this month {fmtUsd(summary.paidThisMonthAmount)}
        </span>
      </div>

      {/* Search */}
      <div>
        <Input
          type="text"
          placeholder="Search bills..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={() => setFilters({ search: searchInput })}
          onKeyDown={(e) => e.key === "Enter" && setFilters({ search: searchInput })}
          className={`h-9 w-56 rounded-sm border border-[#E5E7EB] bg-white text-sm`}
        />
      </div>

      {/* Filters */}
      <div className={`flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] pb-6`}>
        <select
          value={status}
          onChange={(e) => setFilters({ status: e.target.value })}
          className={`h-9 min-w-[100px] rounded-sm border border-[#E5E7EB] bg-white px-2 text-sm`}
        >
          <option value="">Status</option>
          {AP_BILL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={billType}
          onChange={(e) => setFilters({ bill_type: e.target.value })}
          className={`h-9 min-w-[90px] rounded-sm border border-[#E5E7EB] bg-white px-2 text-sm`}
        >
          <option value="">Type</option>
          {AP_BILL_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setFilters({ project_id: e.target.value })}
          className={`h-9 min-w-[110px] rounded-sm border border-[#E5E7EB] bg-white px-2 text-sm`}
        >
          <option value="">Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setFilters({ date_from: e.target.value })}
            className="h-9 w-[130px] rounded-sm border border-[#E5E7EB] bg-white text-sm"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setFilters({ date_to: e.target.value })}
            className="h-9 w-[130px] rounded-sm border border-[#E5E7EB] bg-white text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setFilters({ overdue_only: e.target.checked })}
            className={`rounded border border-[#E5E7EB]`}
          />
          Overdue
        </label>
      </div>

      {/* Table or empty state */}
      {bills.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">No bills</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first bill to track payables.
          </p>
          <Button asChild size="sm" className="mt-4 h-9 rounded-sm">
            <Link href="/bills/new">New Bill</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="table-head-label py-3 px-3 text-left">Vendor</th>
                <th className="table-head-label py-3 px-3 text-left">Bill #</th>
                <th className="table-head-label py-3 px-3 text-left">Project</th>
                <th className="table-head-label py-3 px-3 text-left">Due Date</th>
                <th className="table-head-label py-3 px-3 text-right tabular-nums">Amount</th>
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
                      className="font-medium text-foreground hover:underline"
                    >
                      {bill.vendor_name}
                    </Link>
                  </td>
                  <td className="py-0 px-3 align-middle text-muted-foreground">
                    {bill.bill_no ?? "—"}
                  </td>
                  <td className="py-0 px-3 align-middle text-muted-foreground">
                    {bill.project_name ?? "—"}
                  </td>
                  <td className="py-0 px-3 align-middle text-muted-foreground tabular-nums">
                    {formatDate(bill.due_date)}
                  </td>
                  <td className="py-0 px-3 text-right align-middle tabular-nums">
                    {fmtUsd(bill.amount)}
                  </td>
                  <td className="py-0 px-3 align-middle">
                    <StatusBadge label={bill.status} variant={statusVariant(bill.status)} />
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
