import { FinanceContextBack } from "@/components/financial/finance-context-back";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { PermissionDenied } from "@/components/ui/system-state";
import Link from "next/link";
import { getReportsData, getReportDateRange } from "@/lib/reports-db";
import { financePathWithReturn, financeWorkspacePath } from "@/lib/finance-navigation";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function CompanyFinancialDashboardPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  let d: Awaited<ReturnType<typeof getReportsData>>;
  try {
    d = await getReportsData(getReportDateRange({ period: "all-time" }), guard.client);
  } catch {
    return <FinanceUnavailable title="Portfolio summary unavailable" />;
  }

  const metrics = d.monthly.kpis
    .filter((k) =>
      [
        "projectBudget",
        "projectCost",
        "invoicedRevenue",
        "cashCollected",
        "projectProfit",
        "billsAp",
      ].includes(k.key)
    )
    .map((k) => ({
      label: k.label,
      value: k.value,
      positiveGood: k.key === "projectProfit" ? true : undefined,
      href: financePathWithReturn(
        `/reports?period=all-time&metric=${k.key}`,
        financeWorkspacePath("/financial/dashboard", searchParams)
      ),
    }));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Company Financial Dashboard"
          description="Legacy read-only Portfolio. All-time metrics are available in Overview and Reports. READY TO DEPRECATE; bookmarks and return context remain supported."
          actions={
            <>
              <FinanceContextBack />
              <Link
                prefetch={false}
                href="/financial"
                className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-text-secondary hover:text-[#111111]"
              >
                Financial
              </Link>
            </>
          }
        />
      }
    >
      {[d.projectReviewWarning, ...(d.warnings || [])].filter(Boolean).length > 0 ? (
        <p role="status">
          {[d.projectReviewWarning, ...(d.warnings || [])].filter(Boolean).join(" ")}
        </p>
      ) : null}
      <SectionHeader label="Metrics" />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {metrics.map((m) => (
          <Link href={m.href} key={m.label} className="kpi-metric">
            <span className="kpi-metric-label">{m.label}</span>
            <span
              className={cn(
                "kpi-metric-value mt-0.5 block",
                m.positiveGood !== undefined &&
                  (m.value >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400")
              )}
            >
              {formatCurrency(m.value)}
            </span>
          </Link>
        ))}
      </div>
    </PageLayout>
  );
}
