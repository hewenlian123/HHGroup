import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import {
  getProjectById,
  getProjectTasks,
  getWorkers,
  getDocumentsByProject,
  getCommissionsWithPaidByProject,
  getSelectionsByProject,
  getMaterialCatalog,
  getPunchListByProject,
  getSubcontractsByProject,
  getActivityLogsByProject,
  getChangeOrdersByProject,
  getProjectBudgetItems,
  getCloseoutPunch,
  getCloseoutWarranty,
  getCloseoutCompletion,
  getProjectSchedule,
  getEstimateList,
} from "@/lib/data";
import { getApBillsByProject } from "@/lib/ap-bills-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { getProjectCostDashboard } from "@/lib/project-cost-dashboard";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { loadProjectInvoiceReadModel } from "@/lib/financial/invoice-read-model";
import { emitRscTiming } from "@/lib/performance/server-timing";
import { ProjectDetailTabsClient } from "./project-detail-tabs-client";
import type { RecentExpenseLineRow } from "./recent-expense-lines";

export const dynamic = "force-dynamic";

const LEGACY_TAB_MAP: Record<string, string> = {
  cost: "financial",
  budget: "financial",
  expenses: "financial",
  labor: "financial",
  subcontracts: "financial",
  bills: "financial",
  commission: "financial",
  "change-orders": "financial",
  work: "tasks",
  "punch-list": "tasks",
  activity: "tasks",
  docs: "documents",
};

type TabKey =
  | "overview"
  | "financial"
  | "work"
  | "documents"
  | "cost"
  | "tasks"
  | "people"
  | "schedule"
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
  | "materials"
  | "closeout"
  | "commission"
  | "punch-list";

type WorkspaceTabKey =
  | "overview"
  | "financial"
  | "schedule"
  | "tasks"
  | "people"
  | "documents"
  | "photos"
  | "materials"
  | "inspections"
  | "closeout";

