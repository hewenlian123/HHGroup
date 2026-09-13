"use client";

import * as React from "react";
import { useReviewContentMotion } from "@/hooks/use-review-content-motion";
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

import { ConfirmDialog, NeoStatus, RowActionsMenu, type RowAction } from "@/components/base";
import { FinanceReviewPageShell } from "@/components/financial/finance-review-page-shell";
import { MobileEmptyState, MobileSearchFiltersRow } from "@/components/mobile/mobile-list-chrome";
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
import { FilterSelect } from "@/components/financial/filter-select";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { formatCurrency } from "@/lib/formatters";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { adjacentReceiptId } from "@/lib/receipt-review-queue";
import type { WorkerReceipt, WorkerReceiptStatus } from "@/lib/worker-receipts-db";
import { cn } from "@/lib/utils";

export type ReceiptRow = WorkerReceipt & { projectName: string };

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return (parts[0] ?? name).slice(0, 2).toUpperCase();
}

function workerFilterKey(receipt: ReceiptRow): string {
  return (
    receipt.workerId ??
    `__name:${receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName}`
  );
}

function ReceiptStatus({ status, workflowClass }: Pick<WorkerReceipt, "status" | "workflowClass">) {
  if (workflowClass !== "canonical")
    return <NeoStatus label={`Legacy / Unverified · ${status ?? "NULL"}`} variant="warning" />;
  if (status === "Pending") return <NeoStatus label="Pending" variant="warning" />;
  if (status === "Approved") return <NeoStatus label="Approved" variant="success" />;
  if (status === "Rejected") return <NeoStatus label="Rejected" variant="danger" />;
  if (status === "Paid") return <NeoStatus label="Paid" variant="success" />;
  return <NeoStatus label={status ?? "NULL"} variant="warning" />;
}

