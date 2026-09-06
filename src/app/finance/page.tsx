import Link from "next/link";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { PermissionDenied } from "@/components/ui/system-state";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import {
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoPanel,
  NeoTable,
  PageLayout,
  PageHeader,
} from "@/components/base";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { getFinanceOverviewStats, getRecentTransactions } from "@/lib/data";
import { DollarSign, Banknote, ShoppingCart, Clock, TrendingUp, Activity } from "lucide-react";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { TYPO } from "@/lib/typography";
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

export default async function FinanceOverviewPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  let stats: Awaited<ReturnType<typeof getFinanceOverviewStats>>;
  let recent: Awaited<ReturnType<typeof getRecentTransactions>>;
  try {
    [stats, recent] = await Promise.all([
      getFinanceOverviewStats(guard.client),
      getRecentTransactions(15, guard.client),
    ]);
  } catch {
    return <FinanceUnavailable title="Finance overview unavailable" />;
  }

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
      <nav aria-label="Finance reports" className="flex flex-wrap gap-4 text-sm">
        <Link
          prefetch={false}
          href="/financial/owner"
          className="inline-flex min-h-11 items-center underline"
        >
          Owner dashboard
        </Link>
        <Link
          prefetch={false}
          href="/financial/dashboard"
          className="inline-flex min-h-11 items-center underline"
        >
          Project portfolio summary
        </Link>
        <Link
          prefetch={false}
          href="/reports"
          className="inline-flex min-h-11 items-center underline"
        >
          Reports
        </Link>
      </nav>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href }) => {
          const tone = label === "Profit" ? (value >= 0 ? "positive" : "negative") : "neutral";
          const content = (
            <KpiTile
              label={
                <span className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <Icon className="h-4 w-4 text-[var(--hh-text-tertiary)]" />
                </span>
              }
              value={fmtUsd(value)}
              tone={tone}
              className="min-h-[116px]"
            />
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

      <NeoPanel
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--hh-text-tertiary)]" />
            Recent financial activity
          </span>
        }
        title="Finance movement"
        description="Recent revenue and cost activity across linked projects."
        bodyClassName="p-3 md:p-0"
      >
        {recent.length === 0 ? (
          <p className="py-6 text-sm text-[var(--hh-text-secondary)]">No recent activity.</p>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {recent.map((tx) => (
                <NeoMobileCard key={`${tx.type}-${tx.id}`} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={TYPO.primaryName}>{tx.description}</p>
                      <p className="mt-1 text-xs capitalize text-[var(--hh-text-secondary)]">
                        {tx.type} / {tx.projectName ?? "No project"}
                      </p>
                    </div>
                    <NeoAmount className="shrink-0 text-right text-base">
                      {fmtUsd(tx.amount)}
                    </NeoAmount>
                  </div>
                  <p className="mt-3 text-xs text-[var(--hh-text-secondary)]">
                    {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}
                  </p>
                </NeoMobileCard>
              ))}
            </div>
            <NeoTable
              className="hidden rounded-none border-0 shadow-none md:block"
              tableClassName="min-w-[760px] lg:min-w-0"
            >
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
                      className={cn(tableRawTdClass, "capitalize text-[var(--hh-text-secondary)]")}
                    >
                      {tx.type}
                    </td>
                    <td className={tableRawTdClass}>{tx.description}</td>
                    <td className={cn(tableRawTdClass, "text-[var(--hh-text-secondary)]")}>
                      {tx.projectName ?? "—"}
                    </td>
                    <td className={cn(tableRawTdClass, "text-right", TYPO.amount)}>
                      <NeoAmount>{fmtUsd(tx.amount)}</NeoAmount>
                    </td>
                    <td className={cn(tableRawTdClass, "text-[var(--hh-text-secondary)]")}>
                      {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
          </>
        )}
      </NeoPanel>
    </PageLayout>
  );
}
