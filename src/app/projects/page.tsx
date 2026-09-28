import { getProjects } from "@/lib/data";
import { getCanonicalProjectProfitBatch, type CanonicalProjectProfit } from "@/lib/profit-engine";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import { authorizedAppRole } from "@/lib/auth-role";
import { emitRscTiming } from "@/lib/performance/server-timing";
import {
  ProjectsListClient,
  type ProjectListStatusFilter,
  type ProjectsListRow,
} from "./projects-list-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const pageStartedAt = performance.now();
  const sp = (await searchParams) ?? {};
  const statusParam = String(sp.status ?? "all")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const initialStatusFilter: ProjectListStatusFilter = [
    "all",
    "active",
    "completed",
    "pending",
    "on_hold",
  ].includes(statusParam)
    ? (statusParam as ProjectListStatusFilter)
    : "all";
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let dataLoadWarning: string | null = null;
  let financialDataWarning: string | null = null;
  const authStartedAt = performance.now();
  const guard = await requireOrganizationServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  const serverDataStartedAt = performance.now();
  const financeProjectIds = new Set<string>();
  const managedProjectIds = new Set<string>();
  let profitMap = new Map<string, CanonicalProjectProfit>();
  if (!guard.ok) {
    dataLoadWarning = guard.error;
  } else {
    try {
      projects = await getProjects(guard.client);
    } catch (error) {
      logServerPageDataError("projects", error);
      dataLoadWarning = serverDataLoadWarning(error, "projects");
    }
    if (projects.length > 0) {
      try {
        const scopes = await guard.client.from("projects").select("id,organization_id");
        if (scopes.error || !Array.isArray(scopes.data))
          throw new Error("Project permissions unavailable.");
        const managedOrganizations = new Set(
          guard.context.memberships
            .filter((member) => member.role === "owner" || member.role === "admin")
            .map((member) => member.organization_id)
        );
        for (const scope of scopes.data) {
          if (managedOrganizations.has(scope.organization_id)) {
            managedProjectIds.add(scope.id);
            if (authorizedAppRole(guard.context.user)) financeProjectIds.add(scope.id);
          }
        }
        if (financeProjectIds.size > 0)
          profitMap = await getCanonicalProjectProfitBatch([...financeProjectIds], guard.client);
      } catch (error) {
        logServerPageDataError("projects/financial", error);
        financialDataWarning = serverDataLoadWarning(error, "project financial data");
      }
      if (projects.some((project) => !profitMap.has(project.id)))
        financialDataWarning ??=
          "Financial data is unavailable for some projects. Authorized project records remain available.";
    }
  }
  const serverDataCompletedAt = performance.now();

  const rows: ProjectsListRow[] = projects.map((p): ProjectsListRow => {
    const c = profitMap.get(p.id);
    const revenue = c?.revenue ?? null;
    const laborCost = c?.laborCost ?? null;
    const expenseCost = c?.expenseCost ?? null;
    const totalCost = c?.actualCost ?? null;
    const profit = c?.profit ?? null;
    const updatedRaw = p.updated ?? p.updated_at ?? "";
    const updatedAt =
      typeof updatedRaw === "string" && updatedRaw.length >= 10 ? updatedRaw.slice(0, 10) : "—";

    return {
      id: p.id,
      name: p.name,
      clientName: p.client ?? null,
      status: p.status,
      budget: financeProjectIds.has(p.id) ? (p.budget ?? null) : null,
      revenue,
      actualCost: totalCost,
      expenseCost,
      laborCost,
      reimbursementCost: null,
      billedAmount: null,
      paidAmount: null,
      openAR: null,
      profit,
      marginPct: c ? (c.revenue > 0 ? (c.profit / c.revenue) * 100 : 0) : null,
      profitReadinessWarning: null,
      financialSource: c ? "legacy" : "unavailable",
      canViewFinancials: financeProjectIds.has(p.id),
      canManage: managedProjectIds.has(p.id),
      updatedAt,
    };
  });
  const rscPreparedAt = performance.now();
  emitRscTiming("projects", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <div className="min-h-full">
      <ProjectsListClient
        rows={rows}
        dataLoadWarning={dataLoadWarning}
        financialDataWarning={financialDataWarning}
        initialStatusFilter={initialStatusFilter}
      />
    </div>
  );
}
