"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type WorkerBalanceRow = {
  workerId: string;
  workerName: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
  deletable?: boolean;
};

export default function WorkerBalancesPage() {
  const [rows, setRows] = React.useState<WorkerBalanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkerBalanceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/worker-balances?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load.");
      setRows(data.balances ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/labor/worker-balances/${encodeURIComponent(deleteTarget.workerId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Delete failed.");
      if (typeof data.warning === "string" && data.warning.trim()) {
        setMessage(data.warning.trim());
      } else {
        setMessage(null);
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, load]);

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.workerName.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Worker Balances"
          subtitle="Labor owed, reimbursements, payments, and balance per worker."
          actions={
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] sm:min-h-9 w-full sm:w-auto"
              onClick={load}
              disabled={loading}
            >
              <SubmitSpinner loading={loading} className="mr-2" />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          }
        />
      </div>
      <MobileListHeader
        title="Worker Balances"
        fab={<span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={0}
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
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-sm"
          onClick={() => {
            void load();
            setFiltersOpen(false);
          }}
          disabled={loading}
        >
          <SubmitSpinner loading={loading} className="mr-2" />
          Refresh balances
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      {message ? (
        <p className="text-sm text-muted-foreground border-b border-border/60 pb-3">{message}</p>
      ) : null}

      <div className="border-b border-border/60 pb-4 md:hidden">
        {loading ? (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="py-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No workers yet."
          />
        ) : filteredRows.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No workers match your search."
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border/60">
            {filteredRows.map((r) => (
              <div key={r.workerId} className="flex min-h-[48px] flex-col gap-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/labor/workers/${r.workerId}/balance`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {r.workerName}
                  </Link>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {fmtUsd(r.balance)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide">Labor owed</dt>
                    <dd className="tabular-nums text-foreground">{fmtUsd(r.laborOwed)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide">Payments</dt>
                    <dd className="tabular-nums text-foreground">{fmtUsd(r.payments)}</dd>
                  </div>
                </dl>
                {r.deletable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="btn-outline-ghost h-8 w-full rounded-sm text-destructive"
                    aria-label={`Delete ${r.workerName}`}
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete worker
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="table-responsive hidden border-b border-border/60 md:block">
        <table className="w-full border-collapse text-sm min-w-[520px] lg:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Labor Owed
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Reimbursements
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Payments
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Advances
              </th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Balance
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="py-2 px-4">
                    <Skeleton className="h-4 w-36" />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </td>
                  <td className="py-2 px-4 text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Skeleton className="ml-auto h-8 w-8" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={7} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  No workers yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.workerId} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4 font-medium text-foreground">
                    <Link href={`/labor/workers/${r.workerId}/balance`} className="hover:underline">
                      {r.workerName}
                    </Link>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.laborOwed)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.reimbursements)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.payments)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                    {fmtUsd(r.advances)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">
                    {fmtUsd(r.balance)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {r.deletable ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="btn-outline-ghost h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${r.workerName}`}
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete worker?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Remove <span className="font-medium text-foreground">{deleteTarget?.workerName}</span>{" "}
              from workers. Only allowed when balance is $0.00 with no labor entries or payments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 border-t border-border/60 gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={confirmDelete} disabled={deleteBusy}>
              <SubmitSpinner loading={deleteBusy} className="mr-2" />
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
