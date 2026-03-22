import { PageLayout, PageHeader, Divider } from "@/components/base";
import Link from "next/link";
import { getTotalLaborCost } from "@/lib/data";
import { Clock, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const navItems = [
  { href: "/finance", label: "Overview" },
  { href: "/financial/invoices", label: "Invoices" },
  { href: "/bills", label: "Bills" },
  { href: "/financial/expenses", label: "Expenses" },
  { href: "/finance/labor-cost", label: "Labor Cost" },
  { href: "/labor/cost-allocation", label: "Cost Allocation" },
] as const;

export default async function FinanceLaborCostPage() {
  const totalLaborCost = await getTotalLaborCost().catch(() => 0);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Labor Cost"
          description="Total labor cost (Approved and Locked entries)."
        />
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 pb-3 text-sm">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.href === "/finance/labor-cost"
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Divider />

      <div className="flex flex-col gap-1 border-b border-border/60 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total labor cost
          </span>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xl font-semibold tabular-nums text-foreground">
          {fmtUsd(totalLaborCost)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Sum of labor_entries.cost_amount (Approved & Locked).
        </p>
      </div>

      <div className="mt-4">
        <Link
          href="/labor/entries"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          View labor entries
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </PageLayout>
  );
}
