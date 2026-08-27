"use client";

import {
  dispatchClientDataSync,
  HH_APP_SYNC_EVENT,
  HH_PROJECT_EDIT_OPTIMISTIC_REASON,
  syncClientsThenRefreshInBackground,
} from "@/lib/sync-router-client";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { AmountCell, ConfirmDialog, PageLayout, Divider, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";
import { OS, TYPO } from "@/lib/typography";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast/toast-provider";
import type { Project, ProjectFinancialSummary } from "@/lib/data";
import type { EstimateListItem } from "@/lib/estimates-db";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import type {
  ProjectFinancialSnapshot,
  ProjectFinancialSnapshotDiagnostics,
  ProjectFinancialWarning,
} from "@/lib/financial/project-financial-snapshot";
import { getProjectFinancialSnapshotProfitReadinessWarning } from "@/lib/financial/project-financial-display";
import type { ProjectCostDashboardPayload } from "@/lib/project-cost-dashboard";
import { ProjectDocumentsTab } from "./project-documents-tab";
import { ProjectCostLinesTable } from "./project-cost-lines-table";
import { ProjectCloseoutTab } from "./project-closeout-tab";
import { ProjectCommissionTab } from "./project-commission-tab";
import { ProjectFinancialSnapshotComparisonPanel } from "./project-financial-snapshot-comparison-panel";
import { RecentExpenseLines } from "./recent-expense-lines";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { archiveProjectAction, deleteProjectAction, updateProjectAction } from "../actions";
import { EditProjectModal, type ProjectEditSavePatch } from "./edit-project-modal";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";

function normalizeDetailStatus(
  status: string
): "active" | "completed" | "pending" | "on_hold" | "other" {
  const v = (status ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  if (v === "active") return "active";
  if (v === "completed") return "completed";
  if (v === "pending") return "pending";
  if (v === "on_hold" || v === "on-hold" || v.includes("hold")) return "on_hold";
  return "other";
}

function ProjectDetailStatusPill({ status }: { status: string }) {
  const n = normalizeDetailStatus(status);
  const map = {
    active: { pill: "hh-pill-success", label: "Active" },
    completed: { pill: "hh-pill-success", label: "Completed" },
    pending: { pill: "hh-pill-warning", label: "Pending" },
    on_hold: { pill: "hh-pill-neutral", label: "On Hold" },
    other: {
      pill: "hh-pill-neutral",
      label:
        status && status.trim()
          ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
          : "—",
    },
  } as const;
  const c = map[n];
  return <span className={cn(c.pill, "text-hh-metadata leading-tight")}>{c.label}</span>;
}

const TAB_PANEL =
  "mt-4 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 text-hh-body leading-normal text-[var(--hh-text-primary)] shadow-operational sm:p-5";

function fmtMoney(n: number, opts?: { maximumFractionDigits?: number }) {
  const fd = opts?.maximumFractionDigits ?? 0;
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: fd })}`;
}

const exactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtExactMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return exactMoneyFormatter.format(n);
}

function fmtPercentRatio(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return percentFormatter.format(n);
}

type CostBucketFilter = null | "expenses" | "labor" | "reimbursements" | "bills" | "commission";

type ProjectFinancialSnapshotComparisonView = {
  newSnapshot: ProjectFinancialSnapshot;
  warnings?: ProjectFinancialWarning[];
  diagnostics?: ProjectFinancialSnapshotDiagnostics;
};

type SnapshotComparisonResponse =
  | { ok: true; comparison: ProjectFinancialSnapshotComparisonView }
  | { ok: false; message?: string };

type SnapshotLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; comparison: ProjectFinancialSnapshotComparisonView };

type SnapshotCostSummary = {
  actualCost: number;
  expenseCost: number;
  laborCost: number;
  reimbursementCost: number;
  subcontractCost: number;
  commissionCost: number;
  billedAmount: number;
  paidAmount: number;
  openAR: number;
};

function useProjectFinancialSnapshotSummary(projectId: string): SnapshotLoadState {
  const [state, setState] = React.useState<SnapshotLoadState>({ status: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshot() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/projects/${projectId}/financial-snapshot`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as SnapshotComparisonResponse | null;
        if (!response.ok || !body?.ok) {
          throw new Error("Project financial snapshot unavailable.");
        }
        setState({ status: "ready", comparison: body.comparison });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: "error" });
      }
    }

    void loadSnapshot();

    return () => controller.abort();
  }, [projectId]);

  return state;
}

function uniqueSnapshotNotes(warnings: ProjectFinancialWarning[]): string[] {
  const noteByCode: Record<string, string> = {
    ap_bills_not_mapped: "AP/subcontract mapping is not final yet.",
    reimbursement_not_finalized: "Some reimbursements still need final review.",
    expense_status_pending: "Some pending expenses need review before final costing.",
    expense_status_needs_review: "Some pending expenses need review before final costing.",
    expense_status_unreviewed: "Some pending expenses need review before final costing.",
    expense_status_missing: "Some pending expenses need review before final costing.",
    expense_reimbursement_status_source_scope_required:
      "Some reimbursement-coded expenses need source review.",
    reimbursement_expense_deduped: "A reimbursement represented as an expense was counted once.",
  };
  const notes = new Set<string>();
  for (const warning of warnings) {
    const note = noteByCode[warning.code] ?? warning.message;
    if (note) notes.add(note);
  }
  return Array.from(notes);
}

function pendingDiagnosticsLine(
  diagnostics: ProjectFinancialSnapshotDiagnostics | null | undefined
): string | null {
  if (!diagnostics) return null;
  const parts: string[] = [];
  if (diagnostics.pendingExpenseCost > 0 || diagnostics.pendingExpenseCount > 0) {
    parts.push(
      `Expenses ${fmtExactMoney(diagnostics.pendingExpenseCost)} (${diagnostics.pendingExpenseCount})`
    );
  }
  if (diagnostics.pendingReimbursementCost > 0 || diagnostics.pendingReimbursementCount > 0) {
    parts.push(
      `Reimbursements ${fmtExactMoney(diagnostics.pendingReimbursementCost)} (${diagnostics.pendingReimbursementCount})`
    );
  }
  if (diagnostics.committedReimbursementCost > 0 || diagnostics.committedReimbursementCount > 0) {
    parts.push(
      `Committed reimbursements ${fmtExactMoney(diagnostics.committedReimbursementCost)} (${diagnostics.committedReimbursementCount})`
    );
  }
  if (parts.length === 0) return null;
  return `Pending review costs not included: ${parts.join(" · ")}.`;
}

