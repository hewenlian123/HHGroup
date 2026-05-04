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
import { PageLayout, Divider, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";
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
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import {
  categoryLooksMaterials,
  type ProjectCostDashboardPayload,
} from "@/lib/project-cost-dashboard";
import { ProjectDocumentsTab } from "./project-documents-tab";
import { ProjectCostLinesTable } from "./project-cost-lines-table";
import { ProjectTasksTab } from "./project-tasks-tab";
import { ProjectCloseoutTab } from "./project-closeout-tab";
import { ProjectMaterialsTab } from "./project-materials-tab";
import { ProjectCommissionTab } from "./project-commission-tab";
import { ProjectPunchListTab } from "./project-punch-list-tab";
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
  "mt-4 rounded-xl border border-border/60 bg-white p-4 sm:p-5 text-[14px] leading-normal";

function fmtMoney(n: number, opts?: { maximumFractionDigits?: number }) {
  const fd = opts?.maximumFractionDigits ?? 0;
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: fd })}`;
}

type CostBucketFilter = null | "materials" | "labor" | "bills" | "other";

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
  billingSummary,
  canonicalProfit,
  initialTab,
  tasks,
  workers,
  recentExpenseLines,
  expenseLineRows,
  scheduleItems,
  projectInvoices,
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
          address: patch.address,
          budget: patch.budget,
          customerId: patch.customerId,
          client: patch.customerId ? (patch.customerName ?? p.client) : undefined,
        }));
        setEditModalOpen(false);
      });
      dispatchClientDataSync({ reason: HH_PROJECT_EDIT_OPTIMISTIC_REASON });
      void (async () => {
        const result = await updateProjectAction(projectId, {
          name: patch.name,
          address: patch.address,
          budget: patch.budget,
          customerId: patch.customerId,
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

  const budgetVal = displayProject.budget ?? financialSummary?.budget ?? 0;
  const spentVal = financialSummary?.spent ?? projectCost.spentTotal;
  const profitVal = financialSummary?.profit ?? projectCost.profit;
  const marginPct = financialSummary?.marginPct ?? projectCost.margin * 100;

  const expensesProjectHref = `/financial/expenses?project_id=${encodeURIComponent(projectId)}`;
  const inboxProjectHref = `/financial/inbox?project_id=${encodeURIComponent(projectId)}`;

  const goToCostTab = React.useCallback(() => {
    startTabTransition(() => setTab("cost"));
  }, [startTabTransition]);

  const filteredCostRows = React.useMemo(() => {
    const rows = projectCost.doneCostRows;
    if (costBucketFilter === null) return rows;
    if (costBucketFilter === "materials")
      return rows.filter((r) => categoryLooksMaterials(r.category));
    if (costBucketFilter === "other")
      return rows.filter((r) => !categoryLooksMaterials(r.category));
    return [];
  }, [projectCost.doneCostRows, costBucketFilter]);

  const costTableHint = React.useMemo(() => {
    const parts: string[] = [];
    if (costBucketFilter === "labor") {
      parts.push(
        "Labor is included in Total but comes from labor entries, not this expense table. Use More → Labor."
      );
    }
    if (costBucketFilter === "bills") {
      parts.push(
        "Bills / Subcontracts are included in Total from approved subcontract bills. Use More → Subcontracts or Bills."
      );
    }
    if (costBucketFilter === "materials") {
      parts.push("Showing expense lines classified as Materials only.");
    }
    if (costBucketFilter === "other") {
      parts.push("Showing expense lines in the Other bucket only (non-material categories).");
    }
    return parts.length ? parts.join(" ") : null;
  }, [costBucketFilter]);

  const costTableEmptyMessage =
    projectCost.doneCostRows.length === 0
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
      className="bg-page py-6"
      header={
        <div className="space-y-4">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </Link>
          <div className="rounded-lg bg-white p-5 shadow-[0_1px_3px_rgba(0_0_0_0.06)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
                    {displayProject.name}
                  </h1>
                  <ProjectDetailStatusPill status={displayProject.status} />
                </div>
                {(displayProject.client || displayProject.address) && (
                  <p className="text-[14px] text-text-secondary">
                    {[displayProject.client, displayProject.address].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg border-gray-100 text-[13px] text-text-secondary"
                    aria-label="Project actions"
                  >
                    <MoreHorizontal className="mr-1 h-4 w-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setEditModalOpen(true);
                    }}
                  >
                    Edit project
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async (e) => {
                      e.preventDefault();
                      const res = await archiveProjectAction(projectId);
                      if (res?.error) {
                        toast({
                          title: "Archive failed",
                          description: res.error,
                          variant: "error",
                        });
                      } else {
                        toast({ title: "Project archived" });
                        syncRouterNonBlocking(router);
                      }
                    }}
                  >
                    Archive project
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={async (e) => {
                      e.preventDefault();
                      if (
                        !window.confirm(
                          `Delete project "${displayProject.name}"? This cannot be undone.`
                        )
                      )
                        return;
                      const res = await deleteProjectAction(projectId);
                      if (res?.blocked) {
                        toast({
                          title: "Cannot delete project",
                          description:
                            "This project has related records. Please archive instead or remove related data.",
                          variant: "error",
                        });
                      } else if (res?.error) {
                        toast({
                          title: "Delete failed",
                          description: res.error,
                          variant: "error",
                        });
                      }
                    }}
                  >
                    Delete project…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-6 border-t border-gray-100 pt-6">
              <div className="rounded-xl border border-border/60 bg-white p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                      Budget
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
                      {fmtMoney(budgetVal)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={goToCostTab}
                    className="rounded-lg text-left outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                      Spent
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary underline decoration-border underline-offset-4">
                      {fmtMoney(spentVal)}
                    </p>
                  </button>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                      Profit
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-2xl font-bold tabular-nums",
                        profitVal >= 0 ? "text-hh-profit-positive" : "text-red-600"
                      )}
                    >
                      {profitVal >= 0 ? "" : "−"}
                      {fmtMoney(Math.abs(profitVal))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                      Margin
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
                      {marginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
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
          address: displayProject.address ?? "",
          budget: displayProject.budget,
          customerId: displayProject.customerId ?? null,
        }}
        onSave={handleProjectSave}
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
            <div className="flex items-center justify-between gap-2 border-b-2 border-gray-100 pb-0">
              <TabsList className="h-10 min-h-0 flex-1 justify-start gap-0 overflow-x-auto whitespace-nowrap rounded-none border-0 bg-transparent p-0">
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
                    className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-text-secondary data-[state=active]:border-[#111827] data-[state=active]:text-text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-[14px]"
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
                    className="btn-outline-ghost h-9 shrink-0 px-2 text-[13px] text-text-secondary hover:text-text-primary"
                  >
                    More ▾
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Cost
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("expenses");
                    }}
                  >
                    Expenses
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("labor");
                    }}
                  >
                    Labor
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("bills");
                    }}
                  >
                    Bills
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("subcontracts");
                    }}
                  >
                    Subcontracts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Project
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("budget");
                    }}
                  >
                    Budget
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("change-orders");
                    }}
                  >
                    Change Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("materials");
                    }}
                  >
                    Material Selections
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Activity
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("activity");
                    }}
                  >
                    Activity
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("punch-list");
                    }}
                  >
                    Punch List
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Final
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setTab("closeout");
                    }}
                  >
                    Closeout
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
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
                className="cursor-pointer rounded-xl border border-border/60 bg-white px-4 py-4 outline-none transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                  />
                  <span className="text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline">
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
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {cell.label}
                      </p>
                      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-text-primary">
                        {fmtMoney(cell.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* B. Alerts */}
              <div className="rounded-xl border border-border/60 bg-white px-4 py-4">
                <SectionHeader
                  label="Alerts / issues"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                />
                <Divider />
                <ul className="mt-3 divide-y divide-border/60 text-[13px]">
                  <li className="py-0">
                    <Link
                      href={inboxProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm py-2.5 text-text-primary outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <span>Needs review expenses</span>
                      <span className="tabular-nums text-muted-foreground">
                        {projectCost.alerts.needsReviewCount}
                        <span className="ml-2 text-[12px] font-medium text-foreground">
                          Inbox →
                        </span>
                      </span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={expensesProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm py-2.5 text-text-primary outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <span>Missing receipt</span>
                      <span className="tabular-nums text-muted-foreground">
                        {projectCost.alerts.missingReceiptCount}
                        <span className="ml-2 text-[12px] font-medium text-foreground">
                          Expenses →
                        </span>
                      </span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={inboxProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm py-2.5 text-text-primary outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <span>Duplicate expenses</span>
                      <span className="text-[12px] font-medium text-muted-foreground">Inbox →</span>
                    </Link>
                  </li>
                  <li className="py-0">
                    <Link
                      href={expensesProjectHref}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm py-2.5 text-text-primary outline-none ring-offset-background hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      <span>Missing project / category</span>
                      <span className="tabular-nums text-muted-foreground">
                        {projectCost.alerts.missingClassificationCount}
                        <span className="ml-2 text-[12px] font-medium text-foreground">
                          Expenses →
                        </span>
                      </span>
                    </Link>
                  </li>
                </ul>
              </div>

              {/* C. Recent costs (done only, max 5) */}
              <div className="rounded-xl border border-border/60 bg-white px-4 py-4">
                <SectionHeader
                  label="Recent costs"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                />
                <Divider />
                <div className="mt-2">
                  {recentExpenseLines.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No recorded costs yet.
                    </p>
                  ) : (
                    <RecentExpenseLines rows={recentExpenseLines} />
                  )}
                </div>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={goToCostTab}
                    className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    View all costs →
                  </button>
                </div>
              </div>

              {/* D. Quick actions */}
              <div className="rounded-xl border border-border/60 bg-white px-4 py-4">
                <SectionHeader
                  label="Quick actions"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
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
              <div className="rounded-xl border border-border/60 bg-white px-4 py-4">
                <SectionHeader
                  label="Project context"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                />
                <Divider />
                <div className="mt-2 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted-foreground">Client</span>
                    <span className="truncate text-right font-medium text-text-primary">
                      {displayProject.client ??
                        (displayProject as { client_name?: string }).client_name ??
                        "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted-foreground">Contract value</span>
                    <span className="tabular-nums text-right font-medium text-text-primary">
                      {fmtMoney(canonicalProfit.revenue)}
                    </span>
                  </div>
                  {financialSummary ? (
                    <>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-muted-foreground">Collected</span>
                        <span className="tabular-nums text-right text-text-primary">
                          {fmtMoney(financialSummary.collected)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-muted-foreground">AR outstanding</span>
                        <span className="tabular-nums text-right text-text-primary">
                          {fmtMoney(financialSummary.outstanding)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
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
                className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
              />
              <Divider />
              {scheduleItems.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No schedule milestones for this project.
                </p>
              ) : (
                <>
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Title
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Start
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              End
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
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
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
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
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                />
                <Divider />
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {(
                    [
                      {
                        key: "total" as const,
                        label: "Total cost",
                        value: projectCost.breakdown.totalCost,
                      },
                      {
                        key: "materials" as const,
                        label: "Materials",
                        value: projectCost.breakdown.materials,
                      },
                      { key: "labor" as const, label: "Labor", value: projectCost.breakdown.labor },
                      {
                        key: "bills" as const,
                        label: "Bills / Subcontracts",
                        value: projectCost.breakdown.bills,
                      },
                      { key: "other" as const, label: "Other", value: projectCost.breakdown.other },
                    ] as const
                  ).map((cell) => {
                    const active =
                      cell.key === "total"
                        ? costBucketFilter === null
                        : costBucketFilter === cell.key;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => pickBreakdown(cell.key)}
                        className={cn(
                          "rounded-xl border border-border/60 bg-white px-3 py-3 text-left transition-colors",
                          active ? "ring-1 ring-foreground/20 bg-muted/20" : "hover:bg-muted/10"
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {cell.label}
                        </p>
                        <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-text-primary">
                          {fmtMoney(cell.value)}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Spent = confirmed expense lines (done, reviewed, approved, paid) on this project +
                  labor + approved subcontract bills + paid reimbursements. Click a card to filter
                  the table; Total clears the filter.
                </p>
              </div>

              <div>
                <SectionHeader
                  label="Cost detail"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
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

              <div className="border-t border-border/60 pt-6">
                <SectionHeader
                  label="Invoicing"
                  className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
                />
                <Divider />
                <p className="mt-1 text-sm text-muted-foreground">
                  Invoiced {fmtMoney(billingSummary.invoicedTotal)} · Collected{" "}
                  {fmtMoney(billingSummary.paidTotal)} · AR balance{" "}
                  {fmtMoney(billingSummary.arBalance)}
                </p>
                {projectInvoices.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    No invoices for this project.
                  </p>
                ) : (
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-3 overflow-hidden rounded-xl border border-border/60 bg-white">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Invoice
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Issue date
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Status
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                              Total
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
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
                                  className="font-medium text-foreground hover:underline"
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
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              <div className="mt-2">
                <RecentExpenseLines rows={expenseLineRows} />
              </div>
              <div className="mt-3">
                <Link
                  href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  View all expenses →
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="budget" className={TAB_PANEL}>
              <SectionHeader
                label="Budget"
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {budgetItems.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No budget items for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Cost code
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {activityLogs.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No activity for this project.</p>
              ) : (
                <ul className="space-y-2 py-2">
                  {activityLogs.map((log) => (
                    <li key={log.id} className="text-sm border-b border-border/30 pb-2">
                      <span className="text-muted-foreground">
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {changeOrders.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No change orders for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Number
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Status
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeOrders.map((co) => (
                          <tr key={co.id} className={listTableRowStaticClassName}>
                            <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                              {co.number ?? "—"}
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
              <div className="rounded-lg bg-page p-4 sm:p-5">
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {subcontracts.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No subcontracts for this project.
                </p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Subcontractor
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {bills.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No bills for this project.</p>
              ) : (
                <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                  <div className="airtable-table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Vendor
                          </th>
                          <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                            Bill no
                          </th>
                          <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
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
                className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium"
              />
              <Divider />
              {laborEntries.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No labor entries for this project.
                </p>
              ) : (
                <>
                  <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
                    <div className="airtable-table-scroll">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Worker
                            </th>
                            <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                              Date
                            </th>
                            <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
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
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
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