function useReceiptPreviewUrl(reference: string | null, retryKey = 0) {
  const [result, setResult] = React.useState<{
    reference: string;
    url: string | null;
    failed: boolean;
  } | null>(null);
  React.useEffect(() => {
    if (!reference) return;
    let active = true;
    setResult(null);
    void fetch("/api/worker-receipts/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptUrl: reference }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || typeof body.signedUrl !== "string" || !body.signedUrl)
          throw new Error("Receipt preview unavailable");
        if (active) setResult({ reference, url: body.signedUrl, failed: false });
      })
      .catch(() => {
        if (active) setResult({ reference, url: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [reference, retryKey]);
  return result?.reference === reference ? result : null;
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
  const preview = useReceiptPreviewUrl(receiptUrl, retryKey);
  const isPdf = receiptUrl ? receiptUrl.split("?")[0]?.toLowerCase().endsWith(".pdf") : false;

  React.useEffect(() => {
    setFailed(false);
    setRetryKey(0);
  }, [receipt.id, receiptUrl]);

  if (!receiptUrl) {
    return (
      <div
        data-worker-receipt-evidence
        data-hh-context="evidence"
        data-hh-appearance="radix-expenses"
        className={cn(
          "flex min-h-[170px] flex-col items-center justify-center rounded-lg border px-5 py-8 text-center",
          prominent && "h-full min-h-[360px]"
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]">
          <FileWarning className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-[var(--hh-text-primary)]">
          Missing receipt evidence
        </p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--hh-text-secondary)]">
          This submission has no evidence. A new upload creates a separate submission; it does not
          update this record.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link
            href={`/upload-receipt?workerId=${encodeURIComponent(receipt.workerId ?? "")}&returnTo=${encodeURIComponent("/financial/inbox/worker")}`}
          >
            Upload new submission
          </Link>
        </Button>
      </div>
    );
  }

  if (failed || preview?.failed) {
    return (
      <div
        data-worker-receipt-evidence
        data-hh-context="evidence"
        data-hh-appearance="radix-expenses"
        className={cn(
          "flex min-h-[170px] flex-col items-center justify-center rounded-lg border px-5 py-8 text-center",
          prominent && "h-full min-h-[360px]"
        )}
      >
        <CircleAlert className="h-6 w-6 text-[var(--hh-danger)]" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-[var(--hh-text-primary)]">
          Receipt preview unavailable
        </p>
        <p className="mt-1 text-xs text-[var(--hh-text-secondary)]">
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

  if (!preview?.url) return <p role="status">Loading receipt preview…</p>;

  return (
    <div
      data-worker-receipt-evidence
      data-hh-context="evidence"
      data-hh-appearance="radix-expenses"
      className={cn(
        "group relative flex min-h-[190px] items-center justify-center overflow-hidden rounded-lg border bg-white",
        prominent && "h-full min-h-[360px]"
      )}
    >
      {isPdf ? (
        <iframe
          key={`${receipt.id}-${retryKey}`}
          src={preview.url}
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
          src={preview.url}
          alt={`Receipt evidence for ${receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName}`}
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
        className="absolute bottom-3 right-3 h-9 bg-[var(--hh-surface-primary)] text-[var(--hh-text-primary)] shadow-operational"
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
  const reviewContentRef = React.useRef<HTMLDivElement>(null);
  useReviewContentMotion(reviewContentRef, receipt.id, "[data-worker-receipts-detail-scroll]");

  return (
    <div ref={reviewContentRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--hh-border)] px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
            Review workspace
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ReceiptStatus status={receipt.status} workflowClass={receipt.workflowClass} />
            <span className={cn("text-hh-status", LEDGER_DATE_CLASS)}>
              Submitted {formatLedgerDate(receipt.createdAt, "compact")}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RowActionsMenu
            appearance="list"
            ariaLabel={`More actions for ${receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName}`}
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
        <section data-worker-review-identity aria-label="Submission identity">
          <p className="text-xs text-[var(--hh-text-secondary)]">Submitted by</p>
          <h2
            className="mt-1 text-lg font-semibold"
            aria-live="polite"
            tabIndex={-1}
            data-worker-review-heading
          >
            {receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName}
          </h2>
          <p
            data-worker-expense-amount
            data-amount-direction={
              receipt.amount < 0 ? "positive" : receipt.amount > 0 ? "negative" : "neutral"
            }
            className="hh-fin mt-2 text-2xl font-semibold"
          >
            {formatCurrency(receipt.amount)}
          </p>
          <div className="mt-2">
            <ReceiptStatus status={receipt.status} workflowClass={receipt.workflowClass} />
          </div>
        </section>
        {showEvidence ? (
          <div className="my-4">
            <ReceiptEvidence receipt={receipt} onOpen={onOpenEvidence} />
          </div>
        ) : null}
        <dl data-worker-review-facts className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt>Merchant</dt>
            <dd>{receipt.vendor?.trim() || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Expense date</dt>
            <dd>{receipt.receiptDate ? formatLedgerDate(receipt.receiptDate) : "Not recorded"}</dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{receipt.projectId ? receipt.projectName || "—" : "Not assigned"}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{receipt.expenseType || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Payment source</dt>
            <dd>Not recorded</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatLedgerDate(receipt.createdAt, "compact")}</dd>
          </div>
          <div className="col-span-2">
            <dt>Reimbursement</dt>
            <dd>
              {receipt.reimbursementId ? (
                <Link className="underline underline-offset-2" href="/labor/reimbursements">
                  {receipt.status === "Paid"
                    ? "Paid · View reimbursement"
                    : "Linked · View reimbursement"}
                </Link>
              ) : receipt.workflowClass !== "canonical" ? (
                "Unverified — financial actions unavailable"
              ) : receipt.status === "Pending" ? (
                "Approval creates a reimbursement; payment is handled separately."
              ) : (
                "No reimbursement linked"
              )}
            </dd>
          </div>
          <div className="col-span-2">
            <dt>Evidence</dt>
            <dd>
              {missingReceipt ? (
                "Missing evidence"
              ) : (
                <button
                  type="button"
                  className="min-h-8 underline underline-offset-2"
                  onClick={onOpenEvidence}
                >
                  Open submitted receipt
                </button>
              )}
            </dd>
          </div>
        </dl>
        <section className="mt-4 border-t border-[var(--hh-border)] pt-3">
          <h3 className="text-xs font-medium text-[var(--hh-text-secondary)]">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {[receipt.description, receipt.notes].filter(Boolean).join("\n") ||
              "No notes submitted"}
          </p>
        </section>
        {missingReceipt || missingProject || !receipt.expenseType?.trim() ? (
          <section
            aria-label="Submission issues"
            className="mt-4 border-t border-[var(--hh-border)] pt-3"
          >
            <h3 className="text-xs font-semibold">Issues</h3>
            <ul className="mt-2 space-y-1 text-sm text-[var(--hh-warning)]">
              {missingReceipt ? <li>Missing evidence</li> : null}
              {missingProject ? <li>Missing project</li> : null}
              {!receipt.expenseType?.trim() ? <li>Missing category</li> : null}
            </ul>
            <p className="mt-2 text-xs text-[var(--hh-text-secondary)]">
              This submission cannot be edited here. Use the existing rejection reason to explain
              required corrections.
            </p>
            {receipt.workflowClass === "canonical" && receipt.status === "Pending" ? (
              <Button
                variant="outline"
                size="sm"
                className="worker-receipt-reject mt-2"
                disabled={busy}
                onClick={() => onReject(canNext)}
              >
                Reject with correction reason
              </Button>
            ) : null}
            {missingReceipt ? (
              <Link
                className="mt-2 flex min-h-9 items-center text-xs underline underline-offset-2"
                href={`/upload-receipt?workerId=${encodeURIComponent(receipt.workerId ?? "")}&returnTo=${encodeURIComponent("/financial/inbox/worker")}`}
              >
                Upload new submission
              </Link>
            ) : null}
          </section>
        ) : null}
        {receipt.workflowClass !== "canonical" ? (
          <p className="mt-4 text-xs text-[var(--hh-text-secondary)]">
            Legacy / Unverified: original status is preserved. Approval and payment actions are
            unavailable.
          </p>
        ) : null}
        {receipt.status === "Rejected" && receipt.rejectionReason ? (
          <section className="mt-4 text-sm text-[var(--hh-danger)]">
            <h3 className="font-semibold">Rejection reason</h3>
            <p>{receipt.rejectionReason}</p>
          </section>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {queuePosition ? (
            <span className="mr-1 text-hh-status text-[var(--hh-text-tertiary)]">
              {queuePosition}
            </span>
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)]"
            >
              View reimbursement
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <span className="text-hh-status text-[var(--hh-text-tertiary)]">
              {receipt.workflowClass !== "canonical"
                ? "Historical evidence is unverified; financial changes are blocked."
                : receipt.status === "Pending"
                  ? "Awaiting review"
                  : "Review complete"}
            </span>
          )}
        </div>
        {receipt.workflowClass === "canonical" && receipt.status === "Pending" ? (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="worker-receipt-reject h-11"
              onClick={() => onReject(canNext)}
              disabled={busy}
              aria-label="Reject receipt"
            >
              Reject
            </Button>
            <Button
              type="button"
              size="sm"
              className="worker-receipt-approve h-11 min-w-[108px]"
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
  const [deleteTarget, setDeleteTarget] = React.useState<ReceiptRow | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [viewReceiptUrl, setViewReceiptUrl] = React.useState<string | null>(null);
  const [viewRetryKey, setViewRetryKey] = React.useState(0);
  const fullPreview = useReceiptPreviewUrl(viewReceiptUrl, viewRetryKey);
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
  const reviewWorkspaceRef = React.useRef<HTMLDivElement>(null);
  useReviewContentMotion(
    reviewWorkspaceRef,
    selectedId,
    "[data-worker-receipts-evidence-stage] > div:last-child"
  );
  const [wideEvidence, setWideEvidence] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWideEvidence(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const routeSelectedId = searchParams.get("ops_record")?.trim() || null;

  React.useEffect(() => {
    setSelectedId((current) => (current === routeSelectedId ? current : routeSelectedId));
    if (routeSelectedId && window.matchMedia("(max-width: 767px)").matches) {
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
      if (!Array.isArray(receiptData.receipts))
        throw new Error("Invalid receipt response. Existing receipts have been kept.");
      if (!projectResponse.ok)
        throw new Error("Failed to refresh projects. Existing receipts have been kept.");
      const projectData = await projectResponse.json();
      if (!Array.isArray(projectData.projects))
        throw new Error("Invalid project response. Existing receipts have been kept.");
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
      if (receipt.workflowClass === "canonical" && receipt.status === "Pending") pending += 1;
      if (receipt.workflowClass === "canonical" && receipt.status === "Approved") approved += 1;
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

  React.useEffect(() => {
    if (selectedId && displayRows.some((receipt) => receipt.id === selectedId)) return;
    if (window.matchMedia("(min-width: 768px)").matches) setSelectedId(displayRows[0]?.id ?? null);
    else if (selectedId) {
      setSelectedId(null);
      setMobileDetailOpen(false);
    }
  }, [displayRows, selectedId]);

  const selectedReceipt = React.useMemo(
    () => displayRows.find((receipt) => receipt.id === selectedId) ?? null,
    [displayRows, selectedId]
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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
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
      if (snapshot) setRows(snapshot);
      throw error instanceof Error ? error : new Error("Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const rowActions = (receipt: ReceiptRow): RowAction[] => [
    ...(receipt.receiptUrl
      ? [{ label: "View receipt", onClick: () => selectReceipt(receipt.id) }]
      : []),
    ...(receipt.workflowClass === "canonical" && receipt.status === "Pending"
      ? [
          {
            label: "Approve",
            onClick: () => void approve(receipt.id),
            disabled: busyId === receipt.id || receipt.workflowClass !== "canonical",
          },
          {
            label: "Reject",
            onClick: () => openReject(receipt.id),
            disabled: busyId === receipt.id || receipt.workflowClass !== "canonical",
          },
        ]
      : []),
    ...(receipt.workflowClass === "canonical" && receipt.status === "Rejected"
      ? [
          {
            label: "Reset to Pending",
            onClick: () => void resetToPending(receipt.id),
            disabled: busyId === receipt.id || receipt.workflowClass !== "canonical",
          },
        ]
      : []),
  ];

  const controlClass =
    "h-10 w-full min-w-0 rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] shadow-none outline-none hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
      <Input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search worker / merchant / project…"
        aria-label="Search worker receipts"
        className={cn(controlClass, "h-11 min-h-11 pl-9 md:h-10 md:min-h-10")}
      />
    </div>
  );

  const workerSelect = (
    <FilterSelect
      label="Filter by worker"
      value={workerFilter}
      onValueChange={setWorkerFilter}
      options={[
        { value: "", label: "All workers" },
        ...workerOptions.map(([value, label]) => ({ value, label })),
      ]}
    />
  );
  const projectSelect = (
    <FilterSelect
      label="Filter by project"
      value={projectFilter}
      onValueChange={setProjectFilter}
      options={[
        { value: "", label: "All projects" },
        ...projectOptions.map(([value, label]) => ({ value, label })),
      ]}
    />
  );
  const statusSelect = (
    <FilterSelect
      label="Filter by status"
      value={statusFilter}
      onValueChange={(v) => setStatusFilter(v as WorkerReceiptStatus | "")}
      options={[
        { value: "", label: "All statuses" },
        ...["Pending", "Approved", "Rejected", "Paid"].map((value) => ({ value, label: value })),
      ]}
    />
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
      ref={reviewWorkspaceRef}
      data-worker-receipts-workspace
      data-expenses-list-page="worker-receipts"
      className="expenses-ui worker-receipts-ui min-w-0 overflow-x-hidden"
    >
      <FinanceReviewPageShell
        title="Worker Submitted"
        description="Review employee-submitted expenses and reimbursement requests."
        actions={
          <Button size="sm" asChild className="h-9">
            <Link href="/upload-receipt">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              Upload Worker Receipt
            </Link>
          </Button>
        }
        status={
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
                <Icon className="h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)]" aria-hidden />
                <div className="min-w-0">
                  <dt className="truncate text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                    {label}
                  </dt>
                  <dd className="hh-fin mt-1 truncate text-hh-section-title font-semibold leading-none text-[var(--hh-text-strong)]">
                    {value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        }
        commandBar={
          <>
            <MobileSearchFiltersRow
              desktopBreakpoint="lg"
              filterSheetOpen={filtersOpen}
              onOpenFilters={() => setFiltersOpen(true)}
              activeFilterCount={activeFilterCount}
              filtersTriggerClassName="h-11 min-h-11"
              searchSlot={searchInput}
            />
            <div
              data-worker-command-bar
              className="hidden min-w-0 grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(135px,0.55fr))_auto] items-center gap-2 rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-2 lg:grid"
            >
              {searchInput}
              {workerSelect}
              {projectSelect}
              {statusSelect}
              <div className="flex items-center gap-1">
                <Button variant="outline" className="h-10" onClick={() => setFiltersOpen(true)}>
                  More filters
                </Button>
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
          </>
        }
      >
        {dataLoadWarning ? (
          <div
            className="rounded-md border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-sm text-[var(--hh-warning)]"
            role="status"
          >
            {dataLoadWarning}
          </div>
        ) : null}
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="expenses-ui-dialog max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submission filters</DialogTitle>
              <DialogDescription>
                Filter by worker, project, status or submission date.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[var(--hh-text-secondary)]">Worker</p>
                {workerSelect}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[var(--hh-text-secondary)]">Project</p>
                {projectSelect}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-[var(--hh-text-secondary)]">Status</p>
                {statusSelect}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="worker-receipts-from"
                  className="text-xs font-medium text-[var(--hh-text-secondary)]"
                >
                  From
                </label>
                <Input
                  id="worker-receipts-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className={cn(controlClass, "hh-fin")}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="worker-receipts-to"
                  className="text-xs font-medium text-[var(--hh-text-secondary)]"
                >
                  To
                </label>
                <Input
                  id="worker-receipts-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className={cn(controlClass, "hh-fin")}
                />
              </div>
            </div>
            {activeFilterCount ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            ) : null}
            <Button type="button" className="h-11 w-full" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </DialogContent>
        </Dialog>
        {message ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-sm text-[var(--hh-danger)]"
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
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] px-3 py-2 text-sm text-[var(--hh-success)]"
            role="status"
          >
            <span>{successMessage}</span>
            <Link href="/labor/reimbursements" className="font-medium underline underline-offset-2">
              View Reimbursements
            </Link>
          </div>
        ) : null}
        {displayRows.length === 0 ? (
          <section
            data-worker-unified-empty
            className="rounded-md border border-[var(--hh-border)] bg-[var(--hh-surface-primary)] px-6 py-10 text-center"
            aria-live="polite"
          >
            <h2 className="text-base font-semibold">
              {dataLoadWarning
                ? "Submissions unavailable"
                : searchQuery || workerFilter || projectFilter || dateFrom || dateTo
                  ? "No matching submissions"
                  : statusFilter === "Pending" && rows.length > 0
                    ? "No pending submissions"
                    : statusFilter
                      ? "No submissions in this status"
                      : "All caught up"}
            </h2>
            <p className="mt-2 text-sm text-[var(--hh-text-secondary)]">
              {dataLoadWarning
                ? "Refresh to retry loading worker submissions."
                : activeFilterCount || searchQuery
                  ? "Adjust filters to view other worker submissions."
                  : "No worker-submitted expenses need review."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {activeFilterCount || searchQuery ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    clearFilters();
                    setSearchQuery("");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
              {dataLoadWarning ? (
                <Button variant="outline" onClick={() => void refresh()}>
                  Retry
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/upload-receipt">Upload Worker Receipt</Link>
                </Button>
              )}
            </div>
          </section>
        ) : (
          <div data-worker-receipts-master-detail className="grid min-w-0 gap-3 lg:min-h-[520px]">
            <section
              data-worker-receipts-queue
              aria-label="Submission Queue"
              className="min-w-0 overflow-hidden rounded-lg border"
            >
              <div className="flex min-h-[48px] items-center justify-between gap-3 border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3.5 py-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--hh-text-primary)]">
                    Submission Queue
                  </h2>
                  <p className="mt-0.5 text-hh-status text-[var(--hh-text-tertiary)]">
                    {displayRows.length} of {rows.length} submissions
                  </p>
                </div>
                <span className="text-hh-status text-[var(--hh-text-tertiary)]">
                  Select to review
                </span>
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
                    <FileText className="h-8 w-8 text-[var(--hh-text-tertiary)]" aria-hidden />
                    <p className="mt-3 text-sm font-semibold text-[var(--hh-text-primary)]">
                      No uploads in queue
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-[var(--hh-text-secondary)]">
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
                        data-selected={selected ? "true" : "false"}
                        className="group relative flex min-w-0 items-stretch"
                      >
                        <button
                          type="button"
                          data-worker-receipt-control
                          aria-current={selected ? "true" : undefined}
                          className="flex min-h-[78px] min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left outline-none"
                          onClick={(event) => selectReceipt(receipt.id, event.currentTarget)}
                          aria-label={`Review receipt from ${receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName} · ${receipt.vendor || "Unknown merchant"} · ${receipt.receiptDate || "No date"}`}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-hh-status font-semibold ring-1 ring-inset ring-[var(--hh-border-subtle)]",
                              "bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)]"
                            )}
                            aria-hidden
                          >
                            {workerInitials(receipt.workerName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-start justify-between gap-3">
                              <span className="min-w-0 truncate text-hh-table-cell font-semibold text-[var(--hh-text-primary)]">
                                {receipt.workerId == null
                                  ? `NULL Worker · ${receipt.workerName}`
                                  : receipt.workerName}
                              </span>
                              <span
                                data-worker-expense-amount
                                data-amount-direction={
                                  receipt.amount < 0
                                    ? "positive"
                                    : receipt.amount > 0
                                      ? "negative"
                                      : "neutral"
                                }
                                className="hh-fin shrink-0 text-hh-body-strong font-semibold"
                              >
                                {formatCurrency(receipt.amount)}
                              </span>
                            </span>
                            <span
                              data-worker-merchant
                              className="mt-1 block truncate text-sm font-medium"
                            >
                              {receipt.vendor?.trim() || "Merchant not recorded"}
                            </span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-hh-status text-[var(--hh-text-secondary)]">
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
                              <ReceiptStatus
                                status={receipt.status}
                                workflowClass={receipt.workflowClass}
                              />
                              {missingReceipt ? (
                                <span className="inline-flex items-center gap-1 text-hh-status font-medium text-[var(--hh-warning)]">
                                  <Paperclip className="h-3 w-3" aria-hidden /> Missing receipt
                                </span>
                              ) : null}
                              {missingProject && !missingReceipt ? (
                                <span className="inline-flex items-center gap-1 text-hh-status font-medium text-[var(--hh-warning)]">
                                  <AlertTriangle className="h-3 w-3" aria-hidden /> Missing project
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 items-start px-1.5 pt-2.5">
                          <RowActionsMenu
                            appearance="list"
                            ariaLabel={`Actions for receipt ${receipt.workerId == null ? `NULL Worker · ${receipt.workerName}` : receipt.workerName}`}
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
              <div className="flex min-h-[48px] shrink-0 items-center justify-between gap-3 border-b border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3.5 py-2.5">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--hh-text-primary)]">
                    Receipt preview
                  </h2>
                  <p className="mt-0.5 truncate text-hh-status text-[var(--hh-text-tertiary)]">
                    {selectedReceipt
                      ? selectedReceipt.receiptUrl?.trim()
                        ? `Submitted by ${selectedReceipt.workerName} · ${formatLedgerDate(selectedReceipt.createdAt, "compact")}`
                        : `Missing evidence · ${selectedReceipt.workerName}`
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
                  wideEvidence ? (
                    <ReceiptEvidence
                      receipt={selectedReceipt}
                      onOpen={() => setViewReceiptUrl(selectedReceipt.receiptUrl)}
                      prominent
                    />
                  ) : null
                ) : (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center text-[var(--hh-text-secondary)]">
                    <FileText className="h-6 w-6 text-[var(--hh-text-tertiary)]" aria-hidden />
                    <p className="mt-3 text-sm font-medium">Evidence opens here</p>
                  </div>
                )}
              </div>
            </aside>

            <aside
              data-worker-receipts-detail
              aria-label="Worker receipt detail"
              className="hidden min-h-0 overflow-hidden rounded-lg border md:flex"
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
                  showEvidence={!wideEvidence}
                />
              ) : (
                <div className="flex min-h-[520px] w-full flex-col items-center justify-center px-8 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hh-l3-hover)] text-[var(--hh-text-tertiary)]">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="mt-4 text-sm font-semibold text-[var(--hh-text-primary)]">
                    Select a worker receipt
                  </h2>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--hh-text-secondary)]">
                    Review evidence, amount, project context, and available canonical actions
                    without leaving the queue.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </FinanceReviewPageShell>

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
          hideCloseButton
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
              className="text-xs font-medium text-[var(--hh-text-secondary)]"
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
              className="rounded-lg border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-xs leading-relaxed text-[var(--hh-danger)]"
            >
              {message}
            </div>
          ) : null}
          <DialogFooter className="border-[var(--hh-border)] bg-transparent">
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete receipt upload?"
        description="Delete this receipt upload? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={busyId === deleteTarget?.id}
        onConfirm={handleDelete}
      />

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
          {fullPreview?.failed ? (
            <div role="alert">
              Receipt preview unavailable{" "}
              <Button onClick={() => setViewRetryKey((key) => key + 1)}>Retry</Button>
            </div>
          ) : viewReceiptUrl && !fullPreview?.url ? (
            <p role="status">Loading receipt preview…</p>
          ) : fullPreview?.url ? (
            fullPreview.url.split("?")[0]?.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={fullPreview.url}
                title="Receipt evidence"
                className="min-h-[75vh] w-full rounded-lg border-0 bg-white"
              />
            ) : (
              <div className="flex min-h-[70vh] items-center justify-center rounded-lg bg-white p-2">
                <Image
                  src={fullPreview.url}
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
