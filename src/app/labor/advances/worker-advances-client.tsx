"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
import {
  ArrowLeftRight,
  CalendarDays,
  DollarSign,
  ListOrdered,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { FilterBar } from "@/components/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { WorkerAdvanceFormDialog } from "./worker-advance-form-dialog";
import { WorkerAdvanceActionsMenu } from "./worker-advance-actions-menu";

type WorkerOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };

export type AdvanceRow = {
  id: string;
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  advanceDate: string;
  status: "pending" | "deducted" | "cancelled";
  notes: string | null;
};

type Props = {
  workers: WorkerOption[];
  projects: ProjectOption[];
};

const advShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const advKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const advKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100/55 text-zinc-500 md:h-8 md:w-8 dark:bg-muted/60 dark:text-muted-foreground";

const AVATAR_RING = [
  "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700/50 dark:text-zinc-100",
  "bg-zinc-300/65 text-zinc-900 dark:bg-zinc-600/45 dark:text-zinc-100",
  "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/55 dark:text-zinc-100",
  "bg-zinc-200/70 text-zinc-800 dark:bg-zinc-700/48 dark:text-zinc-100",
  "bg-zinc-300/55 text-zinc-900 dark:bg-zinc-600/40 dark:text-zinc-100",
  "bg-zinc-100/95 text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100",
];

const workerAvatarRing = "ring-1 ring-inset ring-zinc-950/[0.055] dark:ring-white/[0.08]";

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  const one = parts[0] ?? name;
  return one.slice(0, 2).toUpperCase();
}

function avatarRingClass(workerId: string): string {
  let s = 0;
  for (let i = 0; i < workerId.length; i++) s += workerId.charCodeAt(i);
  return AVATAR_RING[s % AVATAR_RING.length] ?? AVATAR_RING[0];
}

function truncateId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function thisMonthPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function thisMonthLabel(): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());
}

