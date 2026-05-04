import { PageLayout, PageHeader, SectionHeader } from "@/components/base";

export default function FinanceOwnerDashboardLoading() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Finance dashboard"
          description="This month performance, project profitability, and cash movement."
        />
      }
    >
      <SectionHeader label="This month" />
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="kpi-metric animate-pulse">
            <span className="kpi-metric-label block h-3 w-24 rounded bg-muted/60" />
            <span className="mt-2 block h-7 w-28 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
