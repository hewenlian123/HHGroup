import Link from "next/link";
import { getCashOverview, getDeposits } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { PermissionDenied } from "@/components/ui/system-state";
import { PageLayout, PageHeader, KpiTile, NeoPanel } from "@/components/base";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function AccountsOverviewPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  let cash: Awaited<ReturnType<typeof getCashOverview>>;
  let deposits: Awaited<ReturnType<typeof getDeposits>>;
  try {
    [cash, deposits] = await Promise.all([
      getCashOverview(guard.client),
      getDeposits(guard.client),
    ]);
  } catch {
    return <FinanceUnavailable title="Accounts overview unavailable" />;
  }
  return (
    <PageLayout
      header={
        <PageHeader
          title="Accounts overview"
          description="Bank cash movement and received-payment deposits. Account records identify payment sources; these are aggregate ledger totals."
        />
      }
    >
      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Cash movement summary"
      >
        <KpiTile label="Bank balance" value={formatCurrency(cash.bankBalance)} />
        <KpiTile label="Reconciled" value={formatCurrency(cash.reconciledBankTotal)} />
        <KpiTile label="Unreconciled" value={formatCurrency(cash.unreconciledBankTotal)} />
        <KpiTile label="Deposit records" value={deposits.length} />
      </section>
      <nav aria-label="Cash workflow" className="flex flex-wrap gap-3">
        <Button asChild>
          <Link prefetch={false} href="/financial/bank">
            Review transactions
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link prefetch={false} href="/financial/accounts">
            Manage accounts
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link prefetch={false} href="/financial/deposits">
            View deposits
          </Link>
        </Button>
      </nav>
      <NeoPanel
        title="Needs attention"
        description="Recent unreconciled bank movement. Match bank activity with its existing expense in Transactions."
      >
        {cash.recentUnreconciled.length === 0 ? (
          <p className="p-4 text-sm">No unreconciled transactions.</p>
        ) : (
          cash.recentUnreconciled.map((t) => (
            <Link
              prefetch={false}
              key={t.id}
              href="/financial/bank"
              className="flex min-h-11 flex-wrap justify-between gap-2 border-b border-[var(--hh-border)] p-3 text-sm"
            >
              <span>
                {t.description} · {t.date}
              </span>
              <span className="tabular-nums">{formatCurrency(t.amount)}</span>
            </Link>
          ))
        )}
      </NeoPanel>
      <NeoPanel
        title="Recent deposits"
        description="Recorded from customer payments; deposits are not counted again as revenue."
      >
        {deposits.length === 0 ? (
          <p className="p-4 text-sm">No deposits yet.</p>
        ) : (
          deposits.slice(0, 5).map((d) => (
            <Link
              prefetch={false}
              key={d.id}
              href="/financial/deposits"
              className="flex min-h-11 flex-wrap justify-between gap-2 border-b border-[var(--hh-border)] p-3 text-sm"
            >
              <span>
                {d.description} · {d.date}
              </span>
              <span className="tabular-nums">{formatCurrency(d.amount)}</span>
            </Link>
          ))
        )}
      </NeoPanel>
    </PageLayout>
  );
}