function AdvanceStatusChip({ status }: { status: AdvanceRow["status"] }) {
  const chipBase =
    "inline-flex w-fit max-w-full min-h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums tracking-tight shadow-none";
  if (status === "pending") {
    return (
      <span
        className={cn(
          chipBase,
          "border-amber-500/10 bg-amber-500/[0.03] font-normal text-amber-900/65 dark:border-amber-500/10 dark:bg-amber-500/[0.04] dark:text-amber-100/62"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-amber-500/35" aria-hidden />
        Pending
      </span>
    );
  }
  if (status === "deducted") {
    return (
      <span
        className={cn(
          chipBase,
          "border-emerald-500/10 bg-emerald-500/[0.03] font-medium text-emerald-900/78 dark:border-emerald-500/12 dark:bg-emerald-500/[0.05] dark:text-emerald-100/82"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/40" aria-hidden />
        Deducted
      </span>
    );
  }
  return (
    <span
      className={cn(
        chipBase,
        "border-zinc-200/70 bg-zinc-50/70 font-normal text-zinc-600 dark:border-border/50 dark:bg-muted/20 dark:text-muted-foreground"
      )}
    >
      <span
        className="h-1 w-1 shrink-0 rounded-full bg-zinc-400/50 dark:bg-zinc-500/65"
        aria-hidden
      />
      Cancelled
    </span>
  );
}

export function WorkerAdvancesClient({ workers, projects }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState<AdvanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | AdvanceRow["status"]>("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [editing, setEditing] = React.useState<AdvanceRow | null>(null);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const url = new URL("/api/labor/advances", window.location.origin);
      url.searchParams.set("status", "active");
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Failed to load advances (${res.status})`);
      }
      const data = (await res.json().catch(() => ({}))) as { advances?: unknown };
      const advances = (Array.isArray(data.advances) ? data.advances : []) as Array<
        Record<string, unknown>
      >;
      setRows(
        advances.map((r) => ({
          id: r.id as string,
          workerId: r.workerId as string,
          workerName: (r.workerName as string) ?? "",
          projectId: (r.projectId as string | null) ?? null,
          projectName: (r.projectName as string | null) ?? null,
          amount: Number(r.amount) || 0,
          advanceDate: String(r.advanceDate ?? "").slice(0, 10),
          status: (r.status as AdvanceRow["status"]) ?? "pending",
          notes: (r.notes as string | null) ?? null,
        }))
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load advances.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
      void load();
    }, [router, load]),
    [router, load]
  );

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (workerFilter && r.workerId !== workerFilter) return false;
      if (projectFilter && r.projectId !== projectFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (dateFrom && r.advanceDate < dateFrom) return false;
      if (dateTo && r.advanceDate > dateTo) return false;
      if (query) {
        const haystack = `${r.workerName} ${r.projectName ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, workerFilter, projectFilter, statusFilter, dateFrom, dateTo, query]);

  const summary = React.useMemo(() => {
    const prefix = thisMonthPrefix();
    let totalAdvanced = 0;
    let thisMonth = 0;
    let activeAdvances = 0;
    const workerIds = new Set<string>();
    for (const r of rows) {
      totalAdvanced += r.amount;
      workerIds.add(r.workerId);
      if (r.status === "pending") activeAdvances++;
      if (String(r.advanceDate).startsWith(prefix)) thisMonth += r.amount;
    }
    const n = rows.length;
    const avgAdvance = n > 0 ? totalAdvanced / n : 0;
    return {
      totalAdvanced,
      activeAdvances,
      workers: workerIds.size,
      avgAdvance,
      thisMonth,
    };
  }, [rows]);

  const activeDrawerFilterCount =
    (workerFilter ? 1 : 0) +
    (projectFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const openCreate = () => {
    setEditorMode("create");
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (row: AdvanceRow) => {
    setEditorMode("edit");
    setEditing(row);
    setEditorOpen(true);
  };

  const handleSaved = (saved: AdvanceRow) => {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      if (exists) {
        return prev.map((r) => (r.id === saved.id ? saved : r));
      }
      return [...prev, saved].sort((a, b) => a.advanceDate.localeCompare(b.advanceDate));
    });
  };

  const handleCreateOrUpdate = async (payload: {
    id?: string;
    workerId: string;
    projectId: string | null;
    amount: number;
    advanceDate: string;
    notes: string;
  }) => {
    setBusyId(payload.id ?? "new");
    try {
      if (!payload.id) {
        const res = await fetch("/api/labor/advances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workerId: payload.workerId,
            projectId: payload.projectId,
            amount: payload.amount,
            advanceDate: payload.advanceDate,
            notes: payload.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to create advance.");
        }
        const r = await res.json();
        handleSaved({
          id: r.id,
          workerId: r.workerId,
          workerName: r.workerName,
          projectId: r.projectId,
          projectName: r.projectName,
          amount: r.amount,
          advanceDate: r.advanceDate,
          status: r.status,
          notes: r.notes,
        });
      } else {
        const res = await fetch(`/api/labor/advances/${payload.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: payload.projectId,
            amount: payload.amount,
            advanceDate: payload.advanceDate,
            notes: payload.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? "Failed to update advance.");
        }
        const r = await res.json();
        handleSaved({
          id: r.id,
          workerId: r.workerId,
          workerName: r.workerName,
          projectId: r.projectId,
          projectName: r.projectName,
          amount: r.amount,
          advanceDate: r.advanceDate,
          status: r.status,
          notes: r.notes,
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: AdvanceRow) => {
    if (!window.confirm(`Delete advance for ${row.workerName}?`)) return;
    setBusyId(row.id);
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== row.id));
    try {
      const res = await fetch(`/api/labor/advances/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to delete advance.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete advance.");
      setRows(prev);
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkDeducted = async (row: AdvanceRow) => {
    setBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/advances/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deducted" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Failed to mark as deducted.");
      }
      const r = await res.json();
      handleSaved({
        id: r.id,
        workerId: r.workerId,
        workerName: (r.workerName as string)?.trim() || row.workerName,
        projectId: r.projectId,
        projectName: r.projectName,
        amount: r.amount,
        advanceDate: r.advanceDate,
        status: (r.status as AdvanceRow["status"]) ?? "deducted",
        notes: r.notes,
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to mark as deducted.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDialogSave = async (draft: {
    id?: string;
    workerId: string;
    projectId: string | null;
    amount: string;
    advanceDate: string;
    notes: string;
  }) => {
    const amountNum = Number(draft.amount);
    await handleCreateOrUpdate({
      id: draft.id,
      workerId: draft.workerId,
      projectId: draft.projectId,
      amount: amountNum,
      advanceDate: draft.advanceDate,
      notes: draft.notes,
    });
  };

  const initialLoading = loading && rows.length === 0;
  const refreshing = loading && rows.length > 0;
  const fetchBusy = loading;

  const selectFieldClass =
    "h-10 w-full min-w-0 rounded-md border border-zinc-200/65 bg-white px-3 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-zinc-200 hover:bg-zinc-50/40 focus-visible:border-zinc-300/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400/18 dark:border-border/80 dark:bg-card dark:text-foreground dark:hover:bg-muted/25 dark:focus-visible:ring-zinc-500/25";

  const dateInputClass = cn(
    selectFieldClass,
    "font-mono text-[13px] tabular-nums text-zinc-600 [color-scheme:light] dark:text-zinc-400 dark:[color-scheme:dark]",
    "bg-zinc-50/45 hover:bg-zinc-50/65 dark:bg-muted/15 dark:hover:bg-muted/25"
  );

  const searchInput = (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 min-h-[44px] border-zinc-200/65 bg-white pl-8 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-white focus-visible:border-zinc-300/90 focus-visible:ring-zinc-400/18 md:h-10 md:min-h-10"
        aria-label="Search advances"
      />
    </div>
  );

  const thClass = cn("px-3 py-2 text-left", TYPO.tableHeader);
  const thRight = cn("px-3 py-2 text-right tabular-nums", TYPO.tableHeader);

  const filterControls = (
    <>
      <Select
        value={workerFilter}
        onChange={(e) => setWorkerFilter(e.target.value)}
        className={cn(selectFieldClass, "lg:max-w-[200px]")}
        aria-label="Filter by worker"
      >
        <option value="">All workers</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      <Select
        value={projectFilter}
        onChange={(e) => setProjectFilter(e.target.value)}
        className={cn(selectFieldClass, "lg:max-w-[200px]")}
        aria-label="Filter by project"
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as "" | AdvanceRow["status"])}
        className={cn(selectFieldClass, "lg:max-w-[180px]")}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="deducted">Deducted</option>
        <option value="cancelled">Cancelled</option>
      </Select>
      <Input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className={cn(dateInputClass, "lg:w-[148px]")}
        aria-label="From date"
      />
      <Input
        type="date"
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className={cn(dateInputClass, "lg:w-[148px]")}
        aria-label="To date"
      />
    </>
  );

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 dark:bg-background sm:max-w-[460px] md:max-w-6xl md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Worker Advances"
            subtitle="Track salary advances and deductions for workers."
            actions={
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 shrink-0 gap-1.5 border-zinc-200/90 bg-white shadow-none hover:bg-zinc-50 hover:text-zinc-950 dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted/35",
                  TYPO.button
                )}
                onClick={openCreate}
              >
                <Plus
                  className="h-3.5 w-3.5 text-zinc-600 dark:text-muted-foreground"
                  aria-hidden
                />
                Create Advance
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Advances"
          fab={<MobileFabButton ariaLabel="Create advance" onClick={openCreate} />}
        />

        {!initialLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            <div
              className={cn(
                advKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(advKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total advanced
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.totalAdvanced)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">All time</p>
              </div>
            </div>
            <div
              className={cn(
                advKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(advKpiIcon, "mt-0.5 md:mt-0")}>
                <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Active advances
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.activeAdvances}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Pending</p>
              </div>
            </div>
            <div
              className={cn(
                advKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(advKpiIcon, "mt-0.5 md:mt-0")}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Workers
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.workers}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">
                  With advances
                </p>
              </div>
            </div>
            <div
              className={cn(
                advKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(advKpiIcon, "mt-0.5 md:mt-0")}>
                <ArrowLeftRight
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Avg advance
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.avgAdvance)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Per advance</p>
              </div>
            </div>
            <div
              className={cn(
                advKpiTile,
                "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(advKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  This month
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {fmtUsd(summary.thisMonth)}
                </p>
                <p className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground">
                  {thisMonthLabel()}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(advKpiTile, "flex h-[52px] items-center gap-2 px-3 md:h-[62px]")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          filtersTriggerClassName="h-11 min-h-[44px]"
          searchSlot={searchInput}
        />

        <FilterBar className="hidden min-w-0 md:flex md:flex-col md:gap-2.5 md:pb-0 md:pt-0 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:contents">
            {filterControls}
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row md:max-w-md lg:max-w-[min(100%,280px)]">
            {searchInput}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full shrink-0 gap-1.5 rounded-sm border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-zinc-50/90 lg:ml-auto lg:w-auto dark:border-border dark:bg-transparent dark:hover:bg-muted/30"
            onClick={() => void load()}
            disabled={fetchBusy}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", fetchBusy && "animate-spin")} aria-hidden />
            {fetchBusy ? "Loading…" : "Refresh"}
          </Button>
        </FilterBar>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Worker</p>
            <Select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
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
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | AdvanceRow["status"])}
              className="w-full"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="deducted">Deducted</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">From</p>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={cn(dateInputClass, "w-full")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">To</p>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={cn(dateInputClass, "w-full")}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] w-full rounded-sm"
            disabled={fetchBusy}
            onClick={() => {
              void load();
              setFiltersOpen(false);
            }}
          >
            <SubmitSpinner loading={fetchBusy} className="mr-2" />
            Refresh
          </Button>
          <Button
            type="button"
            className="h-11 min-h-[44px] w-full rounded-sm"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {message ? (
          <p className="border-b border-zinc-200/80 pb-2 text-sm text-muted-foreground dark:border-border/60">
            {message}
          </p>
        ) : null}

        {/* Mobile cards */}
        <div className="md:hidden">
          {initialLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn(advShell, "space-y-3 p-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className={cn(advShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No advances yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create an advance to track salary prepayments and deductions.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No advances match your filters."
            />
          ) : (
            <div
              className={cn("flex flex-col gap-2", refreshing && "pointer-events-none opacity-60")}
              aria-busy={refreshing || undefined}
            >
              {refreshing ? (
                <div className="flex justify-center py-1">
                  <span className="text-xs text-muted-foreground">Updating…</span>
                </div>
              ) : null}
              {filtered.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    advShell,
                    "space-y-3 p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-zinc-200/70 dark:hover:border-border/60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none tabular-nums antialiased",
                          workerAvatarRing,
                          avatarRingClass(row.workerId)
                        )}
                        aria-hidden
                      >
                        {workerInitials(row.workerName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("line-clamp-2 leading-snug", TYPO.primaryName)}>
                          {row.workerName}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 max-w-[11rem] truncate leading-none",
                            TYPO.secondaryId
                          )}
                        >
                          {truncateId(row.workerId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <AdvanceStatusChip status={row.status} />
                      <WorkerAdvanceActionsMenu
                        advance={row}
                        layout="mobile"
                        onEdit={() => openEdit(row)}
                        onMarkDeducted={() => handleMarkDeducted(row)}
                        onDelete={() => handleDelete(row)}
                        disabled={busyId === row.id}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100/70 pb-2 dark:border-border/40">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Amount
                    </span>
                    <span className={cn("max-w-full min-w-0 text-right text-xl", TYPO.amount)}>
                      {fmtUsd(row.amount)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Date
                      </dt>
                      <dd className={cn("truncate pt-0.5", TYPO.date)}>{row.advanceDate}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Project
                      </dt>
                      <dd className="truncate pt-0.5 text-sm text-zinc-700 dark:text-zinc-200">
                        {row.projectName ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Notes
                      </dt>
                      <dd className={cn("line-clamp-2 break-words pt-0.5", TYPO.pageSubtitle)}>
                        {row.notes?.trim() ? row.notes : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div
          className={cn(
            advShell,
            "hidden overflow-hidden md:block",
            refreshing && rows.length > 0 && "pointer-events-none opacity-60"
          )}
          aria-busy={refreshing && rows.length > 0 ? true : undefined}
        >
          {refreshing && rows.length > 0 ? (
            <div className="flex justify-center border-b border-zinc-100/90 py-1 dark:border-border/50">
              <span className="text-xs text-muted-foreground">Updating…</span>
            </div>
          ) : null}
          <div className="overflow-x-auto pb-1 md:pb-3">
            <table className="w-full min-w-[800px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100/90 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className={cn(thClass, "min-w-[200px]")}>Worker</th>
                  <th className={cn(thClass, "min-w-[120px]")}>Project</th>
                  <th className={cn(thRight, "min-w-[100px]")}>Amount</th>
                  <th className={cn(thRight, "whitespace-nowrap")}>Date</th>
                  <th className={cn(thClass, "min-w-[100px]")}>Status</th>
                  <th className={cn(thClass, "min-w-[140px]")}>Notes</th>
                  <th className="w-12 px-2 py-2 text-right align-middle text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {initialLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-100/55 dark:border-border/35">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Skeleton className="ml-auto h-8 w-8 rounded-sm" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                        No advances yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Create an advance to track salary prepayments and deductions.
                      </p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No advances match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        listTableRowStaticClassName,
                        "border-b border-zinc-100/45 dark:border-border/22",
                        "!transition-colors duration-150 ease-out motion-reduce:!transition-none",
                        "hover:!bg-zinc-50/[0.38] dark:hover:!bg-muted/[0.06]",
                        "focus-within:!bg-zinc-50/28 dark:focus-within:!bg-muted/[0.05]"
                      )}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none tabular-nums antialiased",
                              workerAvatarRing,
                              avatarRingClass(row.workerId)
                            )}
                            aria-hidden
                          >
                            {workerInitials(row.workerName)}
                          </span>
                          <div className="min-w-0">
                            <p className={cn("line-clamp-2 leading-snug", TYPO.primaryName)}>
                              {row.workerName}
                            </p>
                            <p
                              className={cn(
                                "max-w-[11rem] truncate leading-none",
                                TYPO.secondaryId
                              )}
                            >
                              {truncateId(row.workerId)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 align-middle text-sm text-zinc-600 dark:text-zinc-300">
                        {row.projectName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-base font-semibold tabular-nums tracking-tight text-zinc-800 dark:text-zinc-100">
                        {fmtUsd(row.amount)}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-right align-middle",
                          TYPO.date
                        )}
                      >
                        {row.advanceDate}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <AdvanceStatusChip status={row.status} />
                      </td>
                      <td
                        className="max-w-[220px] px-3 py-2.5 align-middle text-sm leading-snug text-zinc-600 dark:text-zinc-400"
                        title={row.notes ?? undefined}
                      >
                        <span className="line-clamp-2">{row.notes?.trim() ? row.notes : "—"}</span>
                      </td>
                      <td
                        className="whitespace-nowrap px-2 py-2.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end">
                          <WorkerAdvanceActionsMenu
                            advance={row}
                            layout="desktop"
                            onEdit={() => openEdit(row)}
                            onMarkDeducted={() => handleMarkDeducted(row)}
                            onDelete={() => handleDelete(row)}
                            disabled={busyId === row.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <WorkerAdvanceFormDialog
        open={editorOpen}
        mode={editorMode}
        workers={workers}
        projects={projects}
        initialValues={
          editing
            ? {
                id: editing.id,
                workerId: editing.workerId,
                projectId: editing.projectId,
                amount: editing.amount.toString(),
                advanceDate: editing.advanceDate,
                notes: editing.notes ?? "",
              }
            : undefined
        }
        onClose={() => setEditorOpen(false)}
        onSave={handleDialogSave}
      />
    </div>
  );
}