type ProjectDetailSearchParams = {
  tab?: string | string[];
  debugFinancial?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  if (tab === "tasks" || tab === "activity" || tab === "punch-list" || tab === "work") {
    return "tasks";
  }
  if (tab === "schedule") return "schedule";
  if (tab === "people") return "people";
  if (tab === "photos") return "photos";
  if (tab === "inspections") return "inspections";
  if (tab === "materials") return "materials";
  if (tab === "closeout") return "closeout";
  if (tab === "docs" || tab === "documents") return "documents";
  return "overview";
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<ProjectDetailSearchParams>;
}) {
  const pageStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();
  const serverDataStartedAt = performance.now();
  const projectSupabase = guard.client;
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const rawTab = (firstSearchParam(sp.tab) ?? "overview").toString().toLowerCase();
  const showFinancialSnapshotComparison = firstSearchParam(sp.debugFinancial) === "1";
  const tabParam = LEGACY_TAB_MAP[rawTab] ?? rawTab;
  const validTabs: TabKey[] = [
    "overview",
    "financial",
    "work",
    "documents",
    "cost",
    "tasks",
    "people",
    "schedule",
    "photos",
    "inspections",
    "docs",
    "budget",
    "expenses",
    "labor",
    "subcontracts",
    "bills",
    "activity",
    "change-orders",
    "materials",
    "closeout",
    "commission",
    "punch-list",
  ];
  const tab: TabKey = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : "overview";
  const workspaceTab = normalizeWorkspaceTab(tab);
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    project = await getProjectById(id, projectSupabase);
  } catch (e) {
    logServerPageDataError(`projects/${id}`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "project")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  if (!project) notFound();

  let canonical: Awaited<ReturnType<typeof getCanonicalProjectProfit>>;
  let costDashboard: Awaited<ReturnType<typeof getProjectCostDashboard>>;
  try {
    const canonicalPromise = getCanonicalProjectProfit(id, projectSupabase);
    [canonical, costDashboard] = await Promise.all([
      canonicalPromise,
      getProjectCostDashboard(id, projectSupabase, canonicalPromise),
    ]);
  } catch (e) {
    logServerPageDataError(`projects/${id}/financial`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "project financial data")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }

  let invoiceModel: Awaited<ReturnType<typeof loadProjectInvoiceReadModel>>;
  let tasks: Awaited<ReturnType<typeof getProjectTasks>> = [];
  let workers: Awaited<ReturnType<typeof getWorkers>> = [];
  let laborEntries: Awaited<ReturnType<typeof getLaborEntriesWithJoins>> = [];
  let documents: Awaited<ReturnType<typeof getDocumentsByProject>> = [];
  let commissions: Awaited<ReturnType<typeof getCommissionsWithPaidByProject>> = [];
  let materialSelections: Awaited<ReturnType<typeof getSelectionsByProject>> = [];
  let materialCatalog: Awaited<ReturnType<typeof getMaterialCatalog>> = [];
  let punchItems: Awaited<ReturnType<typeof getPunchListByProject>> = [];
  let subcontracts: Awaited<ReturnType<typeof getSubcontractsByProject>> = [];
  let bills: Awaited<ReturnType<typeof getApBillsByProject>> = [];
  let activityLogs: Awaited<ReturnType<typeof getActivityLogsByProject>> = [];
  const changeOrders: Awaited<ReturnType<typeof getChangeOrdersByProject>> = [];
  const budgetItems: Awaited<ReturnType<typeof getProjectBudgetItems>> = [];
  let closeoutPunch: Awaited<ReturnType<typeof getCloseoutPunch>> = null;
  let closeoutWarranty: Awaited<ReturnType<typeof getCloseoutWarranty>> = null;
  let closeoutCompletion: Awaited<ReturnType<typeof getCloseoutCompletion>> = null;
  let scheduleItems: Awaited<ReturnType<typeof getProjectSchedule>> = [];
  let estimatesRaw: Awaited<ReturnType<typeof getEstimateList>> = [];

  try {
    // Billing is shown in the persistent project header for every workspace tab.
    invoiceModel = await loadProjectInvoiceReadModel(id, projectSupabase);

    switch (workspaceTab) {
      case "overview":
        [tasks, scheduleItems, punchItems, activityLogs] = await Promise.all([
          getProjectTasks(id, projectSupabase),
          getProjectSchedule(id, projectSupabase),
          getPunchListByProject(id, projectSupabase),
          getActivityLogsByProject(id, 20, projectSupabase),
        ]);
        break;
      case "financial":
        [commissions, bills, estimatesRaw] = await Promise.all([
          getCommissionsWithPaidByProject(id, projectSupabase),
          getApBillsByProject(id, projectSupabase),
          getEstimateList(projectSupabase),
        ]);
        break;
      case "tasks":
        [tasks, workers, scheduleItems, punchItems, activityLogs] = await Promise.all([
          getProjectTasks(id, projectSupabase),
          getWorkers(projectSupabase),
          getProjectSchedule(id, projectSupabase),
          getPunchListByProject(id, projectSupabase),
          getActivityLogsByProject(id, 20, projectSupabase),
        ]);
        break;
      case "schedule":
        scheduleItems = await getProjectSchedule(id, projectSupabase);
        break;
      case "people":
        [tasks, laborEntries, subcontracts, bills, commissions] = await Promise.all([
          getProjectTasks(id, projectSupabase),
          getLaborEntriesWithJoins({ project_id: id }, projectSupabase),
          getSubcontractsByProject(id, projectSupabase),
          getApBillsByProject(id, projectSupabase),
          getCommissionsWithPaidByProject(id, projectSupabase),
        ]);
        break;
      case "documents":
        documents = await getDocumentsByProject(id, projectSupabase);
        break;
      case "materials":
        [materialSelections, materialCatalog] = await Promise.all([
          getSelectionsByProject(id, projectSupabase),
          getMaterialCatalog(projectSupabase),
        ]);
        break;
      case "closeout":
        [closeoutPunch, closeoutWarranty, closeoutCompletion] = await Promise.all([
          getCloseoutPunch(id, projectSupabase),
          getCloseoutWarranty(id, projectSupabase),
          getCloseoutCompletion(id, projectSupabase),
        ]);
        break;
      case "photos":
      case "inspections":
        break;
    }
  } catch (error) {
    logServerPageDataError(`projects/${id}/workspace/${workspaceTab}`, error);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(error, "project workspace data")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  const serverDataCompletedAt = performance.now();

  const billingSummary = invoiceModel.billingSummary;
  const projectInvoices = invoiceModel.projectInvoices;

  const recentExpenseLines: RecentExpenseLineRow[] = costDashboard.recentDoneRows.map((r) => ({
    id: r.lineId,
    expenseId: r.expenseId,
    date: r.date,
    vendorName: r.vendorName,
    category: r.category,
    memo: r.memo,
    amount: r.amount,
  }));

  const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase();
  const relatedEstimates = (estimatesRaw ?? []).filter(
    (estimate) =>
      sameText(estimate.project, project.name) ||
      (project.client != null && sameText(estimate.client, project.client))
  );

  const financialSummary = {
    budget: project.budget ?? 0,
    revenue: costDashboard.revenue,
    spent: costDashboard.spentTotal,
    profit: costDashboard.profit,
    marginPct: costDashboard.margin * 100,
    collected: billingSummary.paidTotal,
    outstanding: Math.max(0, billingSummary.invoicedTotal - billingSummary.paidTotal),
    cashflow: billingSummary.paidTotal - costDashboard.spentTotal,
  };
  const projectCostForClient = {
    breakdown: costDashboard.breakdown,
    spentTotal: costDashboard.spentTotal,
    profit: costDashboard.profit,
    margin: costDashboard.margin,
    revenue: costDashboard.revenue,
    doneCostRows: costDashboard.doneCostRows,
    recentDoneRows: costDashboard.recentDoneRows,
    alerts: costDashboard.alerts,
  };

  const rscPreparedAt = performance.now();
  emitRscTiming("projects/[id]", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <ProjectDetailTabsClient
      projectId={id}
      project={project}
      financialSummary={financialSummary}
      billingSummary={billingSummary}
      canonicalProfit={canonical}
      projectCost={projectCostForClient}
      showFinancialSnapshotComparison={showFinancialSnapshotComparison}
      initialTab={tab}
      loadedWorkspaceTab={workspaceTab}
      tasks={tasks ?? []}
      workers={workers ?? []}
      recentExpenseLines={recentExpenseLines}
      expenseLineRows={[]}
      scheduleItems={scheduleItems ?? []}
      projectInvoices={workspaceTab === "financial" ? projectInvoices : []}
      relatedEstimates={relatedEstimates}
      laborEntries={laborEntries ?? []}
      documents={documents ?? []}
      commissions={commissions ?? []}
      materialSelections={materialSelections ?? []}
      materialCatalog={materialCatalog ?? []}
      punchItems={punchItems ?? []}
      subcontracts={subcontracts ?? []}
      bills={bills ?? []}
      activityLogs={activityLogs ?? []}
      changeOrders={changeOrders ?? []}
      budgetItems={budgetItems ?? []}
      closeoutPunch={closeoutPunch ?? null}
      closeoutWarranty={closeoutWarranty ?? null}
      closeoutCompletion={closeoutCompletion ?? null}
    />
  );
}
