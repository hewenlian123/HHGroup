import Link from "next/link";
import { getCompanyFinancialDashboard } from "@/lib/data";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function CompanyFinancialDashboardPage() {
  const d = await getCompanyFinancialDashboard();

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
            <Link href="/financial" className="text-sm text-[#6B7280] hover:text-[#111111]">
              Financial
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Metrics" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 mt-2">
        {metrics.map((m) => (
          <div key={m.label} className="kpi-metric">
            <span className="kpi-metric-label">{m.label}</span>
            <span
              className={cn(
                "kpi-metric-value mt-0.5 block",
                m.positiveGood !== undefined && (m.value >= 0 ? "text-green-600" : "text-red-600")
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