function SnapshotMetricCard({
  label,
  value,
  testId,
  onClick,
  active = false,
}: {
  label: string;
  value: number;
  testId: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = cn(
    OS.card,
    "px-3 py-3 text-left transition-colors",
    onClick &&
      (active
        ? "border-[var(--hh-action-primary)] bg-[var(--hh-l3-selected)] ring-1 ring-[var(--hh-focus-ring)]"
        : "hover:bg-[var(--hh-l2-operational-surface)]")
  );

  const body = (
    <>
      <p className={cn(TYPO.kpiLabel, "text-hh-status")}>{label}</p>
      <p data-testid={testId} className={cn(TYPO.amount, "mt-1 text-hh-section-title")}>
        {fmtExactMoney(value)}
      </p>
    </>
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function SnapshotTextMetricCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className={cn(OS.card, "px-3 py-3 text-left")}>
      <p className={cn(TYPO.kpiLabel, "text-hh-status")}>{label}</p>
      <p data-testid={testId} className={cn(TYPO.amount, "mt-1 text-hh-section-title")}>
        {value}
      </p>
    </div>
  );
}

function DashboardMetric({
  label,
  value,
  testId,
  tone = "neutral",
  detail,
}: {
  label: string;
  value: React.ReactNode;
  testId?: string;
  tone?: "neutral" | "positive" | "negative" | "attention";
  detail?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-t border-[var(--hh-border)] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 first:sm:border-l-0 first:sm:pl-0">
      <p className={cn(TYPO.kpiLabel, "text-hh-status")}>{label}</p>
      <p
        data-testid={testId}
        className={cn(
          TYPO.amount,
          "mt-1 truncate text-hh-financial-total leading-tight sm:text-hh-page-title",
          tone === "positive" && OS.emeraldAccent,
          tone === "negative" && OS.dangerAmount,
          tone === "attention" && "text-[var(--hh-action-primary)]"
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-hh-status text-[var(--hh-text-tertiary)]">{detail}</p>
      ) : null}
    </div>
  );
}

function ExecutiveCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(OS.card, "min-w-0 overflow-hidden px-4 py-4 sm:px-5", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <SectionHeader
          label={title}
          className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
        />
        {action}
      </div>
      <Divider />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "positive" | "negative" | "attention";
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-[var(--hh-border)] py-2 last:border-0">
      <span className="min-w-0 truncate text-hh-table-cell text-[var(--hh-text-secondary)]">
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-right text-hh-table-cell font-medium tabular-nums text-[var(--hh-text-primary)]",
          tone === "positive" && OS.emeraldAccent,
          tone === "negative" && OS.dangerAmount,
          tone === "attention" && "text-[var(--hh-action-primary)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

type TabKey =
  | "overview"
  | "financial"
  | "documents"
  | "cost"
  | "people"
  | "photos"
  | "inspections"
  | "docs"
  | "budget"
  | "expenses"
  | "labor"
  | "subcontracts"
  | "bills"
  | "activity"
  | "change-orders"
  | "closeout"
  | "commission";

type WorkspaceTabKey =
  | "overview"
  | "financial"
  | "people"
  | "documents"
  | "photos"
  | "inspections"
  | "activity"
  | "closeout";

const PROJECT_WORKSPACE_TABS: Array<{ key: WorkspaceTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "financial", label: "Financial" },
  { key: "people", label: "People" },
  { key: "documents", label: "Documents" },
  { key: "photos", label: "Photos" },
  { key: "inspections", label: "Inspections" },
  { key: "activity", label: "Activity" },
  { key: "closeout", label: "Closeout" },
];

function uniqueText(values: Array<string | null | undefined>, limit = 5) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= limit) break;
  }

  return result;
}

function normalizeWorkspaceTab(tab: TabKey): WorkspaceTabKey {
  if (
    tab === "cost" ||
    tab === "budget" ||
    tab === "expenses" ||
    tab === "labor" ||
    tab === "subcontracts" ||
    tab === "bills" ||
    tab === "change-orders" ||
    tab === "commission" ||
    tab === "financial"
  ) {
    return "financial";
  }
  if (tab === "activity") {
    return "activity";
  }
  if (tab === "people") {
    return "people";
  }
  if (tab === "photos") {
    return "photos";
  }
  if (tab === "inspections") {
    return "inspections";
  }
  if (tab === "materials") {
    return "materials";
  }
  if (tab === "closeout") {
    return "closeout";
  }
  if (tab === "docs" || tab === "documents") {
    return "documents";
  }
  return "overview";
}

export interface ProjectDetailTabsClientProps {
  projectId: string;
  project: Project;
  financialSummary: (ProjectFinancialSummary & { marginPct?: number }) | null;
  projectCost: ProjectCostDashboardPayload;
  showFinancialSnapshotComparison?: boolean;
  billingSummary: {
    invoicedTotal: number;
    paidTotal: number;
    arBalance: number;
    lastPaymentDate: string | null;
  };
  canonicalProfit: CanonicalProjectProfit;
  initialTab: TabKey;
  recentExpenseLines: import("./recent-expense-lines").RecentExpenseLineRow[];
  /** All expense lines for this project (Expenses tab); overview uses first 10 of recentExpenseLines. */
  expenseLineRows: import("./recent-expense-lines").RecentExpenseLineRow[];
  projectInvoices: import("@/lib/data").InvoiceWithDerived[];
  relatedEstimates: EstimateListItem[];
  laborEntries: import("@/lib/daily-labor-db").LaborEntryWithJoins[];
  documents: import("@/lib/data").DocumentRow[];
  commissions: import("@/lib/data").CommissionWithPaid[];
  subcontracts: import("@/lib/subcontracts-db").SubcontractWithSubcontractor[];
  bills: import("@/lib/ap-bills-db").ApBillWithProject[];
  activityLogs: import("@/lib/activity-logs-db").ActivityLog[];
  changeOrders: import("@/lib/change-orders-db").ChangeOrder[];
  budgetItems: import("@/lib/data").ProjectBudgetItem[];
  closeoutWarranty: import("@/lib/data").CloseoutWarranty | null;
  closeoutCompletion: import("@/lib/data").CloseoutCompletion | null;
}

