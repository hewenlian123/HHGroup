"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  DollarSign,
  ExternalLink,
  FileText,
  FileWarning,
  ListOrdered,
  Paperclip,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";

import { NeoStatus, RowActionsMenu, type RowAction } from "@/components/base";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import { ReceiptInboxSourceNav } from "@/components/financial/receipt-inbox-source-nav";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { PageHeader } from "@/components/page-header";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { formatCurrency } from "@/lib/formatters";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { adjacentReceiptId } from "@/lib/receipt-review-queue";
import type { WorkerReceipt, WorkerReceiptStatus } from "@/lib/worker-receipts-db";
import { cn } from "@/lib/utils";

export type ReceiptRow = WorkerReceipt & { projectName: string };

const AVATAR_TONES = [
  "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700/55 dark:text-zinc-100",
  "bg-zinc-300/65 text-zinc-900 dark:bg-zinc-600/50 dark:text-zinc-100",
  "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-100",
  "bg-zinc-200/65 text-zinc-800 dark:bg-zinc-700/50 dark:text-zinc-100",
];

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return (parts[0] ?? name).slice(0, 2).toUpperCase();
}

function avatarTone(seed: string): string {
  let value = 0;
  for (let index = 0; index < seed.length; index++) value += seed.charCodeAt(index);
  return AVATAR_TONES[value % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

function workerFilterKey(receipt: ReceiptRow): string {
  return receipt.workerId ?? `__name:${receipt.workerName}`;
}

function ReceiptStatus({ status }: { status: WorkerReceiptStatus }) {
  if (status === "Pending") return <NeoStatus label="Pending" variant="warning" />;
  if (status === "Approved") return <NeoStatus label="Approved" variant="success" />;
  if (status === "Rejected") return <NeoStatus label="Rejected" variant="danger" />;
  return <NeoStatus label="Paid" variant="success" />;
}

function ReceiptEvidence({
  receipt,
  onOpen,
  prominent = false,
}: {
  receipt: ReceiptRow;
  onOpen: () => void;
  prominent?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);
  const receiptUrl = receipt.receiptUrl?.trim() || null;
  const isPdf = receiptUrl ? receiptUrl.split("?")[0]?.toLowerCase().endsWith(".pdf") : false;

  React.useEffect(() => {
    setFailed(false);
    setRetryKey(0);
  }, [receipt.id, receiptUrl]);

  if (!receiptUrl) {
    return (
      <div
        data-worker-receipt-evidence
        className={cn(
          "flex min-h-[170px] flex-col items-center justify-center rounded-lg border px-5 py-8 text-center",
          prominent && "h-full min-h-[360px]"
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--eo-warning-soft)] text-[var(--eo-warning)]">
          <FileWarning className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-[var(--eo-text-primary)]">
          Missing receipt evidence
        </p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--eo-text-secondary)]">
          This worker submission does not include a receipt attachment.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        data-worker-receipt-evidence
        className={cn(
          "flex min-h-[170px] flex-col items-center justify-center rounded-lg border px-5 py-8 text-center",
          prominent && "h-full min-h-[360px]"
        )}
      >
        <CircleAlert className="h-6 w-6 text-[var(--eo-danger)]" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-[var(--eo-text-primary)]">
          Receipt preview unavailable
        </p>
        <p className="mt-1 text-xs text-[var(--eo-text-secondary)]">
          Retry the preview or open the original evidence.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setFailed(false);
              setRetryKey((value) => value + 1);
            }}
          >
            Retry
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpen}>
            Open original
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-worker-receipt-evidence
      className={cn(
        "group relative flex min-h-[190px] items-center justify-center overflow-hidden rounded-lg border bg-white",
        prominent && "h-full min-h-[360px]"
      )}
    >
      {isPdf ? (
        <iframe
          key={`${receipt.id}-${retryKey}`}
          src={receiptUrl}
          title="Receipt evidence"
          className={cn(
            "w-full border-0 bg-white",
            prominent ? "h-full min-h-[420px]" : "h-[240px]"
          )}
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          key={`${receipt.id}-${retryKey}`}
          src={receiptUrl}
          alt={`Receipt evidence for ${receipt.workerName}`}
          width={1024}
          height={768}
          unoptimized
          className={cn("w-full object-contain", prominent ? "h-full max-h-full" : "max-h-[260px]")}
          onError={() => setFailed(true)}
        />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute bottom-3 right-3 h-9 bg-white/95 text-zinc-800 opacity-100 shadow-sm transition-opacity duration-120 hover:bg-white motion-reduce:transition-none lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        onClick={onOpen}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open
      </Button>
    </div>
  );
}

