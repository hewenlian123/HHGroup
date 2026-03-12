import { getCommissionSummary, getAllCommissionsWithPayments, getProjects } from "@/lib/data";
import { CommissionsClient } from "./commissions-client";

export const dynamic = "force-dynamic";

export default async function CommissionPaymentsPage() {
  const [summary, commissions, projects] = await Promise.all([
    getCommissionSummary(),
    getAllCommissionsWithPayments(),
    getProjects(),
  ]);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const rows = commissions.map((c) => ({
    ...c,
    project_name: projectNameById.get(c.project_id) ?? "",
  }));
  return <CommissionsClient summary={summary} rows={rows} />;
}
