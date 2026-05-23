import Link from "next/link";
import { PageLayout, PageHeader, Divider } from "@/components/base";
import { TableShell, tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { getFinanceOverviewStats, getRecentTransactions } from "@/lib/data";
import { DollarSign, Banknote, ShoppingCart, Clock, TrendingUp, Activity } from "lucide-react";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

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
  { href: "/financial/owner", label: "Owner dashboard" },
  { href: "/financial/accounts", label: "Accounts" },
  { href: "/financial/estimates", label: "Estimates" },
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
                ? "font-medium text-[var(--neo-gold-soft)]"
                : "text-[var(--neo-canvas-text-secondary)] hover:text-[var(--neo-canvas-text-primary)]"
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
            <div className={cn(OS.card, "flex flex-col gap-1 p-4")}>
              <div className="flex items-center justify-between">
                <span className={TYPO.sectionLabel}>{label}</span>
                <Icon className="h-4 w-4 text-[var(--neo-text-secondary)]" />
              </div>
              <p
                className={cn(
                  TYPO.amount,
                  "text-[20px] md:text-[22px]",
                  label === "Profit"
                    ? value >= 0
                      ? "text-hh-profit-positive dark:text-hh-profit-positive"
                      : "text-red-600 dark:text-red-400"
                    : ""
                )}
              >
                {fmtUsd(value)}
              </p>
            </div>
          );
          return href ? (
            <Link key={label} href={href} className="block">
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
          <Activity className="h-4 w-4 text-[var(--neo-canvas-text-tertiary)]" />
          <span className={TYPO.sectionLabel}>Recent financial activity</span>
        </div>
        <div className="border-b border-border/60" />
        {recent.length === 0 ? (
          <p className="py-6 text-sm text-[var(--neo-canvas-text-secondary)]">
            No recent activity.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {recent.map((tx) => (
                <div key={`${tx.type}-${tx.id}`} className={cn(OS.card, "p-4")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={TYPO.primaryName}>{tx.description}</p>
                      <p className="mt-1 text-xs capitalize text-[var(--neo-text-secondary)]">
                        {tx.type} / {tx.projectName ?? "No project"}
                      </p>
                    </div>
                    <p className={cn(TYPO.amount, "shrink-0 text-right text-base")}>
                      {fmtUsd(tx.amount)}
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-[var(--neo-text-secondary)]">
                    {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}
                  </p>
                </div>
              ))}
            </div>
            <TableShell className="hidden md:block">
              <div className="max-w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={tableRawThClass}>Type</th>
                      <th className={tableRawThClass}>Description</th>
                      <th className={tableRawThClass}>Project</th>
                      <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
                      <th className={tableRawThClass}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((tx) => (
                      <tr key={`${tx.type}-${tx.id}`} className={listTableRowStaticClassName}>
                        <td
                          className={cn(
                            tableRawTdClass,
                            "capitalize text-[var(--neo-text-secondary)]"
                          )}
                        >
                          {tx.type}
                        </td>
                        <td className={tableRawTdClass}>{tx.description}</td>
                        <td className={cn(tableRawTdClass, "text-[var(--neo-text-secondary)]")}>
                          {tx.projectName ?? "—"}
                        </td>
                        <td className={cn(tableRawTdClass, "text-right", TYPO.amount)}>
                          {fmtUsd(tx.amount)}
                        </td>
                        <td className={cn(tableRawTdClass, "text-[var(--neo-text-secondary)]")}>
                          {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableShell>
          </>
        )}
      </section>
    </PageLayout>
  );
}