function ReceiptDetail({
  receipt,
  busy,
  queuePosition,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onApprove,
  onReject,
  onOpenEvidence,
  overflowActions,
  onClose,
  showEvidence = true,
}: {
  receipt: ReceiptRow;
  busy: boolean;
  queuePosition: string | null;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onApprove: (advanceAfterSuccess: boolean) => void;
  onReject: (advanceAfterSuccess: boolean) => void;
  onOpenEvidence: () => void;
  overflowActions: RowAction[];
  onClose?: () => void;
  showEvidence?: boolean;
}) {
  const missingReceipt = !receipt.receiptUrl?.trim();
  const missingProject = !receipt.projectId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--eo-border)] px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
            Worker receipt
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ReceiptStatus status={receipt.status} />
            <span className={cn("text-[11px]", LEDGER_DATE_CLASS)}>
              Submitted {formatLedgerDate(receipt.createdAt, "compact")}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RowActionsMenu
            appearance="list"
            ariaLabel={`More actions for ${receipt.workerName}`}
            actions={overflowActions}
          />
          {onClose ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11"
              onClick={onClose}
              aria-label="Close detail"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div data-worker-receipts-detail-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {showEvidence ? <ReceiptEvidence receipt={receipt} onOpen={onOpenEvidence} /> : null}

        <div className={showEvidence ? "mt-5" : undefined}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
            Amount
          </p>
          <p className="worker-receipt-financial-nums mt-1 text-[30px] font-semibold leading-none text-[var(--eo-text-strong)]">
            {formatCurrency(receipt.amount)}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
            Worker
          </p>
          <h2 className="mt-1 text-[18px] font-semibold leading-snug text-[var(--eo-text-strong)]">
            {receipt.workerName}
          </h2>
          <p className="mt-1 text-sm font-medium text-[var(--eo-text-secondary)]">
            {receipt.projectId ? receipt.projectName || "—" : "No project assigned"}
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-[var(--eo-border)] pt-4 text-sm">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
              Vendor
            </dt>
            <dd className="mt-1 truncate font-medium text-[var(--eo-text-primary)]">
              {receipt.vendor?.trim() || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
              Classification
            </dt>
            <dd className="mt-1 truncate text-[var(--eo-text-primary)]">
              {receipt.expenseType || "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
              Receipt date
            </dt>
            <dd className={cn("mt-1", LEDGER_DATE_CLASS)}>
              {receipt.receiptDate ? formatLedgerDate(receipt.receiptDate) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
              Status
            </dt>
            <dd className="mt-1 text-[var(--eo-text-primary)]">{receipt.status}</dd>
          </div>
        </dl>

        {missingReceipt || missingProject ? (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Missing information">
            {missingReceipt ? (
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-2 text-xs font-medium text-[var(--eo-warning)]">
                <Paperclip className="h-3.5 w-3.5" aria-hidden /> Missing receipt
              </span>
            ) : null}
            {missingProject ? (
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-2 text-xs font-medium text-[var(--eo-warning)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Missing project
              </span>
            ) : null}
          </div>
        ) : null}

        {receipt.status === "Rejected" && receipt.rejectionReason ? (
          <div className="mt-5 rounded-md border border-[var(--eo-danger-border)] bg-[var(--eo-danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--eo-danger)]">
            <p className="font-semibold">Rejection reason</p>
            <p className="mt-0.5">{receipt.rejectionReason}</p>
          </div>
        ) : null}

        {receipt.description || receipt.notes ? (
          <div className="mt-5 space-y-4 border-t border-[var(--eo-border)] pt-4">
            {receipt.description ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
                  Description
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--eo-text-secondary)]">
                  {receipt.description}
                </p>
              </div>
            ) : null}
            {receipt.notes ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
                  Notes
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--eo-text-secondary)]">
                  {receipt.notes}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--eo-border)] bg-[var(--eo-depth-l2)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {queuePosition ? (
            <span className="mr-1 text-[11px] text-[var(--eo-text-tertiary)]">{queuePosition}</span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-11 px-2.5"
            onClick={onPrevious}
            disabled={!canPrevious || busy}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-11 px-2.5"
            onClick={onNext}
            disabled={!canNext || busy}
          >
            Next
          </Button>
          {receipt.reimbursementId ? (
            <Link
              href="/labor/reimbursements"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--eo-text-primary)] hover:bg-[var(--eo-depth-l3-hover)]"
            >
              View reimbursement
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className="text-[11px] text-[var(--eo-text-tertiary)]">
              {receipt.status === "Pending" ? "Awaiting review" : "Review complete"}
            </span>
          )}
        </div>
        {receipt.status === "Pending" ? (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="worker-receipt-reject h-10"
              onClick={() => onReject(canNext)}
              disabled={busy}
              aria-label="Reject receipt"
            >
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              className="worker-receipt-approve h-10 min-w-[108px]"
              onClick={() => onApprove(canNext)}
              disabled={busy}
              aria-label={canNext ? "Approve and review next receipt" : "Approve receipt"}
            >
              <SubmitSpinner loading={busy} className="mr-1" />
              {canNext ? "Approve & Next" : "Approve"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReceiptsClient({
  initialRows,
  dataLoadWarning = null,
  initialFilters = {},
  initialSelectedId = null,
}: {
  initialRows: ReceiptRow[];
  dataLoadWarning?: string | null;
  initialSelectedId?: string | null;
  initialFilters?: {
    workerId?: string;
    projectId?: string;
    status?: WorkerReceiptStatus | "";
    dateFrom?: string;
    dateTo?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [statusFilter, setStatusFilter] = React.useState(initialFilters.status ?? "");
  const [workerFilter, setWorkerFilter] = React.useState(initialFilters.workerId ?? "");
  const [projectFilter, setProjectFilter] = React.useState(initialFilters.projectId ?? "");
  const [dateFrom, setDateFrom] = React.useState(initialFilters.dateFrom ?? "");
  const [dateTo, setDateTo] = React.useState(initialFilters.dateTo ?? "");
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(() =>
    initialSelectedId && initialRows.some((receipt) => receipt.id === initialSelectedId)
      ? initialSelectedId
      : null
  );
  const [mobileDetailOpen, setMobileDetailOpen] = React.useState(false);
  const lastSelectionTrigger = React.useRef<HTMLElement | null>(null);
  const routeSelectedId = searchParams.get("ops_record")?.trim() || null;

  React.useEffect(() => setRows(initialRows), [initialRows]);

  React.useEffect(() => {
    setSelectedId((current) => (current === routeSelectedId ? current : routeSelectedId));
    if (routeSelectedId && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileDetailOpen(true);
    }
  }, [routeSelectedId]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const [receiptResponse, projectResponse] = await Promise.all([
        fetch("/api/worker-receipts", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      const receiptData = await receiptResponse.json();
      if (!receiptResponse.ok) throw new Error(receiptData.message ?? "Failed to refresh");
      const projectData = projectResponse.ok ? await projectResponse.json() : { projects: [] };
      const projectById = new Map<string, string>(
        (projectData.projects ?? []).map((project: { id: string; name: string | null }) => [
          project.id,
          project.name ?? "",
        ])
      );
      const list = (receiptData.receipts ?? []) as WorkerReceipt[];
      setRows(
        list.map((receipt) => ({
          ...receipt,
          projectName: receipt.projectId ? (projectById.get(receipt.projectId) ?? "") : "",
        }))
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useOnAppSync(
    React.useCallback(() => void refresh(), [refresh]),
    [refresh]
  );

  const summary = React.useMemo(() => {
    let pending = 0;
    let approved = 0;
    let totalAmount = 0;
    let missing = 0;
    const workers = new Set<string>();
    for (const receipt of rows) {
      totalAmount += receipt.amount;
      workers.add(workerFilterKey(receipt));
      if (receipt.status === "Pending") pending += 1;
      if (receipt.status === "Approved") approved += 1;
      if (!receipt.receiptUrl?.trim() || !receipt.projectId) missing += 1;
    }
    return { pending, approved, totalAmount, workers: workers.size, missing };
  }, [rows]);

  const workerOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const receipt of rows) {
      const key = workerFilterKey(receipt);
      if (!options.has(key)) options.set(key, receipt.workerName || "—");
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const projectOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const receipt of rows) {
      if (receipt.projectId && !options.has(receipt.projectId)) {
        options.set(receipt.projectId, receipt.projectName || "—");
      }
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const displayRows = React.useMemo(() => {
    let next = rows;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      next = next.filter((receipt) =>
        [
          receipt.workerName,
          receipt.projectName,
          receipt.expenseType,
          receipt.vendor,
          receipt.status,
          String(receipt.amount),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }
    if (statusFilter) next = next.filter((receipt) => receipt.status === statusFilter);
    if (workerFilter) next = next.filter((receipt) => workerFilterKey(receipt) === workerFilter);
    if (projectFilter) next = next.filter((receipt) => (receipt.projectId ?? "") === projectFilter);
    if (dateFrom) next = next.filter((receipt) => receipt.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) next = next.filter((receipt) => receipt.createdAt.slice(0, 10) <= dateTo);
    return next;
  }, [rows, searchQuery, statusFilter, workerFilter, projectFilter, dateFrom, dateTo]);

  const selectedReceipt = React.useMemo(
    () => rows.find((receipt) => receipt.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const displayReceiptIds = React.useMemo(
    () => displayRows.map((receipt) => receipt.id),
    [displayRows]
  );
  const selectedQueueIndex = selectedId ? displayReceiptIds.indexOf(selectedId) : -1;
  const previousReceiptId = selectedId
    ? adjacentReceiptId(displayReceiptIds, selectedId, "previous")
    : null;
  const nextReceiptId = selectedId
    ? adjacentReceiptId(displayReceiptIds, selectedId, "next")
    : null;

  React.useEffect(() => {
    if (selectedId && !rows.some((receipt) => receipt.id === selectedId)) {
      setSelectedId(null);
      setMobileDetailOpen(false);
    }
  }, [rows, selectedId]);

  const activeFilterCount =
    Number(Boolean(statusFilter)) +
    Number(Boolean(workerFilter)) +
    Number(Boolean(projectFilter)) +
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo));

  const clearFilters = () => {
    setStatusFilter("");
    setWorkerFilter("");
    setProjectFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const syncSelectionUrl = React.useCallback(
    (id: string | null, history: "push" | "replace") => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("ops_record", id);
      else params.delete("ops_record");
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (history === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectReceipt = (
    id: string,
    trigger?: HTMLElement,
    history: "push" | "replace" = "push"
  ) => {
    setSelectedId(id);
    syncSelectionUrl(id, history);
    if (trigger) lastSelectionTrigger.current = trigger;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileDetailOpen(true);
    }
  };

  const closeMobileDetail = () => {
    setMobileDetailOpen(false);
    setSelectedId(null);
    syncSelectionUrl(null, "replace");
    window.requestAnimationFrame(() => lastSelectionTrigger.current?.focus());
  };

  const approve = async (id: string, advanceAfterSuccess = false) => {
    const stableNextId = advanceAfterSuccess
      ? adjacentReceiptId(displayReceiptIds, id, "next")
      : null;
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/worker-receipts/${id}/approve`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Approve failed");
      setRows((current) =>
        current.map((receipt) =>
          receipt.id === id ? { ...data.receipt, projectName: receipt.projectName } : receipt
        )
      );
      setSuccessMessage(
        data.reimbursementCreated ? "Approved. Added to Reimbursements." : "Receipt approved."
      );
      if (stableNextId) selectReceipt(stableNextId, undefined, "replace");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const resetToPending = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/worker-receipts/${id}/reset-pending`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Reset failed");
      setRows((current) =>
        current.map((receipt) =>
          receipt.id === id ? { ...data.receipt, projectName: receipt.projectName } : receipt
        )
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setBusyId(null);
    }
  };

  const [rejectAdvanceAfterSuccess, setRejectAdvanceAfterSuccess] = React.useState(false);

  const openReject = (id: string, advanceAfterSuccess = false) => {
    setMessage(null);
    setRejectId(id);
    setRejectReason("");
    setRejectAdvanceAfterSuccess(advanceAfterSuccess);
    setRejectOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectId) return;
    const stableNextId = rejectAdvanceAfterSuccess
      ? adjacentReceiptId(displayReceiptIds, rejectId, "next")
      : null;
    setBusyId(rejectId);
    setMessage(null);
    try {
      const response = await fetch(`/api/worker-receipts/${rejectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Reject failed");
      setRows((current) =>
        current.map((receipt) =>
          receipt.id === rejectId ? { ...data.receipt, projectName: receipt.projectName } : receipt
        )
      );
      setRejectOpen(false);
      setRejectId(null);
      setRejectAdvanceAfterSuccess(false);
      setSuccessMessage("Receipt rejected.");
      if (stableNextId) selectReceipt(stableNextId, undefined, "replace");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this receipt upload?")) return;
    setMessage(null);
    let snapshot: ReceiptRow[] | undefined;
    setRows((current) => {
      snapshot = current;
      return current.filter((receipt) => receipt.id !== id);
    });
    setBusyId(id);
    try {
      const response = await fetch(`/api/worker-receipts/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "Delete failed");
      syncRouterNonBlocking(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
      if (snapshot) setRows(snapshot);
    } finally {
      setBusyId(null);
    }
  };

  const rowActions = (receipt: ReceiptRow): RowAction[] => [
    ...(receipt.receiptUrl
      ? [{ label: "View receipt", onClick: () => selectReceipt(receipt.id) }]
      : []),
    ...(receipt.status === "Pending"
      ? [
          {
            label: "Approve",
            onClick: () => void approve(receipt.id),
            disabled: busyId === receipt.id,
          },
          {
            label: "Reject",
            onClick: () => openReject(receipt.id),
            disabled: busyId === receipt.id,
          },
        ]
      : []),
    ...(receipt.status === "Approved"
      ? [
          {
            label: "Reset to Pending",
            onClick: () => void resetToPending(receipt.id),
            disabled: busyId === receipt.id,
          },
        ]
      : []),
    {
      label: "Delete",
      onClick: () => void handleDelete(receipt.id),
      destructive: true,
      disabled: busyId === receipt.id,
    },
  ];

  const controlClass =
    "h-10 w-full min-w-0 rounded-md border border-[var(--eo-border)] bg-[var(--eo-depth-l2)] px-3 text-sm text-[var(--eo-text-primary)] shadow-none outline-none hover:bg-[var(--eo-depth-l3-hover)] focus-visible:border-[var(--eo-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--eo-focus-ring)]";

  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--eo-text-tertiary)]" />
      <Input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Worker, project, vendor…"
        aria-label="Search worker receipts"
        className={cn(controlClass, "h-11 min-h-11 pl-9 md:h-10 md:min-h-10")}
      />
    </div>
  );

  const workerSelect = (
    <Select
      value={workerFilter}
      onChange={(event) => setWorkerFilter(event.target.value)}
      aria-label="Filter by worker"
      className={controlClass}
    >
      <option value="">All workers</option>
      {workerOptions.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </Select>
  );
  const projectSelect = (
    <Select
      value={projectFilter}
      onChange={(event) => setProjectFilter(event.target.value)}
      aria-label="Filter by project"
      className={controlClass}
    >
      <option value="">All projects</option>
      {projectOptions.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </Select>
  );
  const statusSelect = (
    <Select
      value={statusFilter}
      onChange={(event) => setStatusFilter(event.target.value as WorkerReceiptStatus | "")}
      aria-label="Filter by status"
      className={controlClass}
    >
      <option value="">All statuses</option>
      <option value="Pending">Pending</option>
      <option value="Approved">Approved</option>
      <option value="Rejected">Rejected</option>
      <option value="Paid">Paid</option>
    </Select>
  );

  const kpis = [
    { label: "Pending", value: summary.pending, icon: ListOrdered },
    { label: "Approved", value: summary.approved, icon: CheckCircle2 },
    { label: "Total amount", value: formatCurrency(summary.totalAmount), icon: DollarSign },
    { label: "Workers", value: summary.workers, icon: Users },
    { label: "Missing info", value: summary.missing, icon: FileWarning },
  ];

  return (
    <div
      data-worker-receipts-workspace
      data-expenses-list-page="worker-receipts"
      className="expenses-ui worker-receipts-ui min-w-0 overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-2 md:px-6 md:py-4",
          mobileListPagePaddingClass
        )}
      >
        <ExpenseOperationsWorkspaceNav />
        <ReceiptInboxSourceNav />
        <div className="hidden md:block">
          <PageHeader
            className="gap-2 pb-1 lg:items-end [&_h1]:!text-[24px] [&_h1]:!font-semibold [&_h1]:!tracking-normal [&_h1]:!text-[var(--eo-text-strong)] [&_p]:!mt-1 [&_p]:!text-[14px] [&_p]:!leading-snug [&_p]:!text-[var(--eo-text-secondary)]"
            title="Worker Submitted"
            subtitle="Review worker-submitted evidence with the existing approval and reimbursement workflow."
            actions={
              <Button size="sm" asChild className="h-9">
                <Link href="/upload-receipt">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload Worker Receipt
                </Link>
              </Button>
            }
          />
        </div>
        <MobileListHeader
          title="Worker Submitted"
          fab={<MobileFabPlus href="/upload-receipt" ariaLabel="Upload Worker Receipt" />}
        />

        <dl
          data-worker-receipts-kpis
          className="grid grid-cols-2 overflow-hidden rounded-lg border lg:grid-cols-5"
        >
          {kpis.map(({ label, value, icon: Icon }, index) => (
            <div
              key={label}
              className={cn(
                "flex min-h-[62px] min-w-0 items-center gap-2.5 px-3 py-2.5",
                index === 4 && "col-span-2 lg:col-span-1"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--eo-text-tertiary)]" aria-hidden />
              <div className="min-w-0">
                <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--eo-text-tertiary)]">
                  {label}
                </dt>
                <dd className="worker-receipt-financial-nums mt-1 truncate text-[18px] font-semibold leading-none text-[var(--eo-text-strong)]">
                  {value}
                </dd>
              </div>
            </div>
          ))}
        </dl>

        {dataLoadWarning ? (
          <div
            className="rounded-md border border-[var(--eo-warning-border)] bg-[var(--eo-warning-soft)] px-3 py-2 text-sm text-[var(--eo-warning)]"
            role="status"
          >
            {dataLoadWarning}
          </div>
        ) : null}

        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeFilterCount}
          filtersTriggerClassName="h-11 min-h-11"
          searchSlot={searchInput}
        />

        <div className="hidden min-w-0 grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(135px,0.55fr))_auto] items-center gap-2 rounded-lg border border-[var(--eo-border)] bg-[var(--eo-depth-l2)] p-2 lg:grid">
          {searchInput}
          {workerSelect}
          {projectSelect}
          {statusSelect}
          <div className="flex items-center gap-1">
            {activeFilterCount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10"
                onClick={clearFilters}
              >
                Clear {activeFilterCount}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh worker receipts"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            </Button>
          </div>
        </div>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--eo-text-secondary)]">Worker</p>
              {workerSelect}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--eo-text-secondary)]">Project</p>
              {projectSelect}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[var(--eo-text-secondary)]">Status</p>
              {statusSelect}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="worker-receipts-from"
                className="text-xs font-medium text-[var(--eo-text-secondary)]"
              >
                From
              </label>
              <Input
                id="worker-receipts-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className={cn(controlClass, "worker-receipt-financial-nums")}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="worker-receipts-to"
                className="text-xs font-medium text-[var(--eo-text-secondary)]"
              >
                To
              </label>
              <Input
                id="worker-receipts-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className={cn(controlClass, "worker-receipt-financial-nums")}
              />
            </div>
          </div>
          {activeFilterCount ? (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
          <Button type="button" className="h-11 w-full" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {message ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--eo-danger-border)] bg-[var(--eo-danger-soft)] px-3 py-2 text-sm text-[var(--eo-danger)]"
            role="alert"
          >
            <span>{message}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()}>
                Retry
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMessage(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
        {successMessage ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--eo-success-border)] bg-[var(--eo-success-soft)] px-3 py-2 text-sm text-[var(--eo-success)]"
            role="status"
          >
            <span>{successMessage}</span>
            <Link href="/labor/reimbursements" className="font-medium underline underline-offset-2">
              View Reimbursements
            </Link>
          </div>
        ) : null}

        <div data-worker-receipts-master-detail className="grid min-w-0 gap-3 lg:min-h-[520px]">
          <section
            data-worker-receipts-queue
            aria-label="Worker receipt queue"
            className="min-w-0 overflow-hidden rounded-lg border"
          >
            <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-[var(--eo-border)] bg-[var(--eo-depth-structural)] px-3.5 py-2.5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--eo-text-primary)]">
                  Receipt queue
                </h2>
                <p className="mt-0.5 text-[11px] text-[var(--eo-text-tertiary)]">
                  {displayRows.length} of {rows.length} uploads
                </p>
              </div>
              <span className="text-[11px] text-[var(--eo-text-tertiary)]">Select to review</span>
            </div>
            <div
              data-worker-receipts-scroll
              className={cn(
                "max-h-[calc(100dvh-19rem)] min-h-[280px] overflow-y-auto",
                refreshing && rows.length > 0 && "pointer-events-none opacity-60"
              )}
              aria-busy={refreshing || undefined}
            >
              {rows.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center px-5 py-10 text-center">
                  <FileText className="h-8 w-8 text-[var(--eo-text-tertiary)]" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-[var(--eo-text-primary)]">
                    No uploads in queue
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-[var(--eo-text-secondary)]">
                    Worker-submitted receipts will appear here for review.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href="/upload-receipt">Upload Worker Receipt</Link>
                  </Button>
                </div>
              ) : displayRows.length === 0 ? (
                <MobileEmptyState
                  icon={<Search className="h-7 w-7" aria-hidden />}
                  message="No receipts match your filters."
                />
              ) : (
                displayRows.map((receipt) => {
                  const selected = receipt.id === selectedId;
                  const missingReceipt = !receipt.receiptUrl?.trim();
                  const missingProject = !receipt.projectId;
                  return (
                    <div
                      key={receipt.id}
                      data-worker-receipt-id={receipt.id}
                      aria-selected={selected ? "true" : "false"}
                      className="group relative flex min-w-0 items-stretch"
                    >
                      <button
                        type="button"
                        data-worker-receipt-control
                        className="flex min-h-[78px] min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left outline-none"
                        onClick={(event) => selectReceipt(receipt.id, event.currentTarget)}
                        aria-label={`Review receipt from ${receipt.workerName}`}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-inset ring-zinc-950/[0.055] dark:ring-white/[0.08]",
                            avatarTone(receipt.workerId ?? receipt.id)
                          )}
                          aria-hidden
                        >
                          {workerInitials(receipt.workerName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-start justify-between gap-3">
                            <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--eo-text-primary)]">
                              {receipt.workerName}
                            </span>
                            <span className="worker-receipt-financial-nums shrink-0 text-[15px] font-semibold text-[var(--eo-text-strong)]">
                              {formatCurrency(receipt.amount)}
                            </span>
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--eo-text-secondary)]">
                            <span className="truncate font-medium">
                              {receipt.projectId ? receipt.projectName || "—" : "No project"}
                            </span>
                            <span aria-hidden>·</span>
                            <span className="truncate">{receipt.expenseType || "—"}</span>
                            <span aria-hidden>·</span>
                            <span className="shrink-0">
                              {formatLedgerDate(receipt.createdAt, "compact")}
                            </span>
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-2">
                            <ReceiptStatus status={receipt.status} />
                            {missingReceipt ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--eo-warning)]">
                                <Paperclip className="h-3 w-3" aria-hidden /> Missing receipt
                              </span>
                            ) : null}
                            {missingProject && !missingReceipt ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--eo-warning)]">
                                <AlertTriangle className="h-3 w-3" aria-hidden /> Missing project
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-start px-1.5 pt-2.5">
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for receipt ${receipt.workerName}`}
                          actions={rowActions(receipt)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <aside
            data-worker-receipts-evidence-stage
            aria-label="Worker receipt preview"
            className="hidden min-h-0 min-w-0 overflow-hidden rounded-lg border lg:flex lg:flex-col"
          >
            <div className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 border-b border-[var(--eo-border)] bg-[var(--eo-depth-structural)] px-3.5 py-2.5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--eo-text-primary)]">
                  Receipt preview
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-[var(--eo-text-tertiary)]">
                  {selectedReceipt
                    ? selectedReceipt.receiptUrl?.trim()
                      ? "Submitted evidence"
                      : "Evidence missing"
                    : "Select a receipt to inspect"}
                </p>
              </div>
              {selectedReceipt?.receiptUrl?.trim() ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 shrink-0 px-2.5"
                  onClick={() => setViewReceiptUrl(selectedReceipt.receiptUrl)}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Full view
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 p-3">
              {selectedReceipt ? (
                <ReceiptEvidence
                  receipt={selectedReceipt}
                  onOpen={() => setViewReceiptUrl(selectedReceipt.receiptUrl)}
                  prominent
                />
              ) : (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center text-[var(--eo-text-secondary)]">
                  <FileText className="h-6 w-6 text-[var(--eo-text-tertiary)]" aria-hidden />
                  <p className="mt-3 text-sm font-medium">Evidence opens here</p>
                </div>
              )}
            </div>
          </aside>

          <aside
            data-worker-receipts-detail
            aria-label="Worker receipt detail"
            className="hidden min-h-0 overflow-hidden rounded-lg border lg:flex"
          >
            {selectedReceipt ? (
              <ReceiptDetail
                receipt={selectedReceipt}
                busy={busyId === selectedReceipt.id}
                queuePosition={
                  selectedQueueIndex >= 0
                    ? `${selectedQueueIndex + 1} of ${displayReceiptIds.length}`
                    : null
                }
                canPrevious={Boolean(previousReceiptId)}
                canNext={Boolean(nextReceiptId)}
                onPrevious={() => {
                  if (previousReceiptId) selectReceipt(previousReceiptId);
                }}
                onNext={() => {
                  if (nextReceiptId) selectReceipt(nextReceiptId);
                }}
                onApprove={(advance) => void approve(selectedReceipt.id, advance)}
                onReject={(advance) => openReject(selectedReceipt.id, advance)}
                onOpenEvidence={() => setViewReceiptUrl(selectedReceipt.receiptUrl)}
                overflowActions={rowActions(selectedReceipt)}
                showEvidence={false}
              />
            ) : (
              <div className="flex min-h-[520px] w-full flex-col items-center justify-center px-8 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--eo-depth-l3-hover)] text-[var(--eo-text-tertiary)]">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-sm font-semibold text-[var(--eo-text-primary)]">
                  Select a worker receipt
                </h2>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--eo-text-secondary)]">
                  Review evidence, amount, project context, and available canonical actions without
                  leaving the queue.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      <Dialog
        open={mobileDetailOpen && Boolean(selectedReceipt)}
        onOpenChange={(open) => {
          if (!open) closeMobileDetail();
        }}
      >
        <DialogContent
          className="expenses-ui-dialog !flex !max-w-none !flex-col !gap-0 !p-0"
          data-expense-component-surface="worker-receipt-detail"
          aria-label="Worker receipt detail"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Worker receipt detail</DialogTitle>
            <DialogDescription>Review worker receipt evidence and status.</DialogDescription>
          </DialogHeader>
          {selectedReceipt ? (
            <ReceiptDetail
              receipt={selectedReceipt}
              busy={busyId === selectedReceipt.id}
              queuePosition={
                selectedQueueIndex >= 0
                  ? `${selectedQueueIndex + 1} of ${displayReceiptIds.length}`
                  : null
              }
              canPrevious={Boolean(previousReceiptId)}
              canNext={Boolean(nextReceiptId)}
              onPrevious={() => {
                if (previousReceiptId) selectReceipt(previousReceiptId);
              }}
              onNext={() => {
                if (nextReceiptId) selectReceipt(nextReceiptId);
              }}
              onApprove={(advance) => void approve(selectedReceipt.id, advance)}
              onReject={(advance) => openReject(selectedReceipt.id, advance)}
              onOpenEvidence={() => setViewReceiptUrl(selectedReceipt.receiptUrl)}
              overflowActions={rowActions(selectedReceipt)}
              onClose={closeMobileDetail}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent
          className="expenses-ui-dialog max-w-md !gap-3 !rounded-xl !p-5"
          data-expense-component-surface="worker-receipt-detail"
        >
          <DialogHeader>
            <DialogTitle className="text-base">Reject receipt</DialogTitle>
            <DialogDescription>
              The receipt remains recorded with its canonical rejected status.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="worker-receipt-rejection-reason"
              className="text-xs font-medium text-[var(--eo-text-secondary)]"
            >
              Reason (optional)
            </label>
            <Input
              id="worker-receipt-rejection-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Reason for rejection"
              className="h-10"
            />
          </div>
          {message ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--eo-danger-border)] bg-[var(--eo-danger-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--eo-danger)]"
            >
              {message}
            </div>
          ) : null}
          <DialogFooter className="border-[var(--eo-border)] bg-transparent">
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="worker-receipt-reject"
              onClick={() => void confirmReject()}
              disabled={Boolean(busyId)}
            >
              <SubmitSpinner loading={Boolean(busyId)} className="mr-1" />
              {rejectAdvanceAfterSuccess ? "Reject & Next" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(viewReceiptUrl)}
        onOpenChange={(open) => !open && setViewReceiptUrl(null)}
      >
        <DialogContent
          className="expenses-ui-dialog !flex !max-h-[calc(100dvh-1rem)] !max-w-5xl !flex-col !gap-2 !rounded-xl !p-2"
          data-expense-component-surface="worker-receipt-detail"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt evidence</DialogTitle>
            <DialogDescription>Full-size worker receipt evidence.</DialogDescription>
          </DialogHeader>
          {viewReceiptUrl ? (
            viewReceiptUrl.split("?")[0]?.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={viewReceiptUrl}
                title="Receipt evidence"
                className="min-h-[75vh] w-full rounded-lg border-0 bg-white"
              />
            ) : (
              <div className="flex min-h-[70vh] items-center justify-center rounded-lg bg-white p-2">
                <Image
                  src={viewReceiptUrl}
                  alt="Full-size receipt evidence"
                  width={1440}
                  height={1080}
                  unoptimized
                  className="max-h-[84vh] max-w-full object-contain"
                />
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
