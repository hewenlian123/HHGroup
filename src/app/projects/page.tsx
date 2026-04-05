import { getProjects } from "@/lib/data";
import { getCanonicalProjectProfitBatch } from "@/lib/profit-engine";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { ProjectsListClient, type ProjectsListRow } from "./projects-list-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let dataLoadWarning: string | null = null;
  try {
    projects = await getProjects();
  } catch (e) {
    logServerPageDataError("projects", e);
    dataLoadWarning = serverDataLoadWarning(e, "projects");
  }
  const profitMap = await getCanonicalProjectProfitBatch(projects.map((p) => p.id)).catch(
    () => new Map()
  );

  const rows: ProjectsListRow[] = projects.map((p) => {
    const c = profitMap.get(p.id);
    const revenue = c?.revenue ?? 0;
    const laborCost = c?.laborCost ?? 0;
    const expenseCost = c?.expenseCost ?? 0;
    const subcontractCost = c?.subcontractCost ?? 0;
    const totalCost = c?.actualCost ?? laborCost + expenseCost + subcontractCost;
    /** Canonical profit (revenue − labor − expenses − subcontract); same as profit-engine. */
    const profit = c?.profit ?? revenue - totalCost;
    const updatedRaw = p.updated ?? p.updated_at ?? "";
    const updatedAt =
      typeof updatedRaw === "string" && updatedRaw.length >= 10 ? updatedRaw.slice(0, 10) : "—";

    return {
      id: p.id,
      name: p.name,
      clientName: p.client ?? null,
      status: p.status,
      budget: p.budget ?? 0,
      revenue,
      laborCost,
      profit,
      updatedAt,
    };
  });

  return (
    <div className="min-h-full bg-page">
      <ProjectsListClient rows={rows} dataLoadWarning={dataLoadWarning} />
    </div>
  );
}
