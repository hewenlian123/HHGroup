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
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import {
  BriefcaseBusiness,
  CalendarPlus,
  CircleDollarSign,
  ReceiptText,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  EmptyState,
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoTable,
  NeoToolbar,
  RowActionsMenu,
} from "@/components/base";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { encodeWorkerReturnPath } from "@/lib/worker-return-path";

type WorkerBalanceSnapshot = {
  workerId: string;
  laborOwed: number;
  reimbursements: number;
  payments: number;
  advances: number;
  balance: number;
};

type WorkerPaymentSnapshot = {
  workerId?: string;
  worker_id?: string;
  paymentDate?: string;
  payment_date?: string;
  createdAt?: string;
  created_at?: string;
  amount?: number;
  total_amount?: number;
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

const workerCenterPrimaryAction =
  "rounded-[0.625rem] border border-[rgb(198_165_106_/_0.28)] bg-[var(--neo-gold)] text-zinc-950 shadow-sm hover:bg-[var(--neo-gold-soft)] hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";

const workerCenterFieldClass =
  "h-10 rounded-[0.625rem] border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[14px] text-[var(--neo-text-primary)] shadow-none placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-[44px]";

const workerCenterKpiIconClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-gold-soft)] shadow-[0_1px_0_rgb(255_255_255_/_0.035)_inset]";

const workerCenterTableHeadClass = cn(
  tableRawThClass,
  "h-10 whitespace-nowrap text-[11px] font-semibold tracking-[0.06em]"
);

const workerCenterTableCellClass = cn(tableRawTdClass, "h-[56px] py-2 text-[13px] md:text-[14px]");

function fmtRate(n: number): string {
  if (n === 0) return "—";
  return `${formatCurrency(n)} / day`;
}

function formatDayCount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const label = Math.abs(safe) === 1 ? "day" : "days";
  const display = Number.isInteger(safe) ? String(safe) : safe.toFixed(1).replace(/\.0$/, "");
  return `${display} ${label}`;
}

function workerSecondaryInfo(row: Pick<WorkerRow, "trade" | "phone">): string {
  const parts = [row.trade, row.phone].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return parts.length ? parts.join(" · ") : "No details";
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

function paymentDisplayParts(
  payment: WorkerPaymentSnapshot | null
): { amount: string; date: string } | null {
  if (!payment) return null;
  const date =
    payment.paymentDate ?? payment.payment_date ?? payment.createdAt ?? payment.created_at ?? "";
  const amount = Number(payment.amount ?? payment.total_amount) || 0;
  return { amount: formatCurrency(amount), date: formatDate(date, "compact") };
}

function paymentDateKey(payment: WorkerPaymentSnapshot | null | undefined): string {
  return (
    payment?.createdAt ?? payment?.created_at ?? payment?.paymentDate ?? payment?.payment_date ?? ""
  );
}

function paymentWorkerKey(payment: WorkerPaymentSnapshot): string {
  return normalizeWorkerId(String(payment.workerId ?? payment.worker_id ?? ""));
}

function lastPaymentMapFromPayments(
  payments: WorkerPaymentSnapshot[]
): Map<string, WorkerPaymentSnapshot> {
  const map = new Map<string, WorkerPaymentSnapshot>();
  for (const payment of payments) {
    const key = paymentWorkerKey(payment);
    if (!key) continue;
    const current = map.get(key);
    if (!current || paymentDateKey(payment) > paymentDateKey(current)) {
      map.set(key, payment);
    }
  }
  return map;
}

function payStatusFor(row: WorkerRow, netToPay: number): WorkerCenterRow["payStatus"] {
  if (row.status === "Inactive") return "Inactive";
  if (netToPay > 0.005) return "Ready to pay";
  if (netToPay < -0.005) return "Overpaid";
  return "Settled";
}

function compareWorkerCenterRows(a: WorkerCenterRow, b: WorkerCenterRow): number {
  const aOwed = a.netToPay > 0.005;
  const bOwed = b.netToPay > 0.005;
  if (aOwed !== bOwed) return aOwed ? -1 : 1;
  const balanceDelta = b.netToPay - a.netToPay;
  if (Math.abs(balanceDelta) > 0.005) return balanceDelta;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function PayStatusPill({
  status,
  className,
}: {
  status: WorkerCenterRow["payStatus"];
  className?: string;
}) {
  const tone =
    status === "Ready to pay"
      ? "border-[rgb(216_180_106_/_0.30)] bg-[rgb(216_180_106_/_0.10)] text-[#E3C27E]"
      : status === "Settled"
        ? "border-[rgb(16_185_129_/_0.28)] bg-[rgb(16_185_129_/_0.08)] text-[#8BD7B1]"
        : status === "Overpaid"
          ? "border-[rgb(99_179_237_/_0.24)] bg-[rgb(99_179_237_/_0.08)] text-[#9AC7EF]"
          : "border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-secondary)]";
  const dot =
    status === "Ready to pay"
      ? "bg-[#E3C27E]"
      : status === "Settled"
        ? "bg-[#8BD7B1]"
        : status === "Overpaid"
          ? "bg-[#9AC7EF]"
          : "bg-[var(--neo-text-tertiary)]";

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-normal shadow-[0_1px_0_rgb(255_255_255_/_0.025)_inset]",
        tone,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {status}
    </span>
  );
}

function LastPaymentCell({
  payment,
  className,
}: {
  payment: WorkerPaymentSnapshot | null;
  className?: string;
}) {
  const parts = paymentDisplayParts(payment);
  if (!parts) {
    return <span className={cn("text-[var(--neo-text-tertiary)]", className)}>—</span>;
  }

  return (
    <span className={cn("block leading-tight", className)}>
      <span className="block font-semibold tabular-nums text-[var(--neo-text-primary)]">
        {parts.amount}
      </span>
      <span className="mt-0.5 block text-[12px] text-[var(--neo-text-tertiary)]">{parts.date}</span>
    </span>
  );
}

function KpiLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className={workerCenterKpiIconClass}>{icon}</span>
      <span>{children}</span>
    </span>
  );
}

