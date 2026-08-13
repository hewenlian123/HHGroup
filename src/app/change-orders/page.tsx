import { unstable_noStore } from "next/cache";
import { getProjects, getChangeOrdersByProject } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ChangeOrdersView, type ProjectGroup } from "./change-orders-view";

export const dynamic = "force-dynamic";

export default async function ChangeOrdersPage() {
  unstable_noStore();
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let grouped: ProjectGroup[] = [];
  let dataLoadWarning: string | null = null;
  try {
    const projectSupabase = await createServerSupabaseClient({ noStore: true });
    if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
    projects = await getProjects(projectSupabase);
    const allOrders = await Promise.all(
      projects.map(async (p) => ({
        project: { id: p.id, name: p.name },
        changeOrders: await getChangeOrdersByProject(p.id, projectSupabase),
      }))
    );
    grouped = allOrders.filter((g) => g.changeOrders.length > 0);
  } catch (e) {
    logServerPageDataError("change-orders", e);
    dataLoadWarning = serverDataLoadWarning(e, "change orders");
  }

  return (
    <ChangeOrdersView projects={projects} grouped={grouped} dataLoadWarning={dataLoadWarning} />
  );
}
