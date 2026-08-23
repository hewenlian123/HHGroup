import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import {
  getProjectById,
  getProjectBillingSummary,
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
  getInvoicesWithDerived,
  getEstimateList,
} from "@/lib/data";
import { getApBillsByProject } from "@/lib/ap-bills-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { getProjectCostDashboard } from "@/lib/project-cost-dashboard";
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
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

type ProjectDetailSearchParams = {
  tab?: string | string[];
  debugFinancial?: string | string[];
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<ProjectDetailSearchParams>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
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
  const internalSupabase = getServerSupabaseInternalNoStore();

  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  let projectSupabase: Awaited<ReturnType<typeof createServerSupabaseClient>> = null;
  try {
    projectSupabase = await createServerSupabaseClient({ noStore: true });
    if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
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
  if (!projectSupabase) notFound();

  let canonical: Awaited<ReturnType<typeof getCanonicalProjectProfit>>;
  let costDashboard: Awaited<ReturnType<typeof getProjectCostDashboard>>;
  try {
    [canonical, costDashboard] = await Promise.all([
      getCanonicalProjectProfit(id, projectSupabase),
      getProjectCostDashboard(id, projectSupabase),
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

  /** Wrap a fetch in try/catch so missing tables or other DB errors don't crash the page. */
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const [
    billingSummary,
    tasks,
    workers,
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
    scheduleItems,
    projectInvoicesRaw,
    estimatesRaw,
  ] = await Promise.all([
    safe(() => getProjectBillingSummary(id), {
      paidTotal: 0,
      invoicedTotal: 0,
      arBalance: 0,
      lastPaymentDate: null,
    }),
    safe(() => getProjectTasks(id), []),
    safe(() => getWorkers(), []),
    safe(
      () =>
        internalSupabase
          ? getLaborEntriesWithJoins({ project_id: id }, internalSupabase)
          : getLaborEntriesWithJoins({ project_id: id }),
      []
    ),
    safe(() => getDocumentsByProject(id), []),
    (async () => {
      try {
        return await getCommissionsWithPaidByProject(id);
      } catch (e) {
        logServerPageDataError(`projects/${id}/commissions`, e);
        return [];
      }
    })(),
    safe(() => getSelectionsByProject(id), []),
    safe(() => getMaterialCatalog(), []),
    safe(() => getPunchListByProject(id), []),
    safe(() => getSubcontractsByProject(id), []),
    safe(
      () =>
        internalSupabase ? getApBillsByProject(id, internalSupabase) : getApBillsByProject(id),
      []
    ),
    safe(() => getActivityLogsByProject(id, 20), []),
    safe(() => getChangeOrdersByProject(id, projectSupabase), []),
    safe(() => getProjectBudgetItems(id), []),
    safe(() => getCloseoutPunch(id), null),
    safe(() => getCloseoutWarranty(id), null),
    safe(() => getCloseoutCompletion(id), null),
    safe(() => getProjectSchedule(id), []),
    safe(() => getInvoicesWithDerived({ projectId: id }), []),
    safe(() => getEstimateList(projectSupabase), []),
  ]);

  const recentExpenseLines: RecentExpenseLineRow[] = costDashboard.recentDoneRows.map((r) => ({
    id: r.lineId,
    expenseId: r.expenseId,
    date: r.date,
    vendorName: r.vendorName,
    category: r.category,
    memo: r.memo,
    amount: r.amount,
  }));

  const expenseLineRowsAll: RecentExpenseLineRow[] = costDashboard.allExpenseLineRows.map((r) => ({
    id: r.id,
    expenseId: r.expenseId,
    date: r.date,
    vendorName: r.vendorName,
    category: r.category,
    memo: r.memo,
    amount: r.amount,
  }));

  const projectInvoices = (projectInvoicesRaw ?? []).filter((i) => i.computedStatus !== "Void");
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

  return (
    <ProjectDetailTabsClient
      projectId={id}
      project={project}
      financialSummary={financialSummary}
      billingSummary={billingSummary}
      canonicalProfit={canonical}
      projectCost={costDashboard}
      showFinancialSnapshotComparison={showFinancialSnapshotComparison}
      initialTab={tab}
      tasks={tasks ?? []}
      workers={workers ?? []}
      recentExpenseLines={recentExpenseLines}
      expenseLineRows={expenseLineRowsAll}
      scheduleItems={scheduleItems ?? []}
      projectInvoices={projectInvoices}
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