export function WorkersListClient({
  rows,
  dataLoadWarning = null,
  initialLastPayments = [],
}: {
  rows: WorkerRow[];
  dataLoadWarning?: string | null;
  initialLastPayments?: WorkerPaymentSnapshot[];
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
    lastPaymentByWorkerId: lastPaymentMapFromPayments(initialLastPayments),
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
      fetch(`/api/labor/worker-payments?limit=500&t=${Date.now()}`, { cache: "no-store" }),
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
      next.lastPaymentByWorkerId = lastPaymentMapFromPayments(body.payments ?? []);
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

    setMetrics((prev) => ({
      ...next,
      lastPaymentByWorkerId:
        next.lastPaymentByWorkerId.size > 0
          ? next.lastPaymentByWorkerId
          : prev.lastPaymentByWorkerId,
    }));
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
    if (q) {
      list = list.filter((w) => {
        const hay = [w.name, w.trade, w.phone, w.notes]
          .map((v) => (v ?? "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }
    return [...list].sort(compareWorkerCenterRows);
  }, [workbenchRows, searchInput, statusFilter]);

  const centerSummary = React.useMemo(() => {
    const readyToPay = workbenchRows.filter((w) => w.payStatus === "Ready to pay").length;
    const totalNetToPay = workbenchRows.reduce((sum, w) => sum + w.netToPay, 0);
    const unpaidLabor = workbenchRows.reduce((sum, w) => sum + w.unpaidLabor, 0);
    const reimbursements = workbenchRows.reduce((sum, w) => sum + w.reimbursements, 0);
    const advances = workbenchRows.reduce((sum, w) => sum + w.advances, 0);
    return { readyToPay, totalNetToPay, unpaidLabor, reimbursements, advances };
  }, [workbenchRows]);

  const activeDrawerFilterCount = (statusFilter !== "all" ? 1 : 0) + (searchInput.trim() ? 1 : 0);

  const searchField = (
    <div className="relative w-full min-w-0">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]"
        aria-hidden
      />
      <Input
        type="text"
        placeholder="Name, trade, phone…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={cn(workerCenterFieldClass, "pl-9")}
        aria-label="Search workers"
      />
    </div>
  );

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
    toast({
      title: "Worker created",
      description: `Opening ${worker.name}.`,
      variant: "success",
    });
  };

  const workerActionItems = React.useCallback(
    (row: WorkerCenterRow) => [
      {
        label: "Add Time Entry",
        onClick: () => router.push(`/labor?workerId=${encodeURIComponent(row.id)}&addDaily=1`),
        disabled: busy,
      },
      {
        label: "Upload Worker Receipt",
        onClick: () =>
          router.push(
            `/upload-receipt?workerId=${encodeURIComponent(row.id)}&returnTo=${encodeWorkerReturnPath(row.id, "receipts")}`
          ),
        disabled: busy,
      },
      {
        label: "Add Reimbursement",
        onClick: () =>
          router.push(
            `/labor/reimbursements?workerId=${encodeURIComponent(row.id)}&new=1&returnTo=${encodeWorkerReturnPath(row.id, "receipts")}`
          ),
        disabled: busy,
      },
      {
        label: "Add Advance",
        onClick: () =>
          router.push(
            `/labor/advances?workerId=${encodeURIComponent(row.id)}&new=1&returnTo=${encodeWorkerReturnPath(row.id, "advances")}`
          ),
        disabled: busy,
      },
      {
        label: "Pay Worker",
        onClick: () =>
          router.push(
            `/labor/workers/${encodeURIComponent(row.id)}/balance?returnTo=${encodeWorkerReturnPath(row.id, "payments")}`
          ),
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
          searchSlot={searchField}
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
              className={cn(workerCenterFieldClass, "w-full appearance-none px-3")}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
            <Link href="/labor/payroll">Payroll Summary</Link>
          </Button>
          <Button
            type="button"
            className={cn("w-full", workerCenterPrimaryAction)}
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>
        <MobileEmptyState
          icon={<UserPlus className="h-5 w-5" />}
          message="Add workers to track trades, daily rates, and OT rates."
          action={
            <Button
              size="sm"
              className={cn("h-10 rounded-[0.625rem]", workerCenterPrimaryAction)}
              onClick={() => setAddOpen(true)}
            >
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
              <Button
                size="touch"
                className={cn("min-h-[44px]", workerCenterPrimaryAction)}
                onClick={() => setAddOpen(true)}
              >
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
        filtersTriggerClassName="h-11 min-h-[44px] rounded-[0.625rem]"
        searchSlot={searchField}
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className={cn(workerCenterFieldClass, "w-full appearance-none px-3")}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
          <Link href="/labor/payroll">Payroll Summary</Link>
        </Button>
        <Button
          type="button"
          className={cn("w-full", workerCenterPrimaryAction)}
          onClick={() => setFiltersOpen(false)}
        >
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label={
            <KpiLabel icon={<UserPlus className="h-3.5 w-3.5" aria-hidden />}>
              Workers ready to pay
            </KpiLabel>
          }
          value={centerSummary.readyToPay}
          meta="Workers with a positive net balance"
          tone="warning"
          className="min-h-[94px] rounded-[18px]"
        />
        <KpiTile
          label={
            <KpiLabel icon={<CircleDollarSign className="h-3.5 w-3.5" aria-hidden />}>
              Total net to pay
            </KpiLabel>
          }
          value={
            <NeoAmount
              tone={centerSummary.totalNetToPay > 0.005 ? "danger" : "neutral"}
              className={centerSummary.totalNetToPay > 0.005 ? "text-rose-300/90" : undefined}
            >
              {formatCurrency(centerSummary.totalNetToPay)}
            </NeoAmount>
          }
          meta="Labor + reimbursements - advances - payments"
          tone="neutral"
          className="min-h-[94px] rounded-[18px]"
        />
        <KpiTile
          label={
            <KpiLabel icon={<BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden />}>
              Unpaid labor
            </KpiLabel>
          }
          value={<NeoAmount>{formatCurrency(centerSummary.unpaidLabor)}</NeoAmount>}
          meta="Open labor snapshot total"
          className="min-h-[94px] rounded-[18px]"
        />
        <KpiTile
          label={
            <KpiLabel icon={<ReceiptText className="h-3.5 w-3.5" aria-hidden />}>
              Reimbursements / Advances
            </KpiLabel>
          }
          value={
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <NeoAmount>{formatCurrency(centerSummary.reimbursements)}</NeoAmount>
              <span className="text-[13px] font-medium text-[var(--neo-text-tertiary)]">/</span>
              <NeoAmount>{formatCurrency(centerSummary.advances)}</NeoAmount>
            </span>
          }
          meta="Open reimbursement and advance totals"
          className="min-h-[94px] rounded-[18px]"
        />
      </div>

      <NeoToolbar className="hidden gap-2 p-2 md:flex md:flex-row md:items-center md:justify-between">
        <div className="min-w-[260px] max-w-md flex-1">{searchField}</div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className={cn(workerCenterFieldClass, "w-full appearance-none px-3 md:w-[180px]")}
          aria-label="Filter workers by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </NeoToolbar>

      <div className="flex flex-col gap-2 md:hidden" data-testid="worker-center-mobile-cards">
        {filteredRows.length === 0 ? (
          <MobileEmptyState
            icon={<UserPlus className="h-5 w-5" />}
            message="No workers match your search or filters."
          />
        ) : (
          filteredRows.map((r) => (
            <NeoMobileCard
              key={r.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer space-y-3 p-3 text-left"
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
                  <p className="truncate text-[15px] font-semibold text-[var(--neo-text-primary)]">
                    {r.name}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[var(--neo-text-tertiary)]">
                    {workerSecondaryInfo(r)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Net to pay
                  </p>
                  <NeoAmount
                    tone={r.netToPay > 0.005 ? "danger" : "neutral"}
                    className={cn(
                      "block text-[18px] leading-tight",
                      r.netToPay > 0.005 && "text-rose-300/90"
                    )}
                  >
                    {formatCurrency(r.netToPay)}
                  </NeoAmount>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-[0.75rem] border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Daily rate
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--neo-text-primary)]">
                    {fmtRate(r.daily_rate)}
                  </dd>
                </div>
                <div className="rounded-[0.75rem] border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Unpaid labor
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--neo-text-primary)]">
                    {formatCurrency(r.unpaidLabor)}
                  </dd>
                </div>
                <div className="rounded-[0.75rem] border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Reimb.
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--neo-text-primary)]">
                    {formatCurrency(r.reimbursements)}
                  </dd>
                </div>
                <div className="rounded-[0.75rem] border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                    Advances
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--neo-text-primary)]">
                    {formatCurrency(r.advances)}
                  </dd>
                </div>
              </dl>
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--neo-border)] pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-w-0">
                  <PayStatusPill status={r.payStatus} />
                  <div className="mt-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]">
                      Last payment
                    </p>
                    <LastPaymentCell payment={r.lastPayment} className="text-[12px]" />
                  </div>
                </div>
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
                      Upload Worker Receipt
                    </Link>
                  </Button>
                  <RowActionsMenu
                    appearance="list"
                    ariaLabel={`Actions for ${r.name}`}
                    actions={workerActionItems(r)}
                  />
                </div>
              </div>
            </NeoMobileCard>
          ))
        )}
      </div>
      <NeoTable
        className="hidden rounded-[18px] md:block"
        tableClassName="min-w-[1100px] table-fixed"
      >
        <thead>
          <tr>
            <th className={cn(workerCenterTableHeadClass, "w-[260px]")}>Worker</th>
            <th className={cn(workerCenterTableHeadClass, "w-[112px] text-right tabular-nums")}>
              Daily Rate
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[86px] text-right tabular-nums")}>
              This Week
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[108px] text-right tabular-nums")}>
              Unpaid Labor
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[124px] text-right tabular-nums")}>
              Reimbursements
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[92px] text-right tabular-nums")}>
              Advances
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[106px] text-right tabular-nums")}>
              Net To Pay
            </th>
            <th className={cn(workerCenterTableHeadClass, "w-[96px]")}>Last Payment</th>
            <th className={cn(workerCenterTableHeadClass, "w-[92px]")}>Status</th>
            <th
              className={cn(workerCenterTableHeadClass, "w-[36px] px-2 text-right")}
              aria-label="Actions"
            />
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr className="border-b border-[var(--neo-border)]">
              <td
                colSpan={10}
                className="px-6 py-10 text-center text-sm text-[var(--neo-text-secondary)]"
              >
                No workers match your search or filters.
              </td>
            </tr>
          ) : (
            filteredRows.map((r) => (
              <tr
                key={r.id}
                data-testid="worker-center-row"
                data-worker-name={r.name}
                tabIndex={0}
                role="link"
                aria-label={`Open worker ${r.name}`}
                className={cn(
                  listTableRowClassName,
                  "border-b border-[var(--neo-border)] last:border-b-0"
                )}
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
                    workerCenterTableCellClass,
                    "w-[260px] font-semibold",
                    listTablePrimaryCellClassName
                  )}
                >
                  <span className="block truncate text-[var(--neo-text-primary)]">{r.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] font-normal text-[var(--neo-text-tertiary)]">
                    {workerSecondaryInfo(r)}
                  </span>
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  <NeoAmount>{fmtRate(r.daily_rate)}</NeoAmount>
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  {formatDayCount(r.thisWeekDays)}
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  <NeoAmount>{formatCurrency(r.unpaidLabor)}</NeoAmount>
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  <NeoAmount>{formatCurrency(r.reimbursements)}</NeoAmount>
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums",
                    listTableAmountCellClassName
                  )}
                >
                  <NeoAmount>{formatCurrency(r.advances)}</NeoAmount>
                </td>
                <td
                  className={cn(
                    workerCenterTableCellClass,
                    "whitespace-nowrap text-right tabular-nums"
                  )}
                >
                  <NeoAmount
                    tone={r.netToPay > 0.005 ? "danger" : "neutral"}
                    className={cn("text-[14px]", r.netToPay > 0.005 && "text-rose-300/90")}
                  >
                    {formatCurrency(r.netToPay)}
                  </NeoAmount>
                </td>
                <td className={cn(workerCenterTableCellClass, "text-[var(--neo-text-secondary)]")}>
                  <LastPaymentCell payment={r.lastPayment} />
                </td>
                <td className={workerCenterTableCellClass}>
                  <PayStatusPill status={r.payStatus} />
                </td>
                <td
                  className={cn(workerCenterTableCellClass, "px-2 text-right")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsMenu
                    appearance="list"
                    ariaLabel={`Actions for ${r.name}`}
                    actions={workerActionItems(r)}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </NeoTable>

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
