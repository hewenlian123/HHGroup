import Link from "next/link";
import { getCompanyFinancialDashboard } from "@/lib/data";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

const EMPTY_DASHBOARD = {
  budget: 0,
  spent: 0,
  revenue: 0,
  collected: 0,
  profit: 0,
  cashflow: 0,
} as const;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function CompanyFinancialDashboardPage() {
  let d: Awaited<ReturnType<typeof getCompanyFinancialDashboard>> = { ...EMPTY_DASHBOARD };
  let dataLoadWarning: string | null = null;
  try {
    d = await getCompanyFinancialDashboard();
  } catch (e) {
    logServerPageDataError("financial/dashboard", e);
    dataLoadWarning = serverDataLoadWarning(e, "financial dashboard");
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
              href="/financial"
              className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm text-text-secondary hover:text-[#111111]"
            >
              Financial
            </Link>
          }
        />
      }
    >
      {dataLoadWarning ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      <SectionHeader label="Metrics" />
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="kpi-metric">
            <span className="kpi-metric-label">{m.label}</span>
            <span
              className={cn(
                "kpi-metric-value mt-0.5 block",
                m.positiveGood !== undefined &&
                  (m.value >= 0 ? "text-hh-profit-positive" : "text-red-600")
              )}
            >
              {m.value >= 0 ? "" : "−"}${fmtUsd(Math.abs(m.value))}
            </span>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}
