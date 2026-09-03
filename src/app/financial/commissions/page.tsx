import { getCommissionSummary, getAllCommissionsWithPayments, getProjects } from "@/lib/data";
import { authorizedAppRole } from "@/lib/auth-role";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CommissionsClient } from "./commissions-client";

export const dynamic = "force-dynamic";

export default async function CommissionPaymentsPage() {
  const supabase = await createServerSupabaseClient({ noStore: true });
  if (!supabase) throw new FinancialDataUnavailableError("commission session", null);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new FinancialDataUnavailableError("commission session", authError);
  if (!user || !authorizedAppRole(user)) {
    throw new FinancialDataUnavailableError("commission session", {
      code: "42501",
      message: "Owner or admin authentication required.",
    });
  }

  const [summary, commissions, projects] = await Promise.all([
    getCommissionSummary(supabase),
    getAllCommissionsWithPayments(supabase),
    getProjects(supabase),
  ]);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const rows = commissions.map((c) => ({
    ...c,
    project_name: projectNameById.get(c.project_id) ?? "",
  }));
  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name ?? "Untitled project",
  }));

  return (
    <CommissionsClient
      summary={summary}
      rows={rows}
      projectOptions={projectOptions}
      loadError={null}
    />
  );
}
