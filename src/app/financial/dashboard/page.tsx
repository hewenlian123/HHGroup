import Link from "next/link";
import { getCompanyFinancialDashboard } from "@/lib/data";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
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
            <Link href="/financial" className="text-sm text-muted-foreground hover:text-foreground">
              Financial
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Metrics" />
      <Divider />
      <div className="grid grid-cols-3 gap-x-8 gap-y-4 py-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex justify-between items-baseline border-b border-border/40 pb-2"
          >
            <span className="text-sm text-muted-foreground">{m.label}</span>
            <span
              className={cn(
                "tabular-nums text-right font-medium",
                m.positiveGood !== undefined &&
                  (m.value >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400")
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
