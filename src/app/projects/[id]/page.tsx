import { authorizedAppRole } from "@/lib/auth-role";
import { hasCompanyAdministratorMembership } from "@/lib/organization-membership";
import { normalizeWorkspaceTab } from "@/lib/navigation/project-workspace";
import { notFound } from "next/navigation";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import {
  getProjectById,
  getDocumentsByProject,
  getCommissionsWithPaidByProject,
  getSubcontractsByProject,
  getActivityLogsByProject,
  getChangeOrdersByProject,
  getProjectBudgetItems,
  getCloseoutPunch,
  getCloseoutWarranty,
  getCloseoutCompletion,
  getEstimateList,
} from "@/lib/data";
import { getApBillsByProject } from "@/lib/ap-bills-db";
import { getLaborEntriesWithJoins } from "@/lib/daily-labor-db";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import { getProjectCostDashboard } from "@/lib/project-cost-dashboard";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { loadProjectInvoiceReadModel } from "@/lib/financial/invoice-read-model";
import {
  listUnappliedPaymentsForProject,
  type UnappliedPaymentListItem,
} from "@/lib/payments-received-db";
import { emitRscTiming } from "@/lib/performance/server-timing";
import { ProjectDetailTabsClient } from "./project-detail-tabs-client";
import type { RecentExpenseLineRow } from "./recent-expense-lines";

