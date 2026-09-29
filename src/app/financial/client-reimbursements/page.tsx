import "../expenses/expenses-ui-theme.css";
import { PermissionDenied } from "@/components/ui/system-state";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadClientReimbursements } from "@/lib/client-reimbursement-db";
import { logServerPageDataError } from "@/lib/server-load-warning";
import { ExpenseOperationsWorkspaceNav } from "@/components/financial/expense-operations-workspace-nav";
import { ClientReimbursementsClient } from "./client-reimbursements-client";

export const dynamic = "force-dynamic";

export default async function ClientReimbursementsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project_id?: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) {
    return (
      <div className="hh-list-frame py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  }
  const projectId = (await searchParams)?.project_id?.trim() || undefined;
  try {
    const list = await loadClientReimbursements(guard.client, { projectId });
    const payments = await guard.client
      .from("payments_received")
      .select("id, payment_date, amount, customer_name, project_id")
      .order("payment_date", { ascending: false })
      .limit(40);
    return (
      <div className="expenses-ui">
        <div className="expenses-ui-content expenses-page-shell">
          <ExpenseOperationsWorkspaceNav />
          <ClientReimbursementsClient
            rows={list.rows}
            outstanding={list.outstanding}
            lockedProjectId={projectId}
            paymentsUnavailable={Boolean(payments.error)}
            payments={
              payments.error
                ? []
                : ((payments.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
                    id: String(row.id),
                    projectId: typeof row.project_id === "string" ? row.project_id : null,
                    label: `${String(row.payment_date ?? "").slice(0, 10)} ${String(row.customer_name ?? "Payment")} $${Number(row.amount ?? 0).toFixed(2)}`,
                  }))
            }
          />
        </div>
      </div>
    );
  } catch (error) {
    logServerPageDataError("financial/client-reimbursements", error);
    return <FinanceUnavailable title="Client reimbursements unavailable" />;
  }
}