export function ProjectDetailTabsClient({
  projectId,
  project,
  financialSummary,
  projectCost,
  showFinancialSnapshotComparison = false,
  billingSummary,
  canonicalProfit,
  initialTab,
  recentExpenseLines,
  expenseLineRows,
  projectInvoices,
  relatedEstimates,
  laborEntries,
  documents,
  commissions,
  subcontracts,
  bills,
  activityLogs,
  changeOrders,
  budgetItems,
  closeoutWarranty,
  closeoutCompletion,
}: ProjectDetailTabsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTabTransition] = React.useTransition();
  const [tab, setTab] = React.useState<WorkspaceTabKey>(() => normalizeWorkspaceTab(initialTab));
  const [costBucketFilter, setCostBucketFilter] = React.useState<CostBucketFilter>(null);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = React.useState(false);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [displayProject, setDisplayProject] = React.useState<Project>(() => project);
  useBreadcrumbEntityLabel(displayProject.name);
  const displayProjectRef = React.useRef(displayProject);
  displayProjectRef.current = displayProject;

  React.useEffect(() => {
    setDisplayProject(project);
  }, [project]);

  React.useEffect(() => {
    if (tab !== "financial") {
      setCostBucketFilter(null);
    }
  }, [tab]);

  const snapshotState = useProjectFinancialSnapshotSummary(projectId);

  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason === HH_PROJECT_EDIT_OPTIMISTIC_REASON) return;
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        syncRouterNonBlocking(router);
      }, 80);
    };
    window.addEventListener(HH_APP_SYNC_EVENT, handler);
    return () => {
      window.removeEventListener(HH_APP_SYNC_EVENT, handler);
      if (t != null) clearTimeout(t);
    };
  }, [router]);

  const handleProjectSave = React.useCallback(
    (patch: ProjectEditSavePatch) => {
      const snapshot = displayProjectRef.current;
      flushSync(() => {
        setDisplayProject((p) => ({
          ...p,
          name: patch.name,
          client: patch.client,
          address: patch.address,
          budget: patch.budget,
          contractAmount: patch.budget,
        }));
        setEditModalOpen(false);
      });
      dispatchClientDataSync({ reason: HH_PROJECT_EDIT_OPTIMISTIC_REASON });
      void (async () => {
        const result = await updateProjectAction(projectId, {
          name: patch.name,
          client: patch.client,
          address: patch.address,
          budget: patch.budget,
        });
        if (result?.error) {
          flushSync(() => setDisplayProject(snapshot));
          toast({
            title: "Couldn't save project",
            description: result.error,
            variant: "error",
          });
          return;
        }
        toast({ title: "Project updated" });
      })();
    },
    [projectId, toast]
  );

  const handleArchiveConfirm = React.useCallback(async () => {
    if (archiveBusy) return;
    setArchiveBusy(true);
    const snapshot = displayProjectRef.current;
    try {
      const res = await archiveProjectAction(projectId);
      if (res?.error) {
        toast({ title: "Archive failed", description: res.error, variant: "error" });
        return;
      }
      flushSync(() => {
        setDisplayProject((p) => ({ ...p, status: "completed" }));
        setArchiveConfirmOpen(false);
      });
      toast({ title: "Project archived" });
      router.push("/projects?status=active");
    } catch (error) {
      flushSync(() => setDisplayProject(snapshot));
      toast({
        title: "Archive failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setArchiveBusy(false);
    }
  }, [archiveBusy, projectId, router, toast]);

  const handleDeleteConfirm = React.useCallback(async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await deleteProjectAction(projectId);
      if (res?.blocked) {
        toast({
          title: "Cannot delete project",
          description:
            "This project has related records. Archive it or remove related data before deleting.",
          variant: "error",
        });
        return;
      }
      if (res?.error) {
        toast({ title: "Delete failed", description: res.error, variant: "error" });
        return;
      }
      setDeleteConfirmOpen(false);
      toast({ title: "Project deleted", variant: "success" });
      router.push("/projects");
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, projectId, router, toast]);

  const legacySpentVal = financialSummary?.spent ?? projectCost.spentTotal;
  const legacyProfitVal = financialSummary?.profit ?? projectCost.profit;
  const legacyMarginPct = financialSummary?.marginPct ?? projectCost.margin * 100;
  const snapshotComparison = snapshotState.status === "ready" ? snapshotState.comparison : null;
  const budgetVal =
    snapshotComparison?.newSnapshot.contractValue ??
    displayProject.contractAmount ??
    displayProject.budget ??
    financialSummary?.budget ??
    0;
  const snapshotWarnings =
    snapshotComparison?.warnings ?? snapshotComparison?.newSnapshot.warnings ?? [];
  const snapshotDiagnostics =
    snapshotComparison?.diagnostics ?? snapshotComparison?.newSnapshot.diagnostics ?? null;
  const snapshotNotes = uniqueSnapshotNotes(snapshotWarnings);
  const pendingCostReviewNote = pendingDiagnosticsLine(snapshotDiagnostics);
  const fallbackCostSummary: SnapshotCostSummary = React.useMemo(
    () => ({
      actualCost: projectCost.breakdown.totalCost,
      expenseCost: projectCost.breakdown.materials + projectCost.breakdown.other,
      laborCost: projectCost.breakdown.labor,
      reimbursementCost: 0,
      subcontractCost: projectCost.breakdown.bills,
      commissionCost: projectCost.breakdown.commission,
      billedAmount: billingSummary.invoicedTotal,
      paidAmount: billingSummary.paidTotal,
      openAR: billingSummary.arBalance,
    }),
    [billingSummary.arBalance, billingSummary.invoicedTotal, billingSummary.paidTotal, projectCost]
  );
  const snapshotCostSummary: SnapshotCostSummary = snapshotComparison
    ? {
        actualCost: snapshotComparison.newSnapshot.actualCost,
        expenseCost: snapshotComparison.newSnapshot.expenseCost,
        laborCost: snapshotComparison.newSnapshot.laborCost,
        reimbursementCost: snapshotComparison.newSnapshot.reimbursementCost,
        subcontractCost: snapshotComparison.newSnapshot.subcontractCost,
        commissionCost: snapshotComparison.newSnapshot.commissionCost,
        billedAmount: snapshotComparison.newSnapshot.billedAmount,
        paidAmount: snapshotComparison.newSnapshot.paidAmount,
        openAR: snapshotComparison.newSnapshot.openAR,
      }
    : fallbackCostSummary;
  const commissionSummary = React.useMemo(
    () =>
      commissions.reduce(
        (acc, row) => {
          acc.total += Number(row.commission_amount) || 0;
          acc.paid += Number(row.paid_amount) || 0;
          acc.outstanding += Number(row.outstanding_amount) || 0;
          return acc;
        },
        { total: 0, paid: 0, outstanding: 0 }
      ),
    [commissions]
  );
  const profitReadinessWarning = snapshotComparison
    ? getProjectFinancialSnapshotProfitReadinessWarning(
        snapshotComparison.newSnapshot,
        snapshotWarnings,
        snapshotDiagnostics
      )
    : null;
  const showSnapshotProfit = snapshotComparison != null && profitReadinessWarning == null;
  const headerActualCost = snapshotComparison ? snapshotCostSummary.actualCost : legacySpentVal;
  const headerProfitValue = showSnapshotProfit
    ? snapshotComparison.newSnapshot.grossProfit
    : snapshotState.status === "error"
      ? legacyProfitVal
      : null;
  const headerMarginValue = showSnapshotProfit
    ? snapshotComparison.newSnapshot.grossMargin * 100
    : snapshotState.status === "error"
      ? legacyMarginPct
      : null;
  const headerFinancialWarning =
    snapshotState.status === "error"
      ? "Using legacy financial summary."
      : profitReadinessWarning != null
        ? profitReadinessWarning
        : null;
  const topCollectedValue = financialSummary?.collected ?? billingSummary.paidTotal;
  const topNeedCollectValue = snapshotCostSummary.openAR;
  const topProfitTone =
    headerProfitValue == null ? "attention" : headerProfitValue >= 0 ? "positive" : "negative";
  const topMarginDisplay = headerMarginValue == null ? "—" : `${headerMarginValue.toFixed(1)}%`;
  const latestActivity = activityLogs.slice(0, 4);
  const recentCostActivity = recentExpenseLines.slice(0, 4);
  const projectClientName =
    displayProject.client ?? (displayProject as { client_name?: string }).client_name ?? null;
  const projectWorkerNames = React.useMemo(
    () => uniqueText(laborEntries.map((entry) => entry.worker_name)),
    [laborEntries]
  );
  const subcontractorNames = React.useMemo(
    () => uniqueText(subcontracts.map((subcontract) => subcontract.subcontractor_name)),
    [subcontracts]
  );
  const vendorNames = React.useMemo(
    () => uniqueText(bills.map((bill) => bill.vendor_name)),
    [bills]
  );
  const commissionPeople = React.useMemo(
    () => uniqueText(commissions.map((commission) => commission.person_name)),
    [commissions]
  );
  const peopleSections = React.useMemo(
    () => [
      {
        label: "Customer",
        href: displayProject.customerId ? `/customers/${displayProject.customerId}` : "/customers",
        count: projectClientName ? 1 : 0,
        items: projectClientName ? [projectClientName] : [],
      },
      {
        label: "Workers",
        href: "/workers",
        count: projectWorkerNames.length,
        items: projectWorkerNames,
      },
      {
        label: "Subcontractors",
        href: `/projects/${projectId}/subcontracts`,
        count: subcontracts.length,
        items: subcontractorNames,
      },
      {
        label: "Vendors / Payees",
        href: "/financial/vendors",
        count: vendorNames.length,
        items: vendorNames,
      },
      {
        label: "Commission",
        href: "/financial/commissions",
        count: commissions.length,
        items: commissionPeople,
      },
    ],
    [
      commissionPeople,
      commissions.length,
      displayProject.customerId,
      projectClientName,
      projectId,
      projectWorkerNames,
      subcontractorNames,
      subcontracts.length,
      vendorNames,
    ]
  );

  const expensesProjectHref = `/financial/expenses?project_id=${encodeURIComponent(projectId)}`;
  const inboxProjectHref = `/financial/inbox?project_id=${encodeURIComponent(projectId)}`;

  const goToCostTab = React.useCallback(() => {
    startTabTransition(() => setTab("financial"));
  }, [startTabTransition]);

  const filteredCostRows = React.useMemo(() => {
    const rows = projectCost.doneCostRows;
    if (costBucketFilter === null) return rows;
    if (costBucketFilter === "expenses") return rows;
    return [];
  }, [projectCost.doneCostRows, costBucketFilter]);

  const costTableHint = React.useMemo(() => {
    const parts: string[] = [];
    if (costBucketFilter === "expenses") {
      parts.push(
        "Showing expense line detail. Header-only expense fallbacks can be included in the snapshot total even when no line row is available."
      );
    }
    if (costBucketFilter === "labor") {
      parts.push(
        "Labor is included in Total but comes from labor entries, not this expense table. Use More → Labor."
      );
    }
    if (costBucketFilter === "reimbursements") {
      parts.push(
        "Reimbursements are included in Total from worker reimbursement data. Use Labor → Reimbursements for line-level review."
      );
    }
    if (costBucketFilter === "bills") {
      parts.push(
        "AP / subcontract mapping is not final yet. Use More → Subcontracts or Bills for source records."
      );
    }
    if (costBucketFilter === "commission") {
      parts.push(
        "Commission / Selling Cost is accrued from project commission records. Paid and outstanding amounts are payment tracking below."
      );
    }
    return parts.length ? parts.join(" ") : null;
  }, [costBucketFilter]);

  const costTableEmptyMessage =
    costBucketFilter === "commission"
      ? "Commission records are shown in the Commission commitments section."
      : projectCost.doneCostRows.length === 0
        ? "No project costs yet"
        : "No expense lines match this filter.";

  const pickBreakdown = React.useCallback((key: "total" | Exclude<CostBucketFilter, null>) => {
    if (key === "total") {
      setCostBucketFilter(null);
      return;
    }
    setCostBucketFilter(key);
  }, []);

  return (
    <PageLayout
      divider={false}
      className="py-6 max-md:!pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]"
      header={
        <div className="space-y-4">
          <Link
            href="/projects"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-hh-standard px-1 text-hh-metadata font-medium text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
          <div className={cn(OS.card, "p-5 sm:p-6")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-hh-section-title font-semibold tracking-normal text-[var(--hh-text-primary)] sm:text-hh-page-title">
                    {displayProject.name}
                  </h1>
                  <ProjectDetailStatusPill status={displayProject.status} />
                </div>
                {(displayProject.client || displayProject.address) && (
                  <p className="text-hh-body text-[var(--hh-text-secondary)]">
                    {[displayProject.client, displayProject.address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 max-md:w-full max-md:[&>*]:flex-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-hh-standard bg-[var(--hh-action-primary)] text-hh-table-cell text-[var(--hh-action-primary-foreground)] hover:bg-[var(--hh-action-primary)]"
                  onClick={() => setEditModalOpen(true)}
                >
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-hh-standard text-hh-table-cell"
                      aria-label="Project actions"
                      data-testid="project-detail-actions"
                    >
                      <MoreHorizontal className="mr-1 h-4 w-4" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setArchiveConfirmOpen(true);
                      }}
                    >
                      Archive project
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(e) => {
                        e.preventDefault();
                        setDeleteConfirmOpen(true);
                      }}
                    >
                      Delete project…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-5 border-t border-[var(--hh-border)] pt-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <DashboardMetric
                  label="Contract Value"
                  value={fmtMoney(budgetVal)}
                  testId="project-header-contract-value"
                />
                <DashboardMetric
                  label="Collected"
                  value={fmtMoney(topCollectedValue)}
                  testId="project-header-collected"
                />
                <DashboardMetric
                  label="Need Collect"
                  value={fmtMoney(topNeedCollectValue)}
                  testId="project-header-need-collect"
                  tone={topNeedCollectValue > 0 ? "attention" : "positive"}
                />
                <button
                  type="button"
                  onClick={goToCostTab}
                  className="min-w-0 border-t border-[var(--hh-border)] pt-3 text-left outline-none transition-colors hover:bg-[var(--hh-l2-operational-surface)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"
                >
                  <p className={cn(TYPO.kpiLabel, "text-hh-status")}>Actual Cost</p>
                  <p
                    data-testid="project-header-actual-cost"
                    className={cn(
                      TYPO.amount,
                      "mt-1 truncate text-hh-financial-total leading-tight underline decoration-[var(--hh-border)] underline-offset-4 sm:text-hh-page-title"
                    )}
                  >
                    {fmtMoney(headerActualCost)}
                  </p>
                </button>
                <DashboardMetric
                  label="Profit"
                  value={
                    headerProfitValue == null
                      ? snapshotState.status === "loading"
                        ? "Loading..."
                        : "Needs review"
                      : `${headerProfitValue >= 0 ? "" : "-"}${fmtMoney(
                          Math.abs(headerProfitValue)
                        )}`
                  }
                  testId="project-header-profit"
                  tone={topProfitTone}
                />
                <DashboardMetric
                  label="Margin"
                  value={topMarginDisplay}
                  testId="project-header-margin"
                />
              </div>
              {headerFinancialWarning ? (
                <p
                  data-testid="project-header-financial-warning"
                  className="mt-3 rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-metadata font-medium text-[var(--hh-action-primary)]"
                >
                  {headerFinancialWarning}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      }
    >
      <EditProjectModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        project={{
          id: projectId,
          name: displayProject.name,
          client: displayProject.client ?? "",
          address: displayProject.address ?? "",
          budget: budgetVal,
          customerId: displayProject.customerId ?? null,
        }}
        onSave={handleProjectSave}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !archiveBusy) setArchiveConfirmOpen(false);
        }}
        title="Archive project?"
        description={`Archive ${displayProject.name}? The project will be marked completed and removed from the active list.`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        loading={archiveBusy}
        dismissBeforeAsync={false}
        onConfirm={handleArchiveConfirm}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteConfirmOpen(false);
        }}
        title="Delete project?"
        description={`Permanently delete ${displayProject.name}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteBusy}
        dismissBeforeAsync={false}
        onConfirm={handleDeleteConfirm}
      />
      <div className="-mx-4 -mb-4 px-4 pb-8 sm:-mx-6 sm:px-6">
        <div className="space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              startTabTransition(() => setTab(v as WorkspaceTabKey));
            }}
            className="w-full"
          >
            <div className="max-w-full overflow-hidden border-b border-[var(--hh-border)] pb-0">
              <TabsList
                aria-label="Project workspace sections"
                className="h-11 min-h-[44px] w-full touch-pan-x justify-start gap-0 overflow-x-auto overscroll-x-contain whitespace-nowrap rounded-none border-0 bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {PROJECT_WORKSPACE_TABS.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="min-h-[44px] shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-hh-table-cell font-medium text-[var(--hh-text-secondary)] shadow-none data-[state=active]:border-[var(--hh-action-primary)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--hh-text-primary)] data-[state=active]:shadow-none sm:px-4 sm:text-hh-body"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <ExecutiveCard
                  title="Financial Summary"
                  action={
                    <button
                      type="button"
                      onClick={() => setTab("financial")}
                      className="min-h-8 text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                    >
                      Financial
                    </button>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Contract value" value={fmtMoney(budgetVal)} />
                    <DetailRow
                      label="Collected"
                      value={fmtMoney(topCollectedValue)}
                      tone="positive"
                    />
                    <DetailRow
                      label="Need collect"
                      value={fmtMoney(topNeedCollectValue)}
                      tone={topNeedCollectValue > 0 ? "attention" : "positive"}
                    />
                    <DetailRow
                      label="Billed"
                      value={fmtExactMoney(snapshotCostSummary.billedAmount)}
                    />
                    <DetailRow label="Paid" value={fmtExactMoney(snapshotCostSummary.paidAmount)} />
                    <DetailRow
                      label="Last payment"
                      value={billingSummary.lastPaymentDate?.slice(0, 10) ?? "—"}
                    />
                  </div>
                </ExecutiveCard>

                <ExecutiveCard
                  title="Cost Breakdown"
                  action={
                    <button
                      type="button"
                      onClick={goToCostTab}
                      className="min-h-8 text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                    >
                      Cost detail
                    </button>
                  }
                >
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {(
                      [
                        { label: "Actual cost", value: snapshotCostSummary.actualCost },
                        { label: "Expenses", value: snapshotCostSummary.expenseCost },
                        { label: "Labor", value: snapshotCostSummary.laborCost },
                        { label: "Reimbursements", value: snapshotCostSummary.reimbursementCost },
                        { label: "Subcontracts", value: snapshotCostSummary.subcontractCost },
                        { label: "Commission", value: snapshotCostSummary.commissionCost },
                      ] as const
                    ).map((cell) => (
                      <div
                        key={cell.label}
                        className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3"
                      >
                        <p className={cn(TYPO.kpiLabel, "text-hh-status")}>{cell.label}</p>
                        <AmountCell className="mt-1 block text-hh-body">
                          {fmtMoney(cell.value)}
                        </AmountCell>
                      </div>
                    ))}
                  </div>
                </ExecutiveCard>

                <ExecutiveCard title="Project Health">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow
                      label="Status"
                      value={<ProjectDetailStatusPill status={displayProject.status} />}
                    />
                    <DetailRow
                      label="Needs review"
                      value={
                        <Link
                          href={inboxProjectHref}
                          className="underline-offset-2 hover:underline"
                        >
                          {projectCost.alerts.needsReviewCount}
                        </Link>
                      }
                      tone={projectCost.alerts.needsReviewCount > 0 ? "attention" : "positive"}
                    />
                    <DetailRow
                      label="Missing receipts"
                      value={
                        <Link
                          href={expensesProjectHref}
                          className="underline-offset-2 hover:underline"
                        >
                          {projectCost.alerts.missingReceiptCount}
                        </Link>
                      }
                      tone={projectCost.alerts.missingReceiptCount > 0 ? "attention" : "positive"}
                    />
                  </div>
                  <div className="mt-3 border-t border-[var(--hh-border)] pt-3 text-hh-table-cell text-[var(--hh-text-secondary)]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[var(--hh-text-tertiary)]">Client</span>
                      {displayProject.customerId ? (
                        <Link
                          href={`/customers/${displayProject.customerId}`}
                          className="font-medium text-[var(--hh-text-primary)] underline-offset-2 hover:underline"
                        >
                          {displayProject.client ??
                            (displayProject as { client_name?: string }).client_name ??
                            "Customer"}
                        </Link>
                      ) : (
                        <span className="font-medium text-[var(--hh-text-primary)]">
                          {displayProject.client ??
                            (displayProject as { client_name?: string }).client_name ??
                            "—"}
                        </span>
                      )}
                    </div>
                    {displayProject.address ? (
                      <p className="mt-1 truncate">{displayProject.address}</p>
                    ) : null}
                  </div>
                </ExecutiveCard>

                <ExecutiveCard title="Recent Activity">
                  {latestActivity.length > 0 ? (
                    <ul className="divide-y divide-[var(--hh-border)]">
                      {latestActivity.map((log) => (
                        <li key={log.id} className="flex gap-3 py-2.5 text-hh-table-cell">
                          <span className="w-[6.5rem] shrink-0 hh-fin tabular-nums text-[var(--hh-text-tertiary)]">
                            {log.created_at?.slice(0, 10) ?? "—"}
                          </span>
                          <span className="min-w-0 text-[var(--hh-text-primary)]">
                            {log.description ?? log.type}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : recentCostActivity.length > 0 ? (
                    <ul className="divide-y divide-[var(--hh-border)]">
                      {recentCostActivity.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-center gap-3 py-2.5 text-hh-table-cell"
                        >
                          <span className="w-[6.5rem] shrink-0 hh-fin tabular-nums text-[var(--hh-text-tertiary)]">
                            {row.date ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[var(--hh-text-primary)]">
                            {row.vendorName || row.memo || "Cost recorded"}
                          </span>
                          <span className="shrink-0 hh-fin tabular-nums text-[var(--hh-text-secondary)]">
                            {fmtMoney(row.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                      No recent activity for this project.
                    </p>
                  )}
                </ExecutiveCard>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="mt-4 space-y-4">
              <ExecutiveCard title="Revenue">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SnapshotTextMetricCard
                    label="Contract value"
                    value={fmtMoney(budgetVal)}
                    testId="project-financial-revenue-contract"
                  />
                  <SnapshotTextMetricCard
                    label="Billed"
                    value={fmtExactMoney(snapshotCostSummary.billedAmount)}
                    testId="snapshot-ar-billed"
                  />
                  <SnapshotTextMetricCard
                    label="Collected"
                    value={fmtExactMoney(snapshotCostSummary.paidAmount)}
                    testId="snapshot-ar-paid"
                  />
                  <SnapshotTextMetricCard
                    label="Need Collect"
                    value={fmtExactMoney(snapshotCostSummary.openAR)}
                    testId="snapshot-ar-open"
                  />
                </div>
                {relatedEstimates.length > 0 ? (
                  <div className="mt-4 border-t border-[var(--hh-border)] pt-3">
                    <p className={cn(TYPO.kpiLabel, "mb-1 text-hh-status")}>Related estimates</p>
                    <div className="divide-y divide-[var(--hh-border)]">
                      {relatedEstimates.slice(0, 5).map((estimate) => (
                        <Link
                          key={estimate.id}
                          href={`/estimates/${estimate.id}`}
                          className="flex min-h-10 items-center justify-between gap-3 py-2 text-hh-body underline-offset-2 hover:underline"
                        >
                          <span className="min-w-0 truncate font-medium text-[var(--hh-text-primary)]">
                            {estimate.number}
                          </span>
                          <span className="shrink-0 text-hh-metadata text-[var(--hh-text-secondary)]">
                            {estimate.status}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </ExecutiveCard>

              <ExecutiveCard title="Cost">
                <SectionHeader
                  label="Cost breakdown"
                  className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
                />
                <Divider />
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      {
                        key: "total" as const,
                        label: "Actual cost",
                        value: snapshotCostSummary.actualCost,
                        testId: "snapshot-cost-actual",
                      },
                      {
                        key: "expenses" as const,
                        label: "Expenses",
                        value: snapshotCostSummary.expenseCost,
                        testId: "snapshot-cost-expense",
                      },
                      {
                        key: "labor" as const,
                        label: "Labor",
                        value: snapshotCostSummary.laborCost,
                        testId: "snapshot-cost-labor",
                      },
                      {
                        key: "reimbursements" as const,
                        label: "Reimbursements",
                        value: snapshotCostSummary.reimbursementCost,
                        testId: "snapshot-cost-reimbursement",
                      },
                      {
                        key: "bills" as const,
                        label: "Bills / Subcontracts",
                        value: snapshotCostSummary.subcontractCost,
                        testId: "snapshot-cost-subcontracts",
                      },
                      {
                        key: "commission" as const,
                        label: "Commission / Selling Cost",
                        value: snapshotCostSummary.commissionCost,
                        testId: "snapshot-cost-commission",
                      },
                    ] as const
                  ).map((cell) => {
                    const active =
                      cell.key === "total"
                        ? costBucketFilter === null
                        : costBucketFilter === cell.key;
                    return (
                      <SnapshotMetricCard
                        key={cell.key}
                        label={cell.label}
                        value={cell.value}
                        testId={cell.testId}
                        active={active}
                        onClick={() => pickBreakdown(cell.key)}
                      />
                    );
                  })}
                </div>
                <div
                  data-testid="snapshot-cost-status"
                  className="mt-2 space-y-1 text-hh-metadata text-[var(--hh-text-secondary)]"
                >
                  {snapshotState.status === "error" ? (
                    <p className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-[var(--hh-action-primary)]">
                      Using legacy cost data. Snapshot unavailable.
                    </p>
                  ) : null}
                  {snapshotState.status === "loading" ? (
                    <p>Loading project financial snapshot…</p>
                  ) : null}
                  <p>
                    Actual cost = snapshot expense + labor + reimbursements + subcontracts + accrued
                    commission. Confirmed profit uses snapshot cost when the contract value is
                    ready; pending review costs and generic AP stay separate.
                  </p>
                  {snapshotNotes.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {snapshotNotes.slice(0, 4).map((note) => (
                        <li
                          key={note}
                          className="rounded-full border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-2 py-1 text-hh-status font-medium text-[var(--hh-action-primary)]"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pendingCostReviewNote ? (
                    <p className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-[var(--hh-action-primary)]">
                      <span className="font-medium">Pending review costs are not included.</span>{" "}
                      {pendingCostReviewNote}
                    </p>
                  ) : null}
                </div>
              </ExecutiveCard>

              <ExecutiveCard title="Profit">
                {snapshotComparison ? (
                  <>
                    {showSnapshotProfit ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <SnapshotTextMetricCard
                            label="Confirmed Gross Profit"
                            value={fmtExactMoney(snapshotComparison.newSnapshot.grossProfit)}
                            testId="snapshot-profit-gross"
                          />
                          <SnapshotTextMetricCard
                            label="Confirmed Margin"
                            value={fmtPercentRatio(snapshotComparison.newSnapshot.grossMargin)}
                            testId="snapshot-profit-margin"
                          />
                          <SnapshotMetricCard
                            label="Confirmed Actual Cost"
                            value={snapshotCostSummary.actualCost}
                            testId="snapshot-profit-actual-cost"
                          />
                        </div>
                        <p className="mt-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-hh-metadata text-[var(--hh-text-secondary)]">
                          Profit is based on confirmed costs and accrued commission. Pending review
                          costs, unpaid reimbursements, and generic AP are shown separately and are
                          not included yet.
                        </p>
                      </>
                    ) : (
                      <p className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-metadata font-medium text-[var(--hh-action-primary)]">
                        {profitReadinessWarning}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <SnapshotTextMetricCard
                      label="Legacy profit"
                      value={fmtExactMoney(legacyProfitVal)}
                      testId="snapshot-profit-gross"
                    />
                    <SnapshotTextMetricCard
                      label="Legacy margin"
                      value={`${legacyMarginPct.toFixed(1)}%`}
                      testId="snapshot-profit-margin"
                    />
                    <SnapshotMetricCard
                      label="Actual Cost"
                      value={snapshotCostSummary.actualCost}
                      testId="snapshot-profit-actual-cost"
                    />
                  </div>
                )}
              </ExecutiveCard>

              <ExecutiveCard title="Commission Commitments">
                <SectionHeader
                  label="Commission commitments"
                  className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
                />
                <Divider />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SnapshotMetricCard
                    label="Commission total"
                    value={commissionSummary.total}
                    testId="project-cost-commission-total"
                  />
                  <SnapshotMetricCard
                    label="Commission paid"
                    value={commissionSummary.paid}
                    testId="project-cost-commission-paid"
                  />
                  <SnapshotMetricCard
                    label="Commission outstanding"
                    value={commissionSummary.outstanding}
                    testId="project-cost-commission-outstanding"
                  />
                </div>
                <p className="mt-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-hh-metadata text-[var(--hh-text-secondary)]">
                  Commission / Selling Cost is accrued from commission records and included in
                  actual cost and profit. Paid and outstanding amounts are payment tracking only.
                </p>
                {commissions.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-hh-table-cell">
                      <thead>
                        <tr className="border-b border-[var(--hh-border)] text-[var(--hh-text-tertiary)]">
                          <th className="py-2 pr-3 text-left text-hh-status font-medium uppercase tracking-normal">
                            Person
                          </th>
                          <th className="py-2 pr-3 text-left text-hh-status font-medium uppercase tracking-normal">
                            Role
                          </th>
                          <th className="py-2 pr-3 text-right text-hh-status font-medium uppercase tracking-normal">
                            Commission
                          </th>
                          <th className="py-2 pr-3 text-right text-hh-status font-medium uppercase tracking-normal">
                            Paid
                          </th>
                          <th className="py-2 text-left text-hh-status font-medium uppercase tracking-normal">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissions.slice(0, 5).map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[var(--hh-border)] last:border-b-0"
                            data-testid={`project-cost-commission-row-${row.id}`}
                          >
                            <td className="py-2.5 pr-3 font-medium text-[var(--hh-text-primary)]">
                              {row.person_name || "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--hh-text-secondary)]">
                              {row.role || "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--hh-text-primary)]">
                              {fmtExactMoney(row.commission_amount)}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--hh-text-secondary)]">
                              {fmtExactMoney(row.paid_amount)}
                            </td>
                            <td className="py-2.5 text-[var(--hh-text-secondary)]">
                              {row.payment_status === "paid"
                                ? "Paid"
                                : row.payment_status === "partial"
                                  ? "Partial"
                                  : "Outstanding"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {commissions.length > 5 ? (
                      <Link
                        href="/financial/commissions"
                        className="mt-2 inline-flex min-h-8 items-center text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                      >
                        View all commissions
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-3 text-hh-table-cell text-[var(--hh-text-secondary)]">
                    No commissions are linked to this project yet.
                  </p>
                )}
              </ExecutiveCard>

              <ExecutiveCard title="Cost Detail">
                <SectionHeader
                  label="Cost detail"
                  className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
                />
                <Divider />
                <div className="mt-3">
                  <ProjectCostLinesTable
                    rows={filteredCostRows}
                    projectId={projectId}
                    hint={costTableHint}
                    emptyMessage={costTableEmptyMessage}
                  />
                </div>
              </ExecutiveCard>

              {showFinancialSnapshotComparison ? (
                <ProjectFinancialSnapshotComparisonPanel projectId={projectId} />
              ) : null}

              <ExecutiveCard title="Invoices">
                <SectionHeader
                  label="Invoicing"
                  action={
                    <Button asChild size="sm" className="h-8 min-h-8 rounded-hh-standard px-3">
                      <Link
                        data-testid="project-create-invoice-link"
                        href={`/financial/invoices/new?projectId=${encodeURIComponent(projectId)}`}
                      >
                        Create Invoice
                      </Link>
                    </Button>
                  }
                  className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
                />
                <Divider />
                <p className="mt-1 text-hh-body text-[var(--hh-text-secondary)]">
                  Billed {fmtExactMoney(snapshotCostSummary.billedAmount)} · Paid{" "}
                  {fmtExactMoney(snapshotCostSummary.paidAmount)} · Open AR{" "}
                  {fmtExactMoney(snapshotCostSummary.openAR)}
                </p>
                {projectInvoices.length === 0 ? (
                  <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                    No invoices for this project.
                  </p>
                ) : (
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-3 overflow-hidden rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-hh-body">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Invoice
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Issue date
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Status
                            </th>
                            <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                              Total
                            </th>
                            <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectInvoices.map((inv) => (
                            <tr key={inv.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                                <Link
                                  href={`/financial/invoices/${inv.id}`}
                                  className="font-medium text-[var(--hh-text-primary)] hover:underline"
                                >
                                  {inv.invoiceNo}
                                </Link>
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums">
                                {inv.issueDate?.slice(0, 10) ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                                <InvoiceStatusBadge status={inv.computedStatus} />
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                                ${inv.total.toLocaleString()}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                                ${inv.balanceDue.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="mt-3">
                  <Link
                    href="/financial/invoices"
                    className="text-hh-metadata font-medium text-[var(--hh-action-primary)] hover:underline"
                  >
                    View all invoices →
                  </Link>
                </div>
              </ExecutiveCard>

              <ExecutiveCard title="Bills (AP)">
                <SectionHeader
                  label="Bills (AP)"
                  className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]"
                />
                <Divider />
                {bills.length === 0 ? (
                  <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                    No bills for this project.
                  </p>
                ) : (
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-3 overflow-hidden rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-hh-body">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Vendor
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Bill no
                            </th>
                            <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bills.map((b) => (
                            <tr key={b.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                                {b.vendor_name ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums">
                                {b.bill_no ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                                ${Number(b.amount ?? 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </ExecutiveCard>
            </TabsContent>

            <TabsContent value="people" className="mt-4 space-y-4">
              <ExecutiveCard title="People">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {peopleSections.map((section) => (
                    <div
                      key={section.label}
                      className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-secondary)]">
                            {section.label}
                          </p>
                          <p className="mt-1 hh-fin text-hh-section-title font-semibold tabular-nums text-[var(--hh-text-primary)]">
                            {section.count}
                          </p>
                        </div>
                        <Link
                          href={section.href}
                          className="shrink-0 text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                      <p className="mt-3 line-clamp-2 text-hh-table-cell text-[var(--hh-text-secondary)]">
                        {section.items.length > 0 ? section.items.join(", ") : "None linked"}
                      </p>
                    </div>
                  ))}
                </div>
              </ExecutiveCard>
            </TabsContent>

            <TabsContent value="documents" className="mt-4 space-y-4">
              <ExecutiveCard title="Docs">
                <ProjectDocumentsTab projectId={projectId} documents={documents} />
              </ExecutiveCard>
            </TabsContent>

            <TabsContent value="photos" className={TAB_PANEL}>
              <SectionHeader
                label="Photos"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
                action={
                  <Link
                    href={`/site-photos?project_id=${encodeURIComponent(projectId)}`}
                    className="text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                  >
                    Open site photos
                  </Link>
                }
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link
                  href={`/site-photos?project_id=${encodeURIComponent(projectId)}`}
                  className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 text-hh-body font-medium text-[var(--hh-text-primary)] transition-colors hover:border-[var(--hh-action-primary)]"
                >
                  Site Photos
                  <span className="mt-1 block text-hh-metadata font-normal text-[var(--hh-text-secondary)]">
                    Project photo stream
                  </span>
                </Link>
                <Link
                  href="/site-photos/upload"
                  className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 text-hh-body font-medium text-[var(--hh-text-primary)] transition-colors hover:border-[var(--hh-action-primary)]"
                >
                  Upload Photos
                  <span className="mt-1 block text-hh-metadata font-normal text-[var(--hh-text-secondary)]">
                    Field photo intake
                  </span>
                </Link>
              </div>
            </TabsContent>

            <TabsContent value="inspections" className={TAB_PANEL}>
              <SectionHeader
                label="Inspections"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
                action={
                  <Link
                    href="/inspection-log"
                    className="text-hh-metadata font-medium text-[var(--hh-action-primary)] underline-offset-4 hover:underline"
                  >
                    Open inspection log
                  </Link>
                }
              />
              <div className="mt-3 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-hh-body font-medium text-[var(--hh-text-primary)]">
                      Inspection Log
                    </p>
                    <p className="mt-1 text-hh-metadata text-[var(--hh-text-secondary)]">
                      Field inspections and punch follow-up
                    </p>
                  </div>
                  <Link
                    href="/inspection-log"
                    className="min-h-9 rounded-hh-standard border border-[var(--hh-border)] px-3 py-2 text-hh-metadata font-medium text-[var(--hh-text-primary)] transition-colors hover:border-[var(--hh-action-primary)]"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="expenses" className={TAB_PANEL}>
              <SectionHeader
                label="Expenses"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              <div className="mt-2">
                <RecentExpenseLines rows={expenseLineRows} />
              </div>
              <div className="mt-3">
                <Link
                  href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
                  className="text-hh-metadata font-medium text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
                >
                  View all expenses →
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="budget" className={TAB_PANEL}>
              <SectionHeader
                label="Budget"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {budgetItems.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No budget items for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-hh-body">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Cost code
                          </th>
                          <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetItems.map((b) => (
                          <tr key={b.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                              {b.costCode ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                              ${Number(b.total || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="activity" className={TAB_PANEL}>
              <SectionHeader
                label="Activity"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {activityLogs.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No activity for this project.
                </p>
              ) : (
                <ul className="space-y-2 py-2">
                  {activityLogs.map((log) => (
                    <li
                      key={log.id}
                      className="text-hh-body border-b border-[var(--hh-border)] pb-2"
                    >
                      <span className="text-[var(--hh-text-secondary)]">
                        {log.created_at?.slice(0, 19).replace("T", " ")}
                      </span>
                      {" — "}
                      {log.description ?? log.type}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="change-orders" className={TAB_PANEL}>
              <SectionHeader
                label="Change Orders"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {changeOrders.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No change orders for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-hh-body">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Number
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Status
                          </th>
                          <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeOrders.map((co) => (
                          <tr key={co.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                              <div className="flex min-w-0 flex-col py-1.5">
                                <Link
                                  href={`/projects/${projectId}/change-orders/${co.id}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  {co.number ?? "—"}
                                </Link>
                                {co.title ? (
                                  <span className="mt-0.5 max-w-[18rem] truncate text-hh-metadata font-normal text-[var(--hh-text-secondary)]">
                                    {co.title}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                              {co.status ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                              ${Number(co.total ?? co.amount ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="closeout" className={TAB_PANEL}>
              <ProjectCloseoutTab
                projectId={projectId}
                projectName={displayProject.name}
                billingSummary={billingSummary}
                contractValue={canonicalProfit.revenue}
                warranty={closeoutWarranty}
                completion={closeoutCompletion}
                onRefresh={() =>
                  syncClientsThenRefreshInBackground(router, "project-closeout-mutated")
                }
              />
            </TabsContent>
            <TabsContent value="commission" className={cn(TAB_PANEL, "p-0 overflow-hidden sm:p-0")}>
              <div className="rounded-hh-standard bg-[var(--hh-l2-operational-surface)] p-4 sm:p-5">
                <ProjectCommissionTab
                  projectId={projectId}
                  commissions={commissions}
                  onRefresh={() =>
                    syncClientsThenRefreshInBackground(router, "project-commission-mutated")
                  }
                />
              </div>
            </TabsContent>
            <TabsContent value="subcontracts" className={TAB_PANEL}>
              <SectionHeader
                label="Subcontracts"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {subcontracts.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No subcontracts for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-hh-body">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Subcontractor
                          </th>
                          <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                            Contract amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subcontracts.map((s) => (
                          <tr key={s.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                              {s.subcontractor_name ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                              ${Number(s.contract_amount ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="bills" className={TAB_PANEL}>
              <SectionHeader
                label="Bills (AP)"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {bills.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No bills for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-hh-body">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Vendor
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                            Bill no
                          </th>
                          <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map((b) => (
                          <tr key={b.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                              {b.vendor_name ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums">
                              {b.bill_no ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                              ${Number(b.amount ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="labor" className={TAB_PANEL}>
              <SectionHeader
                label="Labor"
                className="text-hh-status tracking-normal text-[var(--hh-text-secondary)] font-medium"
              />
              <Divider />
              {laborEntries.length === 0 ? (
                <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
                  No labor entries for this project.
                </p>
              ) : (
                <>
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-hh-body">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Worker
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                              Date
                            </th>
                            <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                              Cost
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {laborEntries.slice(0, 20).map((e) => (
                            <tr key={e.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium">
                                {e.worker_name ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums">
                                {e.work_date?.slice(0, 10)}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                                ${Number(e.cost_amount ?? 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/projects/${projectId}/labor`}
                      className="text-hh-metadata font-medium text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
                    >
                      View full labor log →
                    </Link>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
