import { unstable_noStore } from "next/cache";
import { getProjects, getChangeOrdersByProject } from "@/lib/data";
import { ChangeOrdersView } from "./change-orders-view";

export const dynamic = "force-dynamic";

export default async function ChangeOrdersPage() {
  unstable_noStore();
  const projects = await getProjects();
  const allOrders = await Promise.all(
    projects.map(async (p) => ({
      project: { id: p.id, name: p.name },
      changeOrders: await getChangeOrdersByProject(p.id),
    }))
  );
  const grouped = allOrders.filter((g) => g.changeOrders.length > 0);

  return (
    <ChangeOrdersView
      projects={projects}
      grouped={grouped}
    />
  );
}
