"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import type { WorkerRow, WorkerStatus } from "@/lib/workers-db";
import { updateWorkerAction, deleteWorkerAction } from "./actions";
import { AddWorkerModal } from "./add-worker-modal";
import { EmptyState } from "@/components/empty-state";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";

function fmtRate(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WorkersListClient({
  rows,
  dataLoadWarning = null,
}: {
  rows: WorkerRow[];
  dataLoadWarning?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = React.useState<WorkerRow[]>(rows);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editFor, setEditFor] = React.useState<WorkerRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [dailyRate, setDailyRate] = React.useState("");
  const [defaultOtRate, setDefaultOtRate] = React.useState("");
  const [status, setStatus] = React.useState<WorkerStatus>("Active");
  const [notes, setNotes] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("all");
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const filteredForMobile = React.useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    let list = items;
    if (statusFilter === "active") list = list.filter((w) => w.status === "Active");
    if (statusFilter === "inactive") list = list.filter((w) => w.status === "Inactive");
    if (!q) return list;
    return list.filter((w) => {
      const hay = [w.name, w.trade, w.phone, w.notes].map((v) => (v ?? "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [items, searchInput, statusFilter]);

  const activeDrawerFilterCount = (statusFilter !== "all" ? 1 : 0) + (searchInput.trim() ? 1 : 0);

  React.useEffect(() => {
    setItems(rows);
  }, [rows]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  React.useEffect(() => {
    if (!editFor) return;
    setName(editFor.name ?? "");
    setPhone(editFor.phone ?? "");
    setTrade(editFor.trade ?? "");
    setDailyRate(editFor.daily_rate != null ? String(editFor.daily_rate) : "");
    setDefaultOtRate(editFor.default_ot_rate != null ? String(editFor.default_ot_rate) : "");
    setStatus(editFor.status ?? "Active");
    setNotes(editFor.notes ?? "");
  }, [editFor]);

  const onSaveEdit = () => {
    if (!editFor || busy) return;
    const nameTrim = name.trim();
    if (!nameTrim) {
      toast({ title: "Name is required", variant: "error" });
      return;
    }
    const id = editFor.id;
    const original = editFor;
    const patch: WorkerRow = {
      ...editFor,
      name: nameTrim,
      phone: phone.trim() || null,
      trade: trade.trim() || null,
      daily_rate: Number(dailyRate) || 0,
      default_ot_rate: Number(defaultOtRate) || 0,
      status,
      notes: notes.trim() || null,
    };
    type Snap = { list: WorkerRow[]; editing: WorkerRow };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ list: [...itemsRef.current], editing: original }),
      apply: () => {
        setItems((prev) => prev.map((w) => (w.id === id ? patch : w)));
        setEditFor(null);
      },
      rollback: (s) => {
        setItems(s.list);
        setEditFor(s.editing);
      },
      persist: () =>
        updateWorkerAction(id, {
          name: nameTrim,
          phone: phone.trim() || null,
          trade: trade.trim() || null,
          daily_rate: Number(dailyRate) || 0,
          default_ot_rate: Number(defaultOtRate) || 0,
          status,
          notes: notes.trim() || null,
        }).then((res) => (res.ok ? undefined : { error: res.error ?? "Failed to update worker." })),
      onError: (msg) => toast({ title: "Save failed", description: msg, variant: "error" }),
      onSuccess: () => toast({ title: "Saved", variant: "success" }),
    });
  };

  const onDelete = (row: WorkerRow) => {
    if (busy) return;
    type Snap = { list: WorkerRow[] };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ list: [...itemsRef.current] }),
      apply: () => setItems((prev) => prev.filter((w) => w.id !== row.id)),
      rollback: (s) => setItems([...s.list].sort((a, b) => a.name.localeCompare(b.name))),
      persist: () =>
        deleteWorkerAction(row.id).then((res) =>
          res.ok ? undefined : { error: res.error ?? "Failed to delete worker." }
        ),
      onError: (msg) => toast({ title: "Delete failed", description: msg, variant: "error" }),
      onSuccess: () => toast({ title: "Deleted", variant: "success" }),
    });
  };

  const handleAddSuccess = (worker: WorkerRow) => {
    setItems((prev) => [...prev, worker].sort((a, b) => a.name.localeCompare(b.name)));
  };

  if (items.length === 0) {
    return (
      <>
        <MobileListHeader
          title="Workers"
          fab={<MobileFabButton ariaLabel="Add worker" onClick={() => setAddOpen(true)} />}
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
                placeholder="Name, trade, phone…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-10 pl-8 text-sm"
                aria-label="Search workers"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
            <Link href="/workers/summary">Worker summary</Link>
          </Button>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>
        <MobileEmptyState
          icon={<UserPlus className="h-5 w-5" />}
          message="Add workers to track trades, daily rates, and OT rates."
          action={
            <Button size="sm" className="h-9 rounded-sm" onClick={() => setAddOpen(true)}>
              Add Worker
            </Button>
          }
        />
        <div className="hidden md:block">
          <EmptyState
            title="No workers yet"
            description="Add workers to track trades, daily rates, and OT rates."
            icon={<UserPlus className="h-5 w-5" />}
            action={
              <Button size="touch" className="min-h-[44px]" onClick={() => setAddOpen(true)}>
                Add Worker
              </Button>
            }
          />
        </div>
        <AddWorkerModal open={addOpen} onOpenChange={setAddOpen} onSuccess={handleAddSuccess} />
      </>
    );
  }

  return (
    <>
      <MobileListHeader
        title="Workers"
        fab={<MobileFabButton ariaLabel="Add worker" onClick={() => setAddOpen(true)} />}
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
              placeholder="Name, trade, phone…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search workers"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
          <Link href="/workers/summary">Worker summary</Link>
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>
      {dataLoadWarning ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      <div className="md:hidden divide-y divide-gray-100 dark:divide-border/60">
        {filteredForMobile.length === 0 ? (
          <MobileEmptyState
            icon={<UserPlus className="h-5 w-5" />}
            message="No workers match your search or filters."
          />
        ) : (
          filteredForMobile.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="flex min-h-[56px] cursor-pointer items-center justify-between gap-2 py-2 text-left"
              onClick={() => router.push(`/workers/${r.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/workers/${r.id}`);
                }
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {r.trade ?? "—"} · {r.phone ?? "—"}
                </p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  Daily {fmtRate(r.daily_rate)}
                  <span className="mx-1.5 text-border">·</span>
                  <span
                    className={
                      r.status === "Active" ? "text-emerald-600 dark:text-emerald-500" : ""
                    }
                  >
                    {r.status}
                  </span>
                </p>
              </div>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu
                  appearance="list"
                  ariaLabel={`Actions for ${r.name}`}
                  actions={[
                    {
                      label: "View",
                      onClick: () => router.push(`/workers/${r.id}`),
                      disabled: busy,
                    },
                    { label: "Edit", onClick: () => setEditFor(r), disabled: busy },
                    {
                      label: "Delete",
                      onClick: () => onDelete(r),
                      destructive: true,
                      disabled: busy,
                    },
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>
      <div className="table-responsive hidden md:block">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 border-spacing-x-0 text-sm md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Trade
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phone
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Daily Rate
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Default OT Rate
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="w-10 px-1 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.id}
                tabIndex={0}
                role="link"
                aria-label={`Open worker ${r.name}`}
                className={listTableRowClassName}
                onClick={() => router.push(`/workers/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/workers/${r.id}`);
                  }
                }}
              >
                <td
                  className={cn(
                    "first:rounded-l-xl px-3 py-1.5 font-medium",
                    listTablePrimaryCellClassName
                  )}
                >
                  {r.name}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.trade ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.phone ?? "—"}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {fmtRate(r.daily_rate)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {fmtRate(r.default_ot_rate)}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      r.status === "Active" ? "hh-pill-success" : "text-muted-foreground text-sm"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td
                  className="last:rounded-r-xl px-1 py-1.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsMenu
                    appearance="list"
                    ariaLabel={`Actions for ${r.name}`}
                    actions={[
                      {
                        label: "View",
                        onClick: () => router.push(`/workers/${r.id}`),
                        disabled: busy,
                      },
                      { label: "Edit", onClick: () => setEditFor(r), disabled: busy },
                      {
                        label: "Delete",
                        onClick: () => onDelete(r),
                        destructive: true,
                        disabled: busy,
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddWorkerModal open={addOpen} onOpenChange={setAddOpen} onSuccess={handleAddSuccess} />

      <Dialog open={!!editFor} onOpenChange={(open) => !open && setEditFor(null)}>
        <DialogContent className="max-w-md gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit Worker</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name (required)</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Trade</label>
                <Input
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Daily Rate</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default OT Rate</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={defaultOtRate}
                  onChange={(e) => setDefaultOtRate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkerStatus)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setEditFor(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={onSaveEdit}
              disabled={busy || !name.trim()}
              aria-busy={busy}
            >
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
