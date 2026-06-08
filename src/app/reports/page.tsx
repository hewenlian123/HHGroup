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
  const data = await getReportsData(range);
  const activeTab = normalizeReportsTab(searchParams?.tab);

  return <ReportsClient data={data} activeTab={activeTab} />;
}
