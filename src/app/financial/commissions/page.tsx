import {
  getCommissionSummary,
  getAllCommissionsWithPayments,
  getProjects,
  summarizeCommissions,
} from "@/lib/data";
import { humanizeSupabaseRequestError } from "@/lib/supabase";
import { CommissionsClient } from "./commissions-client";

export const dynamic = "force-dynamic";

const emptySummary = {
  totalCommission: 0,
  paidCommission: 0,
  outstandingCommission: 0,
  thisMonthPaid: 0,
};

export default async function CommissionPaymentsPage() {
  const [sumRes, comRes, projRes] = await Promise.allSettled([
    getCommissionSummary(),
    getAllCommissionsWithPayments(),
    getProjects(),
  ]);

  const commissions = comRes.status === "fulfilled" ? comRes.value : [];
  const projects = projRes.status === "fulfilled" ? projRes.value : [];

  let summary = emptySummary;
  if (sumRes.status === "fulfilled") {
    summary = sumRes.value;
  } else if (commissions.length > 0) {
    summary = { ...summarizeCommissions(commissions), thisMonthPaid: 0 };
  }

  let loadError: string | null = null;
  if (comRes.status === "rejected") loadError = humanizeSupabaseRequestError(comRes.reason);
  else if (projRes.status === "rejected") loadError = humanizeSupabaseRequestError(projRes.reason);
  else if (sumRes.status === "rejected") loadError = humanizeSupabaseRequestError(sumRes.reason);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const rows = commissions.map((c) => ({
    ...c,
    project_name: projectNameById.get(c.project_id) ?? "",
  }));
  return <CommissionsClient summary={summary} rows={rows} loadError={loadError} />;
}
