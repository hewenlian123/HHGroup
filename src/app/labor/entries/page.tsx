"use client";

import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageLayout, PageHeader } from "@/components/base";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { listTableAmountCellClassName, listTableRowClassName } from "@/lib/list-table-interaction";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getProjects,
  getLaborWorkersList,
  getLaborEntriesWithJoins,
  updateDailyLaborEntry,
  deleteDailyLaborEntry,
  submitLaborEntries,
  approveLaborEntries,
  lockLaborEntries,
  type LaborEntryWithJoins,
  type LaborEntriesFilters,
  type DailyLaborEntryDraft,
  type DailyLaborEntryOldForReallocate,
} from "@/lib/data";
import { StatusBadge } from "@/components/base";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Search } from "lucide-react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  getLaborPaymentStatus,
  laborPaymentStatusUiLabel,
  type LaborPaymentStatus,
} from "@/lib/labor-balance-shared";
import { formatDate } from "@/lib/formatters";

function DailyEntriesSuspenseFallback() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Daily Entries"
          description="View and manage labor entries with worker and project allocation."
        />
      }
    >
      <div className="space-y-3 border-t border-gray-100 dark:border-border/60 pt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </PageLayout>
  );
}

export default function DailyEntriesPage() {
  return (
    <React.Suspense fallback={<DailyEntriesSuspenseFallback />}>
      <DailyEntriesPageInner />
    </React.Suspense>
  );
}

function laborEntryPayrollLocked(row: LaborEntryWithJoins): boolean {
  return (
    getLaborPaymentStatus(
      row.worker_payment_id ?? null,
      row.workflowStatusRaw ?? null,
      row.usesPaymentLinkForPayroll ? "payment_link" : "status_fallback"
    ) === "paid"
  );
}

function laborEntryPayrollStatusBadgeVariant(
  s: LaborPaymentStatus
): "success" | "warning" | "muted" {
  if (s === "paid") return "success";
  if (s === "partial") return "warning";
  return "muted";
}

type LaborEntryRowProps = {
  row: LaborEntryWithJoins;
  isSelected: boolean;
  isDeleting: boolean;
  payrollStatus: LaborPaymentStatus;
  rowLocked: boolean;
  onToggleSelect: (id: string) => void;
  onOpenEdit: (row: LaborEntryWithJoins) => void;
  onDelete: (row: LaborEntryWithJoins) => void;
};

const LaborEntryTableRow = React.memo(function LaborEntryTableRow({
  row,
  isSelected,
  isDeleting,
  payrollStatus,
  rowLocked,
  onToggleSelect,
  onOpenEdit,
  onDelete,
}: LaborEntryRowProps) {
  const rate = row.hours > 0 && row.cost_amount != null ? row.cost_amount / row.hours : null;
  const cost = row.cost_amount ?? 0;
  return (
    <tr
      className={cn(
        "border-b border-gray-100/80 dark:border-border/40",
        !rowLocked && listTableRowClassName
      )}
      onClick={() => {
        if (rowLocked) return;
        onOpenEdit(row);
      }}
    >
      <td className="py-1.5 px-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(row.id)}
          disabled={rowLocked}
          className="h-4 w-4 rounded border-input"
        />
      </td>
      <td className="py-1.5 px-3 font-mono tabular-nums tracking-tight text-zinc-500">
        {formatDate(row.work_date)}
      </td>
      <td className="py-1.5 px-3">{row.worker_name ?? "—"}</td>
      <td className="py-1.5 px-3">{row.project_name ?? "—"}</td>
      <td className={cn("py-1.5 px-3 text-right tabular-nums", listTableAmountCellClassName)}>
        {row.hours}
      </td>
      <td
        className={cn(
          "py-1.5 px-3 text-right tabular-nums text-muted-foreground",
          listTableAmountCellClassName
        )}
      >
        {rate != null ? `$${rate.toFixed(2)}` : "—"}
      </td>
      <td
        className={cn(
          "py-1.5 px-3 text-right tabular-nums font-medium",
          listTableAmountCellClassName
        )}
      >
        ${cost.toFixed(2)}
      </td>
      <td className="py-1.5 px-3">
        <StatusBadge
          label={laborPaymentStatusUiLabel(payrollStatus)}
          variant={laborEntryPayrollStatusBadgeVariant(payrollStatus)}
        />
      </td>
      <td className="py-1.5 px-3 max-w-[160px] truncate" title={row.notes ?? ""}>
        {row.notes ?? "—"}
      </td>
      <td className="py-1.5 px-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="btn-outline-ghost h-7 text-xs"
            onClick={() => onOpenEdit(row)}
            disabled={rowLocked}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="btn-outline-ghost h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            onClick={() => onDelete(row)}
            disabled={rowLocked || isDeleting}
          >
            <SubmitSpinner loading={isDeleting} className="mr-1" />
            {isDeleting ? "…" : "Delete"}
          </Button>
        </div>
      </td>
    </tr>
  );
});

function DailyEntriesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = React.useState<LaborEntryWithJoins[]>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getLaborWorkersList>>>([]);
  const [filters, setFilters] = React.useState<LaborEntriesFilters>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [editEntry, setEditEntry] = React.useState<LaborEntryWithJoins | null>(null);
  const [editDraft, setEditDraft] = React.useState<DailyLaborEntryDraft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = React.useState<"submit" | "approve" | "lock" | null>(null);
  const [searchInput, setSearchInput] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const activeDrawerFilterCount =
    (filters.date_from ? 1 : 0) +
    (filters.date_to ? 1 : 0) +
    (filters.worker_id ? 1 : 0) +
    (filters.project_id ? 1 : 0) +
    (filters.status ? 1 : 0);

  const filteredEntries = React.useMemo(() => {
    if (!searchInput.trim()) return entries;
    const q = searchInput.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (e.notes ?? "").toLowerCase().includes(q) ||
        (e.cost_code ?? "").toLowerCase().includes(q) ||
        (e.worker_name ?? "").toLowerCase().includes(q) ||
        (e.project_name ?? "").toLowerCase().includes(q)
    );
  }, [entries, searchInput]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;
  const total = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = React.useMemo(() => {
    const start = (curPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [curPage, filteredEntries]);

  const setPage = React.useCallback(
    (nextPage: number) => {
      const sp = new URLSearchParams(searchParams);
      sp.set("page", String(nextPage));
      startTransition(() => router.push(`/labor/entries?${sp.toString()}`, { scroll: false }));
    },
    [router, searchParams]
  );

  const loadMeta = React.useCallback(async () => {
    const [p, w] = await Promise.all([getProjects(), getLaborWorkersList()]);
    setProjects(p);
    setWorkers(w);
  }, []);

  const loadEntries = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getLaborEntriesWithJoins(filters);
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  React.useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useOnAppSync(
    React.useCallback(() => {
      void loadMeta();
      void loadEntries();
    }, [loadMeta, loadEntries]),
    [loadMeta, loadEntries]
  );

  const openEdit = React.useCallback((row: LaborEntryWithJoins) => {
    if (row.status === "Locked" || laborEntryPayrollLocked(row)) return;
    setEditEntry(row);
    setEditDraft({
      worker_id: row.worker_id,
      project_id: row.project_id,
      hours: row.hours,
      cost_code: row.cost_code,
      notes: row.notes,
    });
  }, []);

  const closeEdit = React.useCallback(() => {
    setEditEntry(null);
    setEditDraft(null);
  }, []);

  const handleEditSave = React.useCallback(async () => {
    if (!editEntry || !editDraft) return;
    setSaving(true);
    setError(null);
    try {
      const oldValues: DailyLaborEntryOldForReallocate = {
        project_id: editEntry.project_id,
        hours: editEntry.hours,
        cost_code: editEntry.cost_code,
        notes: editEntry.notes,
      };
      await updateDailyLaborEntry(editEntry.id, oldValues, editDraft);
      setMessage("Entry updated.");
      closeEdit();
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update entry.");
    } finally {
      setSaving(false);
    }
  }, [editEntry, editDraft, closeEdit, loadEntries]);

  const handleDelete = React.useCallback(
    async (row: LaborEntryWithJoins) => {
      if (row.status === "Locked" || laborEntryPayrollLocked(row)) return;
      if (!window.confirm("Delete this labor entry?")) return;
      setDeletingId(row.id);
      setError(null);
      try {
        await deleteDailyLaborEntry(row.id);
        setMessage("Entry deleted.");
        await loadEntries();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete entry.");
      } finally {
        setDeletingId(null);
      }
    },
    [loadEntries]
  );

  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = React.useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredEntries.length && filteredEntries.length > 0) return new Set();
      return new Set(filteredEntries.map((e) => e.id));
    });
  }, [filteredEntries]);

  const handleBulkSubmit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkAction("submit");
    setError(null);
    try {
      await submitLaborEntries(ids);
      setMessage(`Submitted ${ids.length} entr${ids.length === 1 ? "y" : "ies"}.`);
      setSelectedIds(new Set());
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setBulkAction(null);
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkAction("approve");
    setError(null);
    try {
      await approveLaborEntries(ids);
      setMessage(`Approved ${ids.length} entr${ids.length === 1 ? "y" : "ies"}.`);
      setSelectedIds(new Set());
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve.");
    } finally {
      setBulkAction(null);
    }
  };

  const handleBulkLock = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkAction("lock");
    setError(null);
    try {
      await lockLaborEntries(ids);
      setMessage(`Locked ${ids.length} entr${ids.length === 1 ? "y" : "ies"}.`);
      setSelectedIds(new Set());
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to lock.");
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <PageLayout
      className={cn(mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Daily Entries"
            description="View and manage labor entries with worker and project allocation."
            actions={
              <Link href="/labor/daily">
                <Button variant="outline" size="sm">
                  Add entries
                </Button>
              </Link>
            }
          />
        </div>
      }
    >
      <MobileListHeader
        title="Daily Entries"
        fab={<MobileFabPlus href="/labor/daily" ariaLabel="Add entries" />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Notes, code, worker, project…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search entries"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">From</p>
          <Input
            type="date"
            value={filters.date_from ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value || undefined }))}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">To</p>
          <Input
            type="date"
            value={filters.date_to ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || undefined }))}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Worker</p>
          <Select
            value={filters.worker_id ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, worker_id: e.target.value || undefined }))}
            className="w-full"
          >
            <option value="">All workers</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Project</p>
          <Select
            value={filters.project_id ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value || undefined }))}
            className="w-full"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <Select
            value={filters.status ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: (e.target.value || undefined) as LaborEntriesFilters["status"],
              }))
            }
            className="w-full"
          >
            <option value="">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Locked">Locked</option>
          </Select>
        </div>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      <FilterBar className="hidden md:block">
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              From
            </p>
            <Input
              type="date"
              value={filters.date_from ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, date_from: e.target.value || undefined }))
              }
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              To
            </p>
            <Input
              type="date"
              value={filters.date_to ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || undefined }))}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Worker
            </p>
            <Select
              value={filters.worker_id ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, worker_id: e.target.value || undefined }))
              }
            >
              <option value="">All workers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Project
            </p>
            <Select
              value={filters.project_id ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, project_id: e.target.value || undefined }))
              }
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Status
            </p>
            <Select
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value || undefined) as LaborEntriesFilters["status"],
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Locked">Locked</option>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Search
            </p>
            <Input
              type="text"
              placeholder="Notes, code, worker, project…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </FilterBar>
      {selectedIds.size > 0 ? (
        <div className="flex flex-col gap-2 border-b border-gray-100 py-2 dark:border-border/60 md:flex-row md:flex-wrap md:items-center">
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full sm:min-h-8 sm:w-auto"
              onClick={handleBulkSubmit}
              disabled={!!bulkAction}
            >
              <SubmitSpinner loading={bulkAction === "submit"} className="mr-2" />
              Submit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full sm:min-h-8 sm:w-auto"
              onClick={handleBulkApprove}
              disabled={!!bulkAction}
            >
              <SubmitSpinner loading={bulkAction === "approve"} className="mr-2" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full sm:min-h-8 sm:w-auto"
              onClick={handleBulkLock}
              disabled={!!bulkAction}
            >
              <SubmitSpinner loading={bulkAction === "lock"} className="mr-2" />
              Lock
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="btn-outline-ghost min-h-11 w-full sm:min-h-8 sm:w-auto"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-border/60 bg-background px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-gray-100 bg-background px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}
      <div className="border-t border-gray-100 dark:border-border/60 md:hidden">
        {loading ? (
          <div className="flex flex-col gap-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No entries match the filters."
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border/60">
            {pageRows.map((row) => {
              const payrollStatus = getLaborPaymentStatus(
                row.worker_payment_id ?? null,
                row.workflowStatusRaw ?? null,
                row.usesPaymentLinkForPayroll ? "payment_link" : "status_fallback"
              );
              const payrollLocked = payrollStatus === "paid";
              const rowLocked = row.status === "Locked" || payrollLocked;
              const cost = row.cost_amount ?? 0;
              const rate =
                row.hours > 0 && row.cost_amount != null ? row.cost_amount / row.hours : null;
              return (
                <div key={row.id} className="flex min-h-[48px] flex-col gap-2 py-2.5">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      disabled={rowLocked}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left disabled:opacity-60"
                      disabled={rowLocked}
                      onClick={() => {
                        if (!rowLocked) openEdit(row);
                      }}
                    >
                      <p className="font-mono tabular-nums tracking-tight text-xs text-zinc-500">
                        {formatDate(row.work_date)}
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {row.worker_name ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.project_name ?? "—"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                        <span>{row.hours}h</span>
                        <span>{rate != null ? `$${rate.toFixed(2)}/h` : "—"}</span>
                        <span className="font-medium text-foreground">${cost.toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5">
                        <StatusBadge
                          label={laborPaymentStatusUiLabel(payrollStatus)}
                          variant={laborEntryPayrollStatusBadgeVariant(payrollStatus)}
                        />
                      </div>
                      {row.notes ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {row.notes}
                        </p>
                      ) : null}
                    </button>
                  </div>
                  <div className="flex gap-2 pl-7">
                    <Button
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-8 flex-1 rounded-sm"
                      onClick={() => openEdit(row)}
                      disabled={rowLocked}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-8 flex-1 rounded-sm text-red-600 dark:text-red-400"
                      onClick={() => handleDelete(row)}
                      disabled={rowLocked || deletingId === row.id}
                    >
                      <SubmitSpinner loading={deletingId === row.id} className="mr-1" />
                      {deletingId === row.id ? "…" : "Delete"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto border-t border-gray-100 dark:border-border/60 md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm lg:min-w-0">
          <thead>
            <tr className="border-b border-gray-100 bg-white dark:border-border/60 dark:bg-muted/30">
              <th className="w-8 px-1">
                <input
                  type="checkbox"
                  checked={entries.length > 0 && selectedIds.size === entries.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-input"
                />
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Hours
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Rate
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Cost
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes
              </th>
              <th className="w-24 px-1" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td colSpan={11} className="py-2 px-3">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))
            ) : filteredEntries.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={11} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No entries match the filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const payrollStatus = getLaborPaymentStatus(
                  row.worker_payment_id ?? null,
                  row.workflowStatusRaw ?? null,
                  row.usesPaymentLinkForPayroll ? "payment_link" : "status_fallback"
                );
                const payrollLocked = payrollStatus === "paid";
                const rowLocked = row.status === "Locked" || payrollLocked;
                return (
                  <LaborEntryTableRow
                    key={row.id}
                    row={row}
                    isSelected={selectedIds.has(row.id)}
                    isDeleting={deletingId === row.id}
                    payrollStatus={payrollStatus}
                    rowLocked={rowLocked}
                    onToggleSelect={toggleSelect}
                    onOpenEdit={openEdit}
                    onDelete={handleDelete}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 ? (
        <Pagination page={curPage} pageSize={pageSize} total={total} onPageChange={setPage} />
      ) : null}

      <Dialog open={!!editEntry} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="grid gap-3 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Worker</label>
                <Select
                  value={editDraft.worker_id}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, worker_id: e.target.value } : null))
                  }
                  className="mt-1 w-full"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Project</label>
                <Select
                  value={editDraft.project_id ?? ""}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, project_id: e.target.value || null } : null))
                  }
                  className="mt-1 w-full"
                >
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Hours</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    value={editDraft.hours || ""}
                    onChange={(e) =>
                      setEditDraft((d) =>
                        d ? { ...d, hours: parseFloat(e.target.value) || 0 } : null
                      )
                    }
                    className="mt-1 h-9 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cost Code</label>
                  <Input
                    type="text"
                    value={editDraft.cost_code || ""}
                    onChange={(e) =>
                      setEditDraft((d) => (d ? { ...d, cost_code: e.target.value || null } : null))
                    }
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <Input
                  type="text"
                  value={editDraft.notes || ""}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, notes: e.target.value || null } : null))
                  }
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeEdit}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEditSave} disabled={saving || !editDraft?.worker_id}>
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
