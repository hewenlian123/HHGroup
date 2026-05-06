"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  DollarSign,
  FileWarning,
  ListOrdered,
  Paperclip,
  RefreshCw,
  Search,
  Upload,
  Users,
} from "lucide-react";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { FilterBar } from "@/components/filter-bar";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkerReceipt, WorkerReceiptStatus } from "@/lib/worker-receipts-db";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { TYPO } from "@/lib/typography";

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export type ReceiptRow = WorkerReceipt & { projectName: string };

const recShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const recKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const recKpiIcon =
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

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  const one = parts[0] ?? name;
  return one.slice(0, 2).toUpperCase();
}

function avatarRingClass(seed: string): string {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
  return AVATAR_RING[s % AVATAR_RING.length] ?? AVATAR_RING[0];
}

function truncateId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function workerFilterKey(r: ReceiptRow): string {
  return r.workerId ?? `__name:${r.workerName}`;
}

function ReceiptUploadStatusChip({ status }: { status: WorkerReceiptStatus }) {
  const chipBase =
    "inline-flex w-fit max-w-full min-h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums tracking-tight shadow-none";
  if (status === "Pending") {
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
  if (status === "Approved") {
    return (
      <span
        className={cn(
          chipBase,
          "border-emerald-500/10 bg-emerald-500/[0.03] font-medium text-emerald-900/78 dark:border-emerald-500/12 dark:bg-emerald-500/[0.05] dark:text-emerald-100/82"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/40" aria-hidden />
        Approved
      </span>
    );
  }
  if (status === "Rejected") {
    return (
      <span
        className={cn(
          chipBase,
          "border-rose-500/10 bg-rose-500/[0.03] font-normal text-rose-900/70 dark:border-rose-500/12 dark:bg-rose-500/[0.05] dark:text-rose-100/75"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-rose-500/40" aria-hidden />
        Rejected
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
      Paid
    </span>
  );
}

export function ReceiptsClient({
  initialRows,
  dataLoadWarning = null,
}: {
  initialRows: ReceiptRow[];
  dataLoadWarning?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [viewReceiptUrl, setViewReceiptUrl] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const [recRes, projRes] = await Promise.all([
        fetch("/api/worker-receipts", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      const recData = await recRes.json();
      if (!recRes.ok) {
        setMessage(recData.message ?? "Failed to refresh");
        return;
      }
      const projData = projRes.ok ? await projRes.json() : { projects: [] };
      const projectById = new Map<string, string>(
        (projData.projects ?? []).map((p: { id: string; name: string | null }) => [
          p.id,
          p.name ?? "",
        ])
      );
      const list = (recData.receipts ?? []) as WorkerReceipt[];
      setRows(
        list.map((r) => ({
          ...r,
          projectName: r.projectId ? (projectById.get(r.projectId) ?? "") : "",
        }))
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const summary = React.useMemo(() => {
    let pending = 0;
    let approved = 0;
    let totalAmount = 0;
    const workerKeys = new Set<string>();
    let missingReceiptOrProject = 0;
    for (const r of rows) {
      totalAmount += r.amount;
      workerKeys.add(workerFilterKey(r));
      if (r.status === "Pending") pending++;
      if (r.status === "Approved") approved++;
      if (!r.receiptUrl?.trim() || !r.projectId) missingReceiptOrProject++;
    }
    return { pending, approved, totalAmount, workers: workerKeys.size, missingReceiptOrProject };
  }, [rows]);

  const workerOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const k = workerFilterKey(r);
      if (!m.has(k)) m.set(k, r.workerName || "—");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const projectOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const pid = r.projectId ?? "";
      const label = pid ? r.projectName || "—" : "";
      if (!m.has(pid)) m.set(pid, pid ? label : "No project");
    }
    return [...m.entries()].sort((a, b) => (a[1] || "").localeCompare(b[1] || ""));
  }, [rows]);

  const displayRows = React.useMemo(() => {
    let list = rows;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.workerName,
          r.projectName,
          r.expenseType,
          r.vendor,
          r.status,
          String(r.amount),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (workerFilter) {
      list = list.filter((r) => workerFilterKey(r) === workerFilter);
    }
    if (projectFilter) {
      list = list.filter((r) => (r.projectId ?? "") === projectFilter);
    }
    const created = (r: ReceiptRow) => r.createdAt.slice(0, 10);
    if (dateFrom) {
      list = list.filter((r) => created(r) >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((r) => created(r) <= dateTo);
    }
    return list;
  }, [rows, searchQuery, statusFilter, workerFilter, projectFilter, dateFrom, dateTo]);

  const activeDrawerFilterCount =
    (statusFilter ? 1 : 0) +
    (workerFilter ? 1 : 0) +
    (projectFilter ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const approve = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Approve failed");
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...data.receipt, projectName: r.projectName } : r))
      );
      if (data.reimbursementCreated) {
        setSuccessMessage("Approved. Added to Reimbursements.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const resetToPending = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${id}/reset-pending`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reset failed");
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...data.receipt, projectName: r.projectName } : r))
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (id: string) => {
    setRejectId(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectId) return;
    setBusyId(rejectId);
    setMessage(null);
    try {
      const res = await fetch(`/api/worker-receipts/${rejectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Reject failed");
      setRejectOpen(false);
      setRejectId(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this receipt upload?")) return;
    setMessage(null);
    let snapshot: ReceiptRow[] | undefined;
    setRows((r) => {
      snapshot = r;
      return r.filter((x) => x.id !== id);
    });
    setBusyId(id);
    try {
      const res = await fetch(`/api/worker-receipts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Delete failed");
      syncRouterNonBlocking(router);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Delete failed";
      console.error("Receipt delete failed:", e);
      setMessage(errMsg);
      if (snapshot) setRows(snapshot);
    } finally {
      setBusyId(null);
    }
  };

  const rowActions = (r: ReceiptRow) => [
    ...(r.receiptUrl
      ? [
          {
            label: "View receipt",
            onClick: () => setViewReceiptUrl(r.receiptUrl!),
          },
        ]
      : []),
    ...(r.status === "Pending"
      ? [
          {
            label: "Approve",
            onClick: () => approve(r.id),
            disabled: busyId === r.id,
          },
          {
            label: "Reject",
            onClick: () => openReject(r.id),
            disabled: busyId === r.id,
          },
        ]
      : []),
    ...(r.status === "Approved"
      ? [
          {
            label: "Reset to Pending",
            onClick: () => resetToPending(r.id),
            disabled: busyId === r.id,
          },
        ]
      : []),
    {
      label: "Delete",
      onClick: () => handleDelete(r.id),
      destructive: true,
      disabled: busyId === r.id,
    },
  ];

  const isPdfReceipt = viewReceiptUrl != null && viewReceiptUrl.toLowerCase().endsWith(".pdf");

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
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Worker, vendor, project…"
        className="h-11 min-h-[44px] border-zinc-200/65 bg-white pl-8 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-white focus-visible:border-zinc-300/90 focus-visible:ring-zinc-400/18 md:h-10 md:min-h-10"
        aria-label="Search receipt uploads"
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
        {workerOptions.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
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
        {projectOptions.map(([id, label]) => (
          <option key={id === "" ? "__none" : id} value={id}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className={cn(selectFieldClass, "lg:max-w-[180px]")}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="Pending">Pending</option>
        <option value="Approved">Approved</option>
        <option value="Rejected">Rejected</option>
        <option value="Paid">Paid</option>
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

  const fetchBusy = refreshing;

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
            title="Worker Receipt Uploads"
            subtitle="Approve or reject uploaded receipts; approved items become reimbursements."
            actions={
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9 shrink-0 gap-1.5 shadow-none", TYPO.button)}
                asChild
              >
                <Link href="/upload-receipt">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload Receipt
                </Link>
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Receipt Uploads"
          fab={<MobileFabPlus href="/upload-receipt" ariaLabel="Upload receipt" />}
        />

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
          <div
            className={cn(
              recKpiTile,
              "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
            )}
          >
            <span className={cn(recKpiIcon, "mt-0.5 md:mt-0")}>
              <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                Pending uploads
              </p>
              <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                {summary.pending}
              </p>
              <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">
                Awaiting review
              </p>
            </div>
          </div>
          <div
            className={cn(
              recKpiTile,
              "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
            )}
          >
            <span className={cn(recKpiIcon, "mt-0.5 md:mt-0")}>
              <CheckCircle2 className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                Approved
              </p>
              <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                {summary.approved}
              </p>
              <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Processed</p>
            </div>
          </div>
          <div
            className={cn(
              recKpiTile,
              "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
            )}
          >
            <span className={cn(recKpiIcon, "mt-0.5 md:mt-0")}>
              <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                Total amount
              </p>
              <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                {fmtUsd(summary.totalAmount)}
              </p>
              <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">All uploads</p>
            </div>
          </div>
          <div
            className={cn(
              recKpiTile,
              "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
            )}
          >
            <span className={cn(recKpiIcon, "mt-0.5 md:mt-0")}>
              <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                Workers
              </p>
              <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                {summary.workers}
              </p>
              <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Contributors</p>
            </div>
          </div>
          <div
            className={cn(
              recKpiTile,
              "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
            )}
          >
            <span className={cn(recKpiIcon, "mt-0.5 md:mt-0")}>
              <FileWarning className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                Missing info
              </p>
              <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                {summary.missingReceiptOrProject}
              </p>
              <p className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground">
                No receipt or project
              </p>
            </div>
          </div>
        </div>

        {dataLoadWarning ? (
          <p
            className="border-b border-zinc-200/80 pb-2 text-sm text-muted-foreground dark:border-border/60"
            role="status"
          >
            {dataLoadWarning}
          </p>
        ) : null}

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
            onClick={() => void refresh()}
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
              {workerOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
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
              {projectOptions.map(([id, label]) => (
                <option key={id === "" ? "__none" : id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Paid">Paid</option>
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
              void refresh();
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

        {message && (
          <p className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-200/80 pb-2 text-sm text-destructive dark:border-border/60">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </p>
        )}
        {successMessage && (
          <p className="mb-3 border-b border-zinc-200/80 pb-2 text-sm text-muted-foreground dark:border-border/60">
            {successMessage}{" "}
            <Link href="/labor/reimbursements" className="underline hover:no-underline">
              View Reimbursements
            </Link>
          </p>
        )}

        {/* Mobile cards */}
        <div className="md:hidden">
          {rows.length === 0 ? (
            <div className={cn(recShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No uploads in queue
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Worker-submitted receipts will appear here for review.
              </p>
              <Button variant="outline" size="sm" className="mt-4 rounded-sm" asChild>
                <Link href="/upload-receipt">Upload receipt</Link>
              </Button>
            </div>
          ) : displayRows.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No receipts match your filters."
            />
          ) : (
            <div
              className={cn(
                "flex flex-col gap-2",
                refreshing && rows.length > 0 && "pointer-events-none opacity-60"
              )}
              aria-busy={refreshing || undefined}
            >
              {refreshing ? (
                <div className="flex justify-center py-1">
                  <span className="text-xs text-muted-foreground">Updating…</span>
                </div>
              ) : null}
              {displayRows.map((r) => {
                const seed = r.workerId ?? r.id;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      recShell,
                      "space-y-3 p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-zinc-200/70 dark:hover:border-border/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none tabular-nums antialiased",
                            workerAvatarRing,
                            avatarRingClass(seed)
                          )}
                          aria-hidden
                        >
                          {workerInitials(r.workerName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("line-clamp-2 leading-snug", TYPO.primaryName)}>
                            {r.workerName}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 max-w-[11rem] truncate leading-none",
                              TYPO.secondaryId
                            )}
                          >
                            {truncateId(r.workerId ?? r.id)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        <ReceiptUploadStatusChip status={r.status} />
                        <RowActionsMenu
                          ariaLabel={`Actions for receipt ${r.workerName}`}
                          actions={rowActions(r)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100/70 pb-2 dark:border-border/40">
                      <span className={TYPO.sectionLabel}>Amount</span>
                      <span className={cn("max-w-full min-w-0 text-right text-xl", TYPO.amount)}>
                        {fmtUsd(r.amount)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0 sm:col-span-2">
                        <dt className={TYPO.tableHeader}>Vendor</dt>
                        <dd className={cn("truncate pt-0.5", TYPO.primaryName)}>
                          {r.vendor?.trim() ? r.vendor : "—"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={TYPO.tableHeader}>Project</dt>
                        <dd
                          className={cn(
                            "truncate pt-0.5 text-sm",
                            r.projectId
                              ? "text-zinc-600 dark:text-zinc-300"
                              : "text-muted-foreground/80"
                          )}
                        >
                          {r.projectId ? r.projectName || "—" : "No project"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={TYPO.tableHeader}>Expense type</dt>
                        <dd className="pt-0.5">
                          <span className="inline-flex max-w-full rounded-md border border-zinc-200/70 bg-zinc-50/80 px-1.5 py-px text-[10px] font-normal text-zinc-500 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-400">
                            {r.expenseType || "—"}
                          </span>
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className={TYPO.tableHeader}>Date</dt>
                        <dd className={cn("truncate pt-0.5", TYPO.date)}>
                          {r.createdAt.slice(0, 10)}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className={TYPO.tableHeader}>Receipt</dt>
                        <dd className="pt-1">
                          {r.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() => setViewReceiptUrl(r.receiptUrl)}
                              className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 shadow-none transition-colors hover:bg-zinc-50 md:min-h-10 dark:border-border dark:bg-transparent dark:text-zinc-200 dark:hover:bg-muted/30"
                            >
                              <Paperclip
                                className="h-3.5 w-3.5 shrink-0 text-zinc-400"
                                aria-hidden
                              />
                              View
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    {r.status === "Rejected" && r.rejectionReason ? (
                      <p
                        className="line-clamp-2 text-xs text-muted-foreground"
                        title={r.rejectionReason}
                      >
                        {r.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div
          className={cn(
            recShell,
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
            <table className="w-full min-w-[960px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100/90 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className={cn(thClass, "min-w-[200px]")}>Worker</th>
                  <th className={cn(thClass, "min-w-[120px]")}>Project</th>
                  <th className={cn(thClass, "min-w-[100px]")}>Expense type</th>
                  <th className={cn(thClass, "min-w-[120px]")}>Vendor</th>
                  <th className={cn(thRight, "min-w-[100px]")}>Amount</th>
                  <th className={cn(thClass, "min-w-[88px]")}>Receipt</th>
                  <th className={cn(thClass, "min-w-[100px]")}>Status</th>
                  <th className={cn(thRight, "whitespace-nowrap")}>Date</th>
                  <th className="w-12 px-2 py-2 text-right align-middle text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {rows.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                        No uploads in queue
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Worker-submitted receipts will appear here for review.
                      </p>
                      <Button variant="outline" size="sm" className="mt-4 rounded-sm" asChild>
                        <Link href="/upload-receipt">Upload receipt</Link>
                      </Button>
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td
                      colSpan={9}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No receipts match your filters.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r) => {
                    const seed = r.workerId ?? r.id;
                    return (
                      <tr
                        key={r.id}
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
                                avatarRingClass(seed)
                              )}
                              aria-hidden
                            >
                              {workerInitials(r.workerName)}
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                                {r.workerName}
                              </p>
                              <p className="max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-500/75 dark:text-zinc-400/85">
                                {truncateId(r.workerId ?? r.id)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td
                          className={cn(
                            "max-w-[180px] truncate px-3 py-2.5 align-middle text-sm",
                            r.projectId
                              ? "text-zinc-600 dark:text-zinc-300"
                              : "text-muted-foreground/80"
                          )}
                        >
                          {r.projectId ? r.projectName || "—" : "No project"}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span className="inline-flex max-w-[140px] truncate rounded-md border border-zinc-200/70 bg-zinc-50/80 px-1.5 py-px text-[10px] font-normal text-zinc-500 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-400">
                            {r.expenseType || "—"}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 align-middle text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {r.vendor?.trim() ? r.vendor : "—"}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2.5 text-right align-middle text-base",
                            TYPO.amount
                          )}
                        >
                          {fmtUsd(r.amount)}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          {r.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() => setViewReceiptUrl(r.receiptUrl)}
                              className="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-200/80 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-muted/30 dark:hover:text-zinc-100"
                            >
                              <Paperclip
                                className="h-3.5 w-3.5 shrink-0 text-zinc-400"
                                aria-hidden
                              />
                              View
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <ReceiptUploadStatusChip status={r.status} />
                          {r.status === "Rejected" && r.rejectionReason ? (
                            <span
                              className="mt-1 block max-w-[200px] truncate text-[11px] text-muted-foreground"
                              title={r.rejectionReason}
                            >
                              {r.rejectionReason}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2.5 text-right align-middle",
                            TYPO.date
                          )}
                        >
                          {r.createdAt.slice(0, 10)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2.5 text-right align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end">
                            <RowActionsMenu
                              appearance="list"
                              ariaLabel={`Actions for receipt ${r.workerName}`}
                              actions={rowActions(r)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md gap-3 rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Reject receipt</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter className="gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-sm"
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-outline-destructive h-9 rounded-sm"
              onClick={confirmReject}
              disabled={!!busyId}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewReceiptUrl} onOpenChange={(open) => !open && setViewReceiptUrl(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col rounded-sm border-border/60 p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          {viewReceiptUrl && (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-sm bg-muted/30">
              {isPdfReceipt ? (
                <iframe
                  src={viewReceiptUrl}
                  title="Receipt"
                  className="min-h-[70vh] w-full border-0 rounded-sm"
                />
              ) : (
                <img
                  src={viewReceiptUrl}
                  alt="Receipt"
                  className="max-h-[85vh] max-w-full object-contain"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
