import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { PermissionDenied } from "@/components/ui/system-state";
import { getReportDateRange, getReportsData, normalizeReportsTab } from "@/lib/reports-db";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const range = getReportDateRange({
    period: searchParams?.period,
    from: searchParams?.from,
    to: searchParams?.to,
  });
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) return <PermissionDenied description={guard.error} />;
  const scalar = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  if (searchParams?.asOf !== undefined)
    return (
      <div className="page-container py-6">
        <h1>AR / AP as of {scalar(searchParams.asOf) || "requested date"}</h1>
        <p role="status">
          UNAVAILABLE WITH CURRENT DATA. Invoice and bill issue/payment dates exist, but dated void,
          edit and reversal history is incomplete. Current balances cannot establish a historical
          balance.
        </p>
      </div>
    );
  let data;
  try {
    data = await getReportsData(range, guard.client, {
      projectId: scalar(searchParams?.projectId),
      customerId: scalar(searchParams?.customerId),
      dueFrom: scalar(searchParams?.dueFrom),
      dueTo: scalar(searchParams?.dueTo),
    });
  } catch {
    return <FinanceUnavailable title="Reports unavailable" />;
  }
  const activeTab = normalizeReportsTab(searchParams?.tab);

  return <ReportsClient data={data} activeTab={activeTab} />;
}
