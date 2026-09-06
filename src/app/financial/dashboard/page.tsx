import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { PermissionDenied } from "@/components/ui/system-state";
import Link from "next/link";
import { getCompanyFinancialDashboard } from "@/lib/data";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function CompanyFinancialDashboardPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  let d: Awaited<ReturnType<typeof getCompanyFinancialDashboard>>;
  try {
    d = await getCompanyFinancialDashboard(guard.client);
  } catch {
    return <FinanceUnavailable title="Portfolio summary unavailable" />;
  }

  const metrics: { label: string; value: number; positiveGood?: boolean }[] = [
    { label: "Budget", value: d.budget },
    { label: "Spent", value: d.spent },
    { label: "Revenue", value: d.revenue },
    { label: "Collected", value: d.collected },
    { label: "Profit", value: d.profit, positiveGood: true },
    { label: "Cashflow", value: d.cashflow, positiveGood: true },
  ];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Company Financial Dashboard"
          description="Portfolio totals: budget, spent, revenue, collected, profit, cashflow."
          actions={
            <Link
              prefetch={false}
              href="/financial"
              className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-text-secondary hover:text-[#111111]"
            >
              Financial
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Metrics" />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="kpi-metric">
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
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
