import Link from "next/link";
import { PageLayout, PageHeader, Divider } from "@/components/base";
import { getFinanceOverviewStats, getRecentTransactions } from "@/lib/data";
import { DollarSign, Banknote, ShoppingCart, Clock, TrendingUp, Activity } from "lucide-react";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

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

export default async function FinanceOverviewPage() {
  const [stats, recent] = await Promise.all([getFinanceOverviewStats(), getRecentTransactions(15)]);

  const cards = [
    { label: "Revenue", value: stats.revenue, icon: DollarSign, href: "/financial/invoices" },
    { label: "Total Bills", value: stats.totalBills, icon: Banknote, href: "/bills" },
    {
      label: "Total Expenses",
      value: stats.totalExpenses,
      icon: ShoppingCart,
      href: "/financial/expenses",
    },
    { label: "Total Labor Cost", value: stats.totalLaborCost, icon: Clock, href: "/labor/entries" },
    { label: "Profit", value: stats.profit, icon: TrendingUp },
  ];

  return (
    <PageLayout
      header={
        <PageHeader
          title="Finance Overview"
          description="Summary of revenue, bills, expenses, labor cost, and profit."
        />
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 pb-3 text-sm">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.href === "/finance"
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Divider />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href }) => {
          const content = (
            <div className="flex flex-col gap-1 border-b border-border/60 pb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
                {href ? (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <p
                className={`text-xl font-semibold tabular-nums ${
                  label === "Profit"
                    ? value >= 0
                      ? "text-hh-profit-positive dark:text-hh-profit-positive"
                      : "text-red-600 dark:text-red-400"
                    : "text-foreground"
                }`}
              >
                {fmtUsd(value)}
              </p>
            </div>
          );
          return href ? (
            <Link key={label} href={href} className="block hover:opacity-90">
              {content}
            </Link>
          ) : (
            <div key={label}>{content}</div>
          );
        })}
      </section>

      <Divider />

      <section>
        <div className="flex items-center gap-2 pb-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent financial activity
          </span>
        </div>
        <div className="border-b border-border/60" />
        {recent.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="airtable-table-wrap airtable-table-wrap--ruled">
            <div className="airtable-table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Type
                    </th>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Description
                    </th>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Project
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Amount
                    </th>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((tx) => (
                    <tr key={`${tx.type}-${tx.id}`} className={listTableRowStaticClassName}>
                      <td className="px-3 py-1.5 text-muted-foreground capitalize">{tx.type}</td>
                      <td className="px-3 py-1.5">{tx.description}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{tx.projectName ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtUsd(tx.amount)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </PageLayout>
  );
}
