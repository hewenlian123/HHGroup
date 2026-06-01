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
import { CalendarPlus, Search, Upload, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";
import { formatCurrency, formatDate } from "@/lib/formatters";

type WorkerBalanceSnapshot = {
  workerId: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
};

type WorkerPaymentSnapshot = {
  workerId: string;
  paymentDate?: string;
  createdAt?: string;
  amount?: number;
};

type WorkerCenterMetrics = {
  balancesByWorkerId: Map<string, WorkerBalanceSnapshot>;
  weekDaysByWorkerId: Map<string, number>;
  lastPaymentByWorkerId: Map<string, WorkerPaymentSnapshot>;
};

type WorkerCenterRow = WorkerRow & {
  thisWeekDays: number;
  unpaidLabor: number;
  reimbursements: number;
  advances: number;
  netToPay: number;
  lastPayment: WorkerPaymentSnapshot | null;
  payStatus: "Ready to pay" | "Settled" | "Overpaid" | "Inactive";
};

function fmtRate(n: number): string {
  if (n === 0) return "—";
  return formatCurrency(n);
}

function normalizeWorkerId(id: string): string {
  return id.trim().toLowerCase();
}

function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: ymdLocal(start), to: ymdLocal(end) };
}

function paymentDisplay(payment: WorkerPaymentSnapshot | null): string {
  if (!payment) return "—";
  const date = payment.paymentDate ?? payment.createdAt ?? "";
  const amount = Number(payment.amount) || 0;
  return `${formatCurrency(amount)} · ${formatDate(date, "compact")}`;
}

function payStatusFor(row: WorkerRow, netToPay: number): WorkerCenterRow["payStatus"] {
  if (row.status === "Inactive") return "Inactive";
  if (netToPay > 0.005) return "Ready to pay";
  if (netToPay < -0.005) return "Overpaid";
  return "Settled";
}

