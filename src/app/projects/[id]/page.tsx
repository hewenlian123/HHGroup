import { notFound } from "next/navigation";
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
  getApBillsByProject,
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
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { getProjectCostDashboard } from "@/lib/project-cost-dashboard";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { ProjectDetailTabsClient } from "./project-detail-tabs-client";
import type { RecentExpenseLineRow } from "./recent-expense-lines";

export const dynamic = "force-dynamic";

const LEGACY_TAB_MAP: Record<string, string> = {
  financial: "cost",
  documents: "docs",
};

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
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const rawTab = (firstSearchParam(sp.tab) ?? "overview").toString().toLowerCase();
  const showFinancialSnapshotComparison = firstSearchParam(sp.debugFinancial) === "1";
  const tabParam = LEGACY_TAB_MAP[rawTab] ?? rawTab;
  const validTabs: TabKey[] = [
    "overview",
    "cost",
    "tasks",
    "schedule",
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
  try {
    project = internalSupabase
      ? ((await getProjectByIdWithClient(internalSupabase, id)) ?? undefined)
      : await getProjectById(id);
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

  /** Wrap a fetch in try/catch so missing tables or other DB errors don't crash the page. */
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const [
    canonical,
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
    costDashboard,
  ] = await Promise.all([
    safe(() => getCanonicalProjectProfit(id), {
      revenue: 0,
      actualCost: 0,
      profit: 0,
      margin: 0,
      budget: 0,
      approvedChangeOrders: 0,
      laborCost: 0,
      expenseCost: 0,
      subcontractCost: 0,
    }),
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
    safe(() => getApBillsByProject(id), []),
    safe(() => getActivityLogsByProject(id, 20), []),
    safe(() => getChangeOrdersByProject(id), []),
    safe(() => getProjectBudgetItems(id), []),
    safe(() => getCloseoutPunch(id), null),
    safe(() => getCloseoutWarranty(id), null),
    safe(() => getCloseoutCompletion(id), null),
    safe(() => getProjectSchedule(id), []),
    safe(() => getInvoicesWithDerived({ projectId: id }), []),
    safe(() => getEstimateList(), []),
    safe(() => getProjectCostDashboard(id), {
      breakdown: { totalCost: 0, materials: 0, labor: 0, bills: 0, other: 0 },
      spentTotal: 0,
      profit: 0,
      margin: 0,
      revenue: 0,
      doneCostRows: [],
      recentDoneRows: [],
      allExpenseLineRows: [],
      alerts: { needsReviewCount: 0, missingReceiptCount: 0, missingClassificationCount: 0 },
    }),
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