export const dynamic = "force-dynamic";

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
  const pageStartedAt = performance.now();
  const authStartedAt = performance.now();
  const { id } = await params;
  const guard = await requireOrganizationServerActionClient({ projectId: id, noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();
  const serverDataStartedAt = performance.now();
  const projectSupabase = guard.client;
  const canManageProject =
    guard.context.organizationRole === "owner" || guard.context.organizationRole === "admin";
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  let isCompanyAdmin = false;
  let sp: ProjectDetailSearchParams = {};
  try {
    const [loadedProject, admin, resolvedSearch] = await Promise.all([
      getProjectById(id, projectSupabase),
      canManageProject
        ? hasCompanyAdministratorMembership(guard.client, guard.context.user).catch(() => false)
        : Promise.resolve(false),
      searchParams ?? Promise.resolve({} as ProjectDetailSearchParams),
    ]);
    project = loadedProject;
    isCompanyAdmin = admin;
    sp = resolvedSearch ?? {};
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
  const canViewFinancials =
    canManageProject && authorizedAppRole(guard.context.user) !== null && isCompanyAdmin;
  let financialDataWarning: string | null = canViewFinancials
    ? null
    : "Financial and billing data is unavailable for this membership.";
  const rawTab = (firstSearchParam(sp.tab) ?? "overview").toString().toLowerCase();
  const showFinancialSnapshotComparison = firstSearchParam(sp.debugFinancial) === "1";
  const tab = rawTab;
  const workspaceTab = normalizeWorkspaceTab(tab);

  const [profitRead, invoiceRead, unappliedRead, workspaceRead] = await Promise.all([
    canViewFinancials
      ? (async () => {
          try {
            const canonicalPromise = getCanonicalProjectProfit(id, projectSupabase);
            const [canonical, costDashboard] = await Promise.all([
              canonicalPromise,
              getProjectCostDashboard(id, projectSupabase, canonicalPromise),
            ]);
            return { canonical, costDashboard, warning: null as string | null };
          } catch (error) {
            logServerPageDataError(`projects/${id}/financial`, error);
            return {
              canonical: null,
              costDashboard: null,
              warning: serverDataLoadWarning(error, "project financial data"),
            };
          }
        })()
      : Promise.resolve({
          canonical: null,
          costDashboard: null,
          warning: null as string | null,
        }),
    canViewFinancials
      ? loadProjectInvoiceReadModel(id, projectSupabase)
          .then((invoiceModel) => ({ invoiceModel, warning: null as string | null }))
          .catch((error: unknown) => {
            logServerPageDataError(`projects/${id}/billing`, error);
            return {
              invoiceModel: null,
              warning: serverDataLoadWarning(error, "project billing data"),
            };
          })
      : Promise.resolve({ invoiceModel: null, warning: null as string | null }),
    canViewFinancials && workspaceTab === "financial"
      ? listUnappliedPaymentsForProject(id, projectSupabase)
          .then((unappliedPayments) => ({
            unappliedPayments,
            error: null as string | null,
          }))
          .catch((error: unknown) => {
            logServerPageDataError(`projects/${id}/unapplied-payments`, error);
            return {
              unappliedPayments: [] as UnappliedPaymentListItem[],
              error: serverDataLoadWarning(error, "unapplied payments"),
            };
          })
      : Promise.resolve({
          unappliedPayments: [] as UnappliedPaymentListItem[],
          error: null as string | null,
        }),
    (async () => {
      let laborEntries: Awaited<ReturnType<typeof getLaborEntriesWithJoins>> = [];
      let documents: Awaited<ReturnType<typeof getDocumentsByProject>> = [];
      let commissions: Awaited<ReturnType<typeof getCommissionsWithPaidByProject>> = [];
      let subcontracts: Awaited<ReturnType<typeof getSubcontractsByProject>> = [];
      let bills: Awaited<ReturnType<typeof getApBillsByProject>> = [];
      let activityLogs: Awaited<ReturnType<typeof getActivityLogsByProject>> = [];
      let changeOrders: Awaited<ReturnType<typeof getChangeOrdersByProject>> = [];
      let closeoutPunch: Awaited<ReturnType<typeof getCloseoutPunch>> = null;
      let closeoutWarranty: Awaited<ReturnType<typeof getCloseoutWarranty>> = null;
      let closeoutCompletion: Awaited<ReturnType<typeof getCloseoutCompletion>> = null;
      let estimatesRaw: Awaited<ReturnType<typeof getEstimateList>> = [];
      const snapshot = () => ({
        laborEntries,
        documents,
        commissions,
        subcontracts,
        bills,
        activityLogs,
        changeOrders,
        closeoutPunch,
        closeoutWarranty,
        closeoutCompletion,
        estimatesRaw,
      });
      try {
        switch (workspaceTab) {
          case "overview": {
            const [logs, orders] = await Promise.all([
              getActivityLogsByProject(id, 20, projectSupabase),
              canViewFinancials
                ? getChangeOrdersByProject(id, projectSupabase).catch((error: unknown) => {
                    logServerPageDataError(`projects/${id}/overview/change-orders`, error);
                    return [] as Awaited<ReturnType<typeof getChangeOrdersByProject>>;
                  })
                : Promise.resolve([] as Awaited<ReturnType<typeof getChangeOrdersByProject>>),
            ]);
            activityLogs = logs;
            changeOrders = orders;
            break;
          }
          case "financial":
            if (canViewFinancials) {
              [commissions, bills, estimatesRaw] = await Promise.all([
                getCommissionsWithPaidByProject(id, projectSupabase),
                getApBillsByProject(id, projectSupabase),
                getEstimateList(projectSupabase),
              ]);
            }
            break;
          case "change-orders":
            if (canViewFinancials) {
              changeOrders = await getChangeOrdersByProject(id, projectSupabase);
            }
            break;
          case "people":
            if (canViewFinancials) {
              [laborEntries, subcontracts, bills, commissions] = await Promise.all([
                getLaborEntriesWithJoins({ project_id: id }, projectSupabase),
                getSubcontractsByProject(id, projectSupabase),
                getApBillsByProject(id, projectSupabase),
                getCommissionsWithPaidByProject(id, projectSupabase),
              ]);
            }
            break;
          case "documents":
            documents = await getDocumentsByProject(id, projectSupabase);
            break;
          case "closeout":
            if (canViewFinancials) {
              [closeoutPunch, closeoutWarranty, closeoutCompletion] = await Promise.all([
                getCloseoutPunch(id, projectSupabase),
                getCloseoutWarranty(id, projectSupabase),
                getCloseoutCompletion(id, projectSupabase),
              ]);
            }
            break;
        }
        return { ...snapshot(), warning: null as string | null, fatal: null as unknown };
      } catch (error) {
        logServerPageDataError(`projects/${id}/workspace/${workspaceTab}`, error);
        if (["financial", "people", "change-orders", "closeout"].includes(workspaceTab)) {
          return {
            ...snapshot(),
            warning: serverDataLoadWarning(error, "project workspace financial data"),
            fatal: null as unknown,
          };
        }
        return { ...snapshot(), warning: null as string | null, fatal: error };
      }
    })(),
  ]);
  if (workspaceRead.fatal) {
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(workspaceRead.fatal, "project workspace data")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  financialDataWarning =
    workspaceRead.warning ?? invoiceRead.warning ?? profitRead.warning ?? financialDataWarning;
  const canonical = profitRead.canonical;
  const costDashboard = profitRead.costDashboard;
  const invoiceModel = invoiceRead.invoiceModel;
  const unappliedPayments = unappliedRead.unappliedPayments;
  const unappliedPaymentsError = unappliedRead.error;
  const {
    laborEntries,
    documents,
    commissions,
    subcontracts,
    bills,
    activityLogs,
    changeOrders,
    closeoutPunch,
    closeoutWarranty,
    closeoutCompletion,
    estimatesRaw,
  } = workspaceRead;
  const budgetItems: Awaited<ReturnType<typeof getProjectBudgetItems>> = [];
  const serverDataCompletedAt = performance.now();

  const billingSummary = invoiceModel?.billingSummary ?? null;
  const projectInvoices = invoiceModel?.projectInvoices ?? [];

  const recentExpenseLines: RecentExpenseLineRow[] = (costDashboard?.recentDoneRows ?? []).map(
    (r) => ({
      id: r.lineId,
      expenseId: r.expenseId,
      date: r.date,
      vendorName: r.vendorName,
      category: r.category,
      memo: r.memo,
      amount: r.amount,
    })
  );

  const sameText = (a: string | null | undefined, b: string | null | undefined) =>
    a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase();
  const relatedEstimates = (estimatesRaw ?? []).filter(
    (estimate) =>
      sameText(estimate.project, project.name) ||
      (project.client != null && sameText(estimate.client, project.client))
  );

  const financialSummary =
    costDashboard && billingSummary
      ? {
          budget: project.budget ?? 0,
          revenue: costDashboard.revenue,
          spent: costDashboard.spentTotal,
          profit: costDashboard.profit,
          marginPct: costDashboard.margin * 100,
          collected: billingSummary.paidTotal,
          outstanding: Math.max(0, billingSummary.invoicedTotal - billingSummary.paidTotal),
          cashflow: billingSummary.paidTotal - costDashboard.spentTotal,
        }
      : null;
  const projectCostForClient = costDashboard
    ? {
        breakdown: costDashboard.breakdown,
        spentTotal: costDashboard.spentTotal,
        profit: costDashboard.profit,
        margin: costDashboard.margin,
        revenue: costDashboard.revenue,
        doneCostRows: costDashboard.doneCostRows,
        recentDoneRows: costDashboard.recentDoneRows,
        alerts: costDashboard.alerts,
      }
    : null;

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
      financialDataWarning={financialDataWarning}
      canViewFinancials={canViewFinancials}
      canManageProject={canManageProject}
      billingSummary={billingSummary}
      canonicalProfit={canonical}
      projectCost={projectCostForClient}
      showFinancialSnapshotComparison={showFinancialSnapshotComparison}
      initialTab={workspaceTab}
      loadedWorkspaceTab={workspaceTab}
      recentExpenseLines={recentExpenseLines}
      expenseLineRows={[]}
      projectInvoices={projectInvoices}
      unappliedPayments={unappliedPayments}
      unappliedPaymentsError={unappliedPaymentsError}
      relatedEstimates={relatedEstimates}
      laborEntries={laborEntries ?? []}
      documents={documents ?? []}
      commissions={commissions ?? []}
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