function statusClass(status: WorkerCenterRow["payStatus"]): string {
  if (status === "Ready to pay") return "hh-pill-warning";
  if (status === "Settled") return "hh-pill-success";
  if (status === "Overpaid") return "hh-pill-info";
  return "text-muted-foreground text-sm";
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
  const [metrics, setMetrics] = React.useState<WorkerCenterMetrics>({
    balancesByWorkerId: new Map(),
    weekDaysByWorkerId: new Map(),
    lastPaymentByWorkerId: new Map(),
  });
  const [metricsMessage, setMetricsMessage] = React.useState<string | null>(null);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const loadWorkerCenterMetrics = React.useCallback(async () => {
    setMetricsMessage(null);
    const { from, to } = currentWeekRange();
    const next: WorkerCenterMetrics = {
      balancesByWorkerId: new Map(),
      weekDaysByWorkerId: new Map(),
      lastPaymentByWorkerId: new Map(),
    };

    const [balancesRes, paymentsRes, entriesRes] = await Promise.allSettled([
      fetch(`/api/labor/worker-balances?t=${Date.now()}`, { cache: "no-store" }),
      fetch("/api/labor/worker-payments?limit=500", { cache: "no-store" }),
      fetch(`/api/labor/entries?view=joined&dateFrom=${from}&dateTo=${to}`, {
        cache: "no-store",
      }),
    ]);

    const warnings: string[] = [];

    if (balancesRes.status === "fulfilled" && balancesRes.value.ok) {
      const body = (await balancesRes.value.json().catch(() => ({}))) as {
        balances?: WorkerBalanceSnapshot[];
      };
      for (const row of body.balances ?? []) {
        next.balancesByWorkerId.set(normalizeWorkerId(String(row.workerId ?? "")), {
          workerId: String(row.workerId ?? ""),
          laborOwed: Number(row.laborOwed) || 0,
          reimbursements: Number(row.reimbursements) || 0,
          payments: Number(row.payments) || 0,
          advances: Number(row.advances) || 0,
          balance: Number(row.balance) || 0,
        });
      }
    } else {
      warnings.push("worker balances");
    }

    if (paymentsRes.status === "fulfilled" && paymentsRes.value.ok) {
      const body = (await paymentsRes.value.json().catch(() => ({}))) as {
        payments?: WorkerPaymentSnapshot[];
      };
      for (const payment of body.payments ?? []) {
        const key = normalizeWorkerId(String(payment.workerId ?? ""));
        if (!key) continue;
        const current = next.lastPaymentByWorkerId.get(key);
        const currentDate = current?.createdAt ?? current?.paymentDate ?? "";
        const nextDate = payment.createdAt ?? payment.paymentDate ?? "";
        if (!current || nextDate > currentDate) {
          next.lastPaymentByWorkerId.set(key, payment);
        }
      }
    } else {
      warnings.push("last payments");
    }

    if (entriesRes.status === "fulfilled" && entriesRes.value.ok) {
      const body = (await entriesRes.value.json().catch(() => ({}))) as {
        entries?: Array<{ worker_id?: string | null; workerId?: string | null }>;
      };
      for (const entry of body.entries ?? []) {
        const workerId = String(entry.worker_id ?? entry.workerId ?? "").trim();
        if (!workerId) continue;
        const key = normalizeWorkerId(workerId);
        next.weekDaysByWorkerId.set(key, (next.weekDaysByWorkerId.get(key) ?? 0) + 1);
      }
    } else {
      warnings.push("this week labor");
    }

    setMetrics(next);
    setMetricsMessage(
      warnings.length ? `Some Worker Center metrics could not load: ${warnings.join(", ")}.` : null
    );
  }, []);

  React.useEffect(() => {
    void loadWorkerCenterMetrics();
  }, [loadWorkerCenterMetrics]);

  const workbenchRows = React.useMemo<WorkerCenterRow[]>(() => {
    return items.map((worker) => {
      const key = normalizeWorkerId(worker.id);
      const balance = metrics.balancesByWorkerId.get(key);
      const netToPay = Number(balance?.balance) || 0;
      return {
        ...worker,
        thisWeekDays: metrics.weekDaysByWorkerId.get(key) ?? 0,
        unpaidLabor: Number(balance?.laborOwed) || 0,
        reimbursements: Number(balance?.reimbursements) || 0,
        advances: Number(balance?.advances) || 0,
        netToPay,
        lastPayment: metrics.lastPaymentByWorkerId.get(key) ?? null,
        payStatus: payStatusFor(worker, netToPay),
      };
    });
  }, [items, metrics]);

  const filteredRows = React.useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    let list = workbenchRows;
    if (statusFilter === "active") list = list.filter((w) => w.status === "Active");
    if (statusFilter === "inactive") list = list.filter((w) => w.status === "Inactive");
    if (!q) return list;
    return list.filter((w) => {
      const hay = [w.name, w.trade, w.phone, w.notes].map((v) => (v ?? "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [workbenchRows, searchInput, statusFilter]);

  const activeDrawerFilterCount = (statusFilter !== "all" ? 1 : 0) + (searchInput.trim() ? 1 : 0);

  React.useEffect(() => {
    setItems(rows);
  }, [rows]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
      void loadWorkerCenterMetrics();
    }, [router, loadWorkerCenterMetrics]),
    [router, loadWorkerCenterMetrics]
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

  const onDelete = React.useCallback(
    (row: WorkerRow) => {
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
    },
    [busy, toast]
  );

  const handleAddSuccess = (worker: WorkerRow) => {
    setItems((prev) => [...prev, worker].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const workerActionItems = React.useCallback(
    (row: WorkerCenterRow) => [
      {
        label: "Add Time Entry",
        onClick: () => router.push(`/labor?workerId=${encodeURIComponent(row.id)}&addDaily=1`),
        disabled: busy,
      },
      {
        label: "Upload Receipt",
        onClick: () => router.push(`/upload-receipt?workerId=${encodeURIComponent(row.id)}`),
        disabled: busy,
      },
      {
        label: "Add Reimbursement",
        onClick: () =>
          router.push(`/labor/reimbursements?workerId=${encodeURIComponent(row.id)}&new=1`),
        disabled: busy,
      },
      {
        label: "Add Advance",
        onClick: () => router.push(`/labor/advances?workerId=${encodeURIComponent(row.id)}&new=1`),
        disabled: busy,
      },
      {
        label: "Pay Worker",
        onClick: () => router.push(`/labor/workers/${encodeURIComponent(row.id)}/balance`),
        disabled: busy || row.netToPay <= 0.005,
      },
      {
        label: "View Detail",
        onClick: () => router.push(`/workers/${encodeURIComponent(row.id)}`),
        disabled: busy,
      },
      { label: "Edit", onClick: () => setEditFor(row), disabled: busy },
      {
        label: "Delete",
        onClick: () => onDelete(row),
        destructive: true,
        disabled: busy,
      },
    ],
    [busy, router, onDelete]
  );

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
            <Link href="/labor/payroll">Payroll Summary</Link>
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
        title="Worker Center"
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
          <Link href="/labor/payroll">Payroll Summary</Link>
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
      {metricsMessage ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {metricsMessage}
        </p>
      ) : null}
      <div className="md:hidden divide-y divide-gray-100 dark:divide-border/60">
        {filteredRows.length === 0 ? (
          <MobileEmptyState
            icon={<UserPlus className="h-5 w-5" />}
            message="No workers match your search or filters."
          />
        ) : (
          filteredRows.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="hh-row-interactive flex min-h-[88px] cursor-pointer flex-col items-stretch gap-2 py-2.5 text-left"
              onClick={() => router.push(`/workers/${r.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/workers/${r.id}`);
                }
              }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{r.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {r.trade ?? "—"} · Daily {fmtRate(r.daily_rate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Net to pay
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      r.netToPay > 0.005 && "text-destructive"
                    )}
                  >
                    {formatCurrency(r.netToPay)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span>
                  Week <b className="font-semibold text-foreground">{r.thisWeekDays}</b>
                </span>
                <span>
                  Labor{" "}
                  <b className="font-semibold text-foreground">{formatCurrency(r.unpaidLabor)}</b>
                </span>
                <span>
                  Reimb{" "}
                  <b className="font-semibold text-foreground">
                    {formatCurrency(r.reimbursements)}
                  </b>
                </span>
                <span>
                  Adv <b className="font-semibold text-foreground">{formatCurrency(r.advances)}</b>
                </span>
              </div>
              <div
                className="flex items-center justify-between gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <span className={cn(statusClass(r.payStatus), "text-[11px]")}>{r.payStatus}</span>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto">
                  <Button asChild variant="outline" size="sm" className="h-8 shrink-0 rounded-sm">
                    <Link href={`/labor?workerId=${encodeURIComponent(r.id)}&addDaily=1`}>
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Time
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 shrink-0 rounded-sm">
                    <Link href={`/upload-receipt?workerId=${encodeURIComponent(r.id)}`}>
                      <Upload className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Receipt
                    </Link>
                  </Button>
                  <RowActionsMenu
                    appearance="list"
                    ariaLabel={`Actions for ${r.name}`}
                    actions={workerActionItems(r)}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="table-responsive hidden md:block">
        <table className="w-full min-w-[1120px] border-separate border-spacing-y-1.5 border-spacing-x-0 text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Worker
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Daily Rate
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                This Week
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Unpaid Labor
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Reimbursements
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Advances
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">
                Net To Pay
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last Payment
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="w-10 px-1 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
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
                  <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                    {r.trade ?? "—"} · {r.phone ?? "—"}
                  </p>
                </td>
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
                  {r.thisWeekDays}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {formatCurrency(r.unpaidLabor)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {formatCurrency(r.reimbursements)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {formatCurrency(r.advances)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    r.netToPay > 0.005 ? "text-destructive" : listTableAmountCellClassName
                  )}
                >
                  {formatCurrency(r.netToPay)}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {paymentDisplay(r.lastPayment)}
                </td>
                <td className="px-3 py-1.5">
                  <span className={statusClass(r.payStatus)}>{r.payStatus}</span>
                </td>
                <td
                  className="last:rounded-r-xl px-1 py-1.5 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsMenu
                    appearance="list"
                    ariaLabel={`Actions for ${r.name}`}
                    actions={workerActionItems(r)}
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
