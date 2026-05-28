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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { ProjectTasksTab } from "./project-tasks-tab";
import { ProjectCloseoutTab } from "./project-closeout-tab";
import { ProjectMaterialsTab } from "./project-materials-tab";
import { ProjectCommissionTab } from "./project-commission-tab";
import { ProjectPunchListTab } from "./project-punch-list-tab";
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
  return <span className={cn(c.pill, "text-[12px] leading-tight")}>{c.label}</span>;
}

const TAB_PANEL =
  "mt-4 rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-4 text-[14px] leading-normal text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)] sm:p-5";

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
        ? "border-[var(--neo-gold)] bg-[rgb(184_137_45_/_0.08)] ring-1 ring-[var(--neo-gold-ring)]"
        : "hover:bg-[var(--neo-surface-muted)]")
  );

  const body = (
    <>
      <p className={cn(TYPO.kpiLabel, "text-[10px]")}>{label}</p>
      <p data-testid={testId} className={cn(TYPO.amount, "mt-1 text-[16px]")}>
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
      <p className={cn(TYPO.kpiLabel, "text-[10px]")}>{label}</p>
      <p data-testid={testId} className={cn(TYPO.amount, "mt-1 text-[16px]")}>
        {value}
      </p>
    </div>
  );
}

type TabKey =
  | "overview"
  | "cost"
  | "tasks"
  | "schedule"
  | "docs"
  | "budget"
  | "expenses"
  | "labor"
  | "subcontracts"
  | "bills"
  | "activity"
  | "change-orders"
  | "materials"
  | "closeout"
  | "commission"
  | "punch-list";

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
  tasks: import("@/lib/data").ProjectTaskWithWorker[];
  workers: import("@/lib/labor-db").Worker[];
  recentExpenseLines: import("./recent-expense-lines").RecentExpenseLineRow[];
  /** All expense lines for this project (Expenses tab); overview uses first 10 of recentExpenseLines. */
  expenseLineRows: import("./recent-expense-lines").RecentExpenseLineRow[];
  scheduleItems: import("@/lib/data").ProjectScheduleItem[];
  projectInvoices: import("@/lib/data").InvoiceWithDerived[];
  relatedEstimates: EstimateListItem[];
  laborEntries: import("@/lib/daily-labor-db").LaborEntryWithJoins[];
  documents: import("@/lib/data").DocumentRow[];
  commissions: import("@/lib/data").CommissionWithPaid[];
  materialSelections: import("@/lib/data").ProjectMaterialSelectionWithMaterial[];
  materialCatalog: import("@/lib/data").MaterialCatalogRow[];
  punchItems: import("@/lib/punch-list-db").PunchListItemWithJoins[];
  subcontracts: import("@/lib/subcontracts-db").SubcontractWithSubcontractor[];
  bills: import("@/lib/ap-bills-db").ApBillWithProject[];
  activityLogs: import("@/lib/activity-logs-db").ActivityLog[];
  changeOrders: import("@/lib/change-orders-db").ChangeOrder[];
  budgetItems: import("@/lib/data").ProjectBudgetItem[];
  closeoutPunch: import("@/lib/data").CloseoutPunch | null;
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
  tasks,
  workers,
  recentExpenseLines,
  expenseLineRows,
  scheduleItems,
  projectInvoices,
  relatedEstimates,
  laborEntries,
  documents,
  commissions,
  materialSelections,
  materialCatalog,
  punchItems,
  subcontracts,
  bills,
  activityLogs,
  changeOrders,
  budgetItems,
  closeoutPunch,
  closeoutWarranty,
  closeoutCompletion,
}: ProjectDetailTabsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTabTransition] = React.useTransition();
  const [tab, setTab] = React.useState<TabKey>(initialTab);
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
    if (tab !== "cost") {
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

  const expensesProjectHref = `/financial/expenses?project_id=${encodeURIComponent(projectId)}`;
  const inboxProjectHref = `/financial/inbox?project_id=${encodeURIComponent(projectId)}`;

  const goToCostTab = React.useCallback(() => {
    startTabTransition(() => setTab("cost"));
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
      className="dark py-6 max-md:!pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]"
      header={
        <div className="space-y-4">
          <Link
            href="/projects"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-1 text-[12px] font-medium text-[var(--neo-canvas-text-secondary)] hover:text-[var(--neo-canvas-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
          <div className={cn(OS.card, "p-5 sm:p-6")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-semibold tracking-normal text-[var(--neo-text-primary)] sm:text-2xl">
                    {displayProject.name}
                  </h1>
                  <ProjectDetailStatusPill status={displayProject.status} />
                </div>
                {(displayProject.client || displayProject.address) && (
                  <p className="text-[14px] text-[var(--neo-text-secondary)]">
                    {[displayProject.client, displayProject.address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 max-md:w-full max-md:[&>*]:flex-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-lg bg-[var(--neo-gold)] text-[13px] text-zinc-950 hover:bg-[var(--neo-gold-soft)]"
                  onClick={() => setEditModalOpen(true)}
                >
                  Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-lg text-[13px]"
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
            <div className="mt-5 border-t border-[var(--neo-border)] pt-5">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <p className={TYPO.kpiLabel}>Budget</p>
                  <p
                    data-testid="project-header-contract-value"
                    className={cn(TYPO.amount, "mt-1 text-2xl")}
                  >
                    {fmtMoney(budgetVal)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={goToCostTab}
                  className="rounded-lg text-left outline-none transition-colors hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                >
                  <p className={TYPO.kpiLabel}>Actual Cost</p>
                  <p
                    data-testid="project-header-actual-cost"
                    className={cn(
                      TYPO.amount,
                      "mt-1 text-2xl underline decoration-[var(--neo-border)] underline-offset-4"
                    )}
                  >
                    {fmtMoney(headerActualCost)}
                  </p>
                </button>
                <div>
                  <p className={TYPO.kpiLabel}>Confirmed Profit</p>
                  {headerProfitValue == null ? (
                    <p
                      data-testid="project-header-profit"
                      className="mt-1 text-[13px] font-semibold text-[var(--neo-gold)]"
                    >
                      {snapshotState.status === "loading" ? "Loading…" : "Needs review"}
                    </p>
                  ) : (
                    <p
                      data-testid="project-header-profit"
                      className={cn(
                        "mt-1 font-mono text-2xl font-bold tabular-nums",
                        headerProfitValue >= 0 ? OS.emeraldAccent : OS.dangerAmount
                      )}
                    >
                      {headerProfitValue >= 0 ? "" : "−"}
                      {fmtMoney(Math.abs(headerProfitValue))}
                    </p>
                  )}
                </div>
                <div>
                  <p className={TYPO.kpiLabel}>Confirmed Margin</p>
                  <p
                    data-testid="project-header-margin"
                    className={cn(TYPO.amount, "mt-1 text-2xl")}
                  >
                    {headerMarginValue == null ? "—" : `${headerMarginValue.toFixed(1)}%`}
                  </p>
                </div>
              </div>
              {headerFinancialWarning ? (
                <p
                  data-testid="project-header-financial-warning"
                  className="mt-3 rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-3 py-2 text-[12px] font-medium text-[var(--neo-gold)]"
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
              startTabTransition(() => setTab(v as TabKey));
            }}
            className="w-full"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-0">
              <TabsList className="h-10 min-h-0 flex-1 justify-start gap-0 overflow-x-auto whitespace-nowrap rounded-none border-0 bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(
                  [
                    { key: "overview" as const, label: "Overview" },
                    { key: "cost" as const, label: "Cost" },
                    { key: "tasks" as const, label: "Tasks" },
                    { key: "schedule" as const, label: "Schedule" },
                    { key: "docs" as const, label: "Docs" },
                  ] as const
                ).map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[13px] font-medium text-[var(--neo-canvas-text-secondary)] shadow-none data-[state=active]:border-[var(--neo-gold)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--neo-canvas-text-primary)] data-[state=active]:shadow-none sm:text-[14px]"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
                {/* Hidden triggers for secondary tabs so keyboard navigation still works */}
                {(
                  [
                    { key: "budget" as const, label: "Budget" },
                    { key: "expenses" as const, label: "Expenses" },
                    { key: "labor" as const, label: "Labor" },
                    { key: "subcontracts" as const, label: "Subcontracts" },
                    { key: "bills" as const, label: "Bills" },
                    { key: "activity" as const, label: "Activity" },
                    { key: "change-orders" as const, label: "Change Orders" },
                    { key: "materials" as const, label: "Material Selections" },
                    { key: "closeout" as const, label: "Closeout" },
                    { key: "commission" as const, label: "Commission" },
                    { key: "punch-list" as const, label: "Punch List" },
                  ] as const
                ).map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="hidden">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 border-white/10 bg-white/[0.06] px-2 text-[13px] text-[var(--neo-canvas-text-secondary)] hover:bg-white/[0.1] hover:text-[var(--neo-canvas-text-primary)]"
                  >
                    More ▾
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
                    Cost
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("expenses");
                    }}
                  >
                    Expenses
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("labor");
                    }}
                  >
                    Labor
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("bills");
                    }}
                  >
                    Bills
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("subcontracts");
                    }}
                  >
                    Subcontracts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
                    Project
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("budget");
                    }}
                  >
                    Budget
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("change-orders");
                    }}
                  >
                    Change Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("materials");
                    }}
                  >
                    Material Selections
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
                    Activity
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("activity");
                    }}
                  >
                    Activity
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("punch-list");
                    }}
                  >
                    Punch List
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
                    Final
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("closeout");
                    }}
                  >
                    Closeout
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("commission");
                    }}
                  >
                    Commission
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <TabsContent value="overview" className={cn(TAB_PANEL, "space-y-6")}>
              {/* A. Cost snapshot */}
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  OS.card,
                  "cursor-pointer px-4 py-4 outline-none transition-colors hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                )}
                onClick={goToCostTab}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToCostTab();
                  }
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <SectionHeader
                    label="Cost snapshot"
                    className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                  />
                  <span className="text-[12px] font-medium text-[var(--neo-gold)] underline-offset-4 hover:underline">
                    View cost details
                  </span>
                </div>
                <Divider />
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(
                    [
                      { label: "Total cost", value: projectCost.breakdown.totalCost },
                      { label: "Materials", value: projectCost.breakdown.materials },
                      { label: "Labor", value: projectCost.breakdown.labor },
                      { label: "Bills / Subcontracts", value: projectCost.breakdown.bills },
                      { label: "Other", value: projectCost.breakdown.other },
                    ] as const
                  ).map((cell) => (
                    <div key={cell.label} className="min-w-0">
                      <p className={cn(TYPO.kpiLabel, "text-[10px]")}>{cell.label}</p>
                      <AmountCell className="mt-1 block text-[15px]">
                        {fmtMoney(cell.value)}
                      </AmountCell>
                    </div>
                  ))}
                </div>
              </div>

              {/* B. Alerts */}
              <div className={cn(OS.card, "px-4 py-4")}>
                <SectionHeader
                  label="Alerts / issues"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                <ul className="mt-3 divide-y divide-[var(--neo-border)] text-[13px]">
                  <li className="py-0">
                    <Link
                      href={inboxProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md py-2.5 text-[var(--neo-text-primary)] outline-none hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                    >
                      <span>Needs review expenses</span>
                      <span className="tabular-nums text-[var(--neo-text-secondary)]">
                        {projectCost.alerts.needsReviewCount}
                        <span className="ml-2 text-[12px] font-medium text-[var(--neo-gold)]">
                          Inbox →
                        </span>
                      </span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={expensesProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md py-2.5 text-[var(--neo-text-primary)] outline-none hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                    >
                      <span>Missing receipt</span>
                      <span className="tabular-nums text-[var(--neo-text-secondary)]">
                        {projectCost.alerts.missingReceiptCount}
                        <span className="ml-2 text-[12px] font-medium text-[var(--neo-gold)]">
                          Expenses →
                        </span>
                      </span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={inboxProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md py-2.5 text-[var(--neo-text-primary)] outline-none hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                    >
                      <span>Duplicate expenses</span>
                      <span className="text-[12px] font-medium text-[var(--neo-gold)]">
                        Inbox →
                      </span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={expensesProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md py-2.5 text-[var(--neo-text-primary)] outline-none hover:bg-[var(--neo-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
                    >
                      <span>Missing project / category</span>
                      <span className="tabular-nums text-[var(--neo-text-secondary)]">
                        {projectCost.alerts.missingClassificationCount}
                        <span className="ml-2 text-[12px] font-medium text-[var(--neo-gold)]">
                          Expenses →
                        </span>
                      </span>
                    </Link>
                  </li>
                </ul>
              </div>

              {/* C. Recent costs (done only, max 5) */}
              <div className={cn(OS.card, "px-4 py-4")}>
                <SectionHeader
                  label="Recent costs"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                <div className="mt-2">
                  {recentExpenseLines.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[var(--neo-text-secondary)]">
                      No recorded costs yet.
                    </p>
                  ) : (
                    <RecentExpenseLines rows={recentExpenseLines} />
                  )}
                </div>
                <div className="mt-3 border-t border-[var(--neo-border)] pt-3">
                  <button
                    type="button"
                    onClick={goToCostTab}
                    className="text-[12px] font-medium text-[var(--neo-gold)] underline-offset-2 hover:underline"
                  >
                    View all costs →
                  </button>
                </div>
              </div>

              {/* D. Quick actions */}
              <div className={cn(OS.card, "px-4 py-4")}>
                <SectionHeader
                  label="Quick actions"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-[13px]" asChild>
                    <Link href="/financial/expenses/new">Add expense</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-[13px]" asChild>
                    <Link href={inboxProjectHref}>Inbox draft</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[13px]"
                    type="button"
                    onClick={goToCostTab}
                  >
                    View all costs
                  </Button>
                </div>
              </div>

              {/* Compact context (no KPI repeat) */}
              <div className={cn(OS.card, "px-4 py-4")}>
                <SectionHeader
                  label="Project context"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                <div className="mt-2 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[var(--neo-text-secondary)]">Client</span>
                    {displayProject.customerId ? (
                      <Link
                        href={`/customers/${displayProject.customerId}`}
                        className="truncate text-right font-medium text-[var(--neo-text-primary)] underline-offset-2 hover:underline"
                      >
                        {displayProject.client ??
                          (displayProject as { client_name?: string }).client_name ??
                          "Customer"}
                      </Link>
                    ) : (
                      <span className="truncate text-right font-medium text-[var(--neo-text-primary)]">
                        {displayProject.client ??
                          (displayProject as { client_name?: string }).client_name ??
                          "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[var(--neo-text-secondary)]">Contract value</span>
                    <span className="tabular-nums text-right font-medium text-[var(--neo-text-primary)]">
                      {fmtMoney(canonicalProfit.revenue)}
                    </span>
                  </div>
                  {financialSummary ? (
                    <>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-[var(--neo-text-secondary)]">Collected</span>
                        <span className="tabular-nums text-right text-[var(--neo-text-primary)]">
                          {fmtMoney(financialSummary.collected)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-[var(--neo-text-secondary)]">AR outstanding</span>
                        <span className="tabular-nums text-right text-[var(--neo-text-primary)]">
                          {fmtMoney(financialSummary.outstanding)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className={cn(OS.card, "px-4 py-4")}>
                <SectionHeader
                  label="Related estimates"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                {relatedEstimates.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--neo-text-secondary)]">
                    No estimates linked by this project or client name.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-[var(--neo-border)]">
                    {relatedEstimates.slice(0, 5).map((estimate) => (
                      <Link
                        key={estimate.id}
                        href={`/estimates/${estimate.id}`}
                        className="flex items-center justify-between gap-3 py-2 text-sm underline-offset-2 hover:underline"
                      >
                        <span className="min-w-0 truncate font-medium text-[var(--neo-text-primary)]">
                          {estimate.number}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--neo-text-secondary)]">
                          {estimate.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tasks" className={TAB_PANEL}>
              <ProjectTasksTab
                projectId={projectId}
                tasks={tasks}
                workers={workers}
                onTaskCreated={() =>
                  syncClientsThenRefreshInBackground(router, "project-task-created")
                }
                onTaskUpdated={() =>
                  syncClientsThenRefreshInBackground(router, "project-task-updated")
                }
              />
            </TabsContent>

            <TabsContent value="schedule" className={TAB_PANEL}>
              <SectionHeader
                label="Schedule"
                className="text-[11px] tracking-normal text-[var(--neo-text-tertiary)] font-medium"
              />
              <Divider />
              {scheduleItems.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No schedule milestones for this project.
                </p>
              ) : (
                <>
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Title
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Start
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              End
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleItems.map((s) => (
                            <tr key={s.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                                {s.title}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                                {s.start_date ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                                {s.end_date ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] capitalize">
                                {(s.status ?? "scheduled").replace(/_/g, " ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Link
                      href="/schedule"
                      className="text-xs font-medium text-[var(--neo-text-secondary)] hover:text-[var(--neo-text-primary)]"
                    >
                      Open company schedule →
                    </Link>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="cost" className={cn(TAB_PANEL, "space-y-8")}>
              <div>
                <SectionHeader
                  label="Cost breakdown"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
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
                  className="mt-2 space-y-1 text-[12px] text-[var(--neo-text-secondary)]"
                >
                  {snapshotState.status === "error" ? (
                    <p className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-3 py-2 text-[var(--neo-gold)]">
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
                          className="rounded-full border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-2 py-1 text-[11px] font-medium text-[var(--neo-gold)]"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pendingCostReviewNote ? (
                    <p className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-3 py-2 text-[var(--neo-gold)]">
                      <span className="font-medium">Pending review costs are not included.</span>{" "}
                      {pendingCostReviewNote}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <SectionHeader
                  label="Commission commitments"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
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
                <p className="mt-2 rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2 text-[12px] text-[var(--neo-text-secondary)]">
                  Commission / Selling Cost is accrued from commission records and included in
                  actual cost and profit. Paid and outstanding amounts are payment tracking only.
                </p>
                {commissions.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-[var(--neo-border)] text-[var(--neo-text-tertiary)]">
                          <th className="py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide">
                            Person
                          </th>
                          <th className="py-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide">
                            Role
                          </th>
                          <th className="py-2 pr-3 text-right text-[11px] font-medium uppercase tracking-wide">
                            Commission
                          </th>
                          <th className="py-2 pr-3 text-right text-[11px] font-medium uppercase tracking-wide">
                            Paid
                          </th>
                          <th className="py-2 text-left text-[11px] font-medium uppercase tracking-wide">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissions.slice(0, 5).map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[var(--neo-border)] last:border-b-0"
                            data-testid={`project-cost-commission-row-${row.id}`}
                          >
                            <td className="py-2.5 pr-3 font-medium text-[var(--neo-text-primary)]">
                              {row.person_name || "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--neo-text-secondary)]">
                              {row.role || "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--neo-text-primary)]">
                              {fmtExactMoney(row.commission_amount)}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--neo-text-secondary)]">
                              {fmtExactMoney(row.paid_amount)}
                            </td>
                            <td className="py-2.5 text-[var(--neo-text-secondary)]">
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
                      <button
                        type="button"
                        className="mt-2 text-[12px] font-medium text-[var(--neo-gold)] underline-offset-4 hover:underline"
                        onClick={() => setTab("commission")}
                      >
                        View all commissions
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-3 text-[13px] text-[var(--neo-text-secondary)]">
                    No commissions are linked to this project yet.
                  </p>
                )}
              </div>

              {snapshotComparison ? (
                <div>
                  <SectionHeader
                    label="Confirmed profit"
                    className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                  />
                  <Divider />
                  {showSnapshotProfit ? (
                    <>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      <p className="mt-2 rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2 text-[12px] text-[var(--neo-text-secondary)]">
                        Profit is based on confirmed costs and accrued commission. Pending review
                        costs, unpaid reimbursements, and generic AP are shown separately and are
                        not included yet.
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-3 py-2 text-[12px] font-medium text-[var(--neo-gold)]">
                      {profitReadinessWarning}
                    </p>
                  )}
                </div>
              ) : null}

              <div>
                <SectionHeader
                  label="Cost detail"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
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
              </div>

              {showFinancialSnapshotComparison ? (
                <ProjectFinancialSnapshotComparisonPanel projectId={projectId} />
              ) : null}

              <div className="border-t border-[var(--neo-border)] pt-6">
                <SectionHeader
                  label="Invoicing"
                  className="text-[11px] font-medium tracking-normal text-[var(--neo-text-tertiary)]"
                />
                <Divider />
                <p className="mt-1 text-sm text-[var(--neo-text-secondary)]">
                  Billed{" "}
                  <span data-testid="snapshot-ar-billed">
                    {fmtExactMoney(snapshotCostSummary.billedAmount)}
                  </span>{" "}
                  · Paid{" "}
                  <span data-testid="snapshot-ar-paid">
                    {fmtExactMoney(snapshotCostSummary.paidAmount)}
                  </span>{" "}
                  · Open AR{" "}
                  <span data-testid="snapshot-ar-open">
                    {fmtExactMoney(snapshotCostSummary.openAR)}
                  </span>
                </p>
                {projectInvoices.length === 0 ? (
                  <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                    No invoices for this project.
                  </p>
                ) : (
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-3 overflow-hidden rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)]">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Invoice
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Issue date
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Status
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                              Total
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectInvoices.map((inv) => (
                            <tr key={inv.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                                <Link
                                  href={`/financial/invoices/${inv.id}`}
                                  className="font-medium text-[var(--neo-text-primary)] hover:underline"
                                >
                                  {inv.invoiceNo}
                                </Link>
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                                {inv.issueDate?.slice(0, 10) ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                                <InvoiceStatusBadge status={inv.computedStatus} />
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                                ${inv.total.toLocaleString()}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
                    className="text-xs font-medium text-[var(--neo-gold)] hover:underline"
                  >
                    View all invoices →
                  </Link>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="docs" className={TAB_PANEL}>
              <ProjectDocumentsTab projectId={projectId} documents={documents} />
            </TabsContent>

            <TabsContent value="expenses" className={TAB_PANEL}>
              <SectionHeader
                label="Expenses"
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              <div className="mt-2">
                <RecentExpenseLines rows={expenseLineRows} />
              </div>
              <div className="mt-3">
                <Link
                  href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
                  className="text-xs font-medium text-[var(--neo-text-secondary)] hover:text-[var(--neo-text-primary)]"
                >
                  View all expenses →
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="budget" className={TAB_PANEL}>
              <SectionHeader
                label="Budget"
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {budgetItems.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No budget items for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Cost code
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetItems.map((b) => (
                          <tr key={b.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                              {b.costCode ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {activityLogs.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No activity for this project.
                </p>
              ) : (
                <ul className="space-y-2 py-2">
                  {activityLogs.map((log) => (
                    <li key={log.id} className="text-sm border-b border-[var(--neo-border)] pb-2">
                      <span className="text-[var(--neo-text-secondary)]">
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
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {changeOrders.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No change orders for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Number
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Status
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeOrders.map((co) => (
                          <tr key={co.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                              <div className="flex min-w-0 flex-col py-1.5">
                                <Link
                                  href={`/projects/${projectId}/change-orders/${co.id}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  {co.number ?? "—"}
                                </Link>
                                {co.title ? (
                                  <span className="mt-0.5 max-w-[18rem] truncate text-xs font-normal text-[var(--neo-text-secondary)]">
                                    {co.title}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                              {co.status ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
            <TabsContent value="materials" className={TAB_PANEL}>
              <ProjectMaterialsTab
                projectId={projectId}
                projectName={displayProject.name}
                clientName={
                  displayProject.client ??
                  (displayProject as { client_name?: string }).client_name ??
                  undefined
                }
                selections={materialSelections}
                catalog={materialCatalog}
                onRefresh={() =>
                  syncClientsThenRefreshInBackground(router, "project-materials-mutated")
                }
              />
            </TabsContent>
            <TabsContent value="closeout" className={TAB_PANEL}>
              <ProjectCloseoutTab
                projectId={projectId}
                projectName={displayProject.name}
                billingSummary={billingSummary}
                contractValue={canonicalProfit.revenue}
                punch={closeoutPunch}
                warranty={closeoutWarranty}
                completion={closeoutCompletion}
                onRefresh={() =>
                  syncClientsThenRefreshInBackground(router, "project-closeout-mutated")
                }
              />
            </TabsContent>
            <TabsContent value="commission" className={cn(TAB_PANEL, "p-0 overflow-hidden sm:p-0")}>
              <div className="rounded-lg bg-[var(--neo-surface-muted)] p-4 sm:p-5">
                <ProjectCommissionTab
                  projectId={projectId}
                  commissions={commissions}
                  onRefresh={() =>
                    syncClientsThenRefreshInBackground(router, "project-commission-mutated")
                  }
                />
              </div>
            </TabsContent>
            <TabsContent value="punch-list" className={TAB_PANEL}>
              <ProjectPunchListTab projectId={projectId} punchItems={punchItems} />
            </TabsContent>
            <TabsContent value="subcontracts" className={TAB_PANEL}>
              <SectionHeader
                label="Subcontracts"
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {subcontracts.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No subcontracts for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Subcontractor
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                            Contract amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subcontracts.map((s) => (
                          <tr key={s.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                              {s.subcontractor_name ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {bills.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No bills for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Vendor
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                            Bill no
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map((b) => (
                          <tr key={b.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                              {b.vendor_name ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                              {b.bill_no ?? "—"}
                            </td>
                            <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
                className="text-[11px] tracking-normal text-[var(--neo-text-secondary)] font-medium"
              />
              <Divider />
              {laborEntries.length === 0 ? (
                <p className="py-6 text-sm text-[var(--neo-text-secondary)]">
                  No labor entries for this project.
                </p>
              ) : (
                <>
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Worker
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                              Date
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)] tabular-nums">
                              Cost
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {laborEntries.slice(0, 20).map((e) => (
                            <tr key={e.id} className={listTableRowStaticClassName}>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                                {e.worker_name ?? "—"}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                                {e.work_date?.slice(0, 10)}
                              </td>
                              <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
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
                      className="text-xs font-medium text-[var(--neo-text-secondary)] hover:text-[var(--neo-text-primary)]"
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
