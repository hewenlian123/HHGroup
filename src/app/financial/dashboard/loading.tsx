import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { Skeleton } from "@/components/ui/skeleton";

export default function FinancialDashboardLoading() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Company Financial Dashboard"
          description="Portfolio totals: budget, spent, revenue, collected, profit, cashflow."
        />
      }
    >
      <SectionHeader label="Metrics" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="kpi-metric">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
