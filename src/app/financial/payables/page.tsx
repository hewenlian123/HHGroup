import Link from "next/link";
import { notFound } from "next/navigation";
import {
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoPanel,
  NeoTable,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { getApBills, getApBillsSummary } from "@/lib/ap-bills-db";
import { formatCurrency } from "@/lib/formatters";
import { formatLedgerDate } from "@/lib/ledger-date";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  let data;
  try {
    data = await Promise.all([getApBills({}, guard.client), getApBillsSummary(guard.client)]);
  } catch {
    return (
      <ServerDataLoadFallback
        message="Payables are unavailable. No balances are shown until the AP ledger can be loaded."
        backHref="/financial/payables"
        backLabel="Retry Payables"
      />
    );
  }
  const [bills, summary] = data;
  const openBills = bills
    .filter((bill) => bill.status !== "Void" && bill.status !== "Paid" && bill.balance_amount > 0)
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <PageLayout
      header={
        <PageHeader
          title="Payables"
          description="Bills, AP balances, and outgoing payments."
          actions={
            <Button asChild>
              <Link href="/bills/new">New bill</Link>
            </Button>
          }
        />
      }
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="AP summary">
        <KpiTile
          label="Outstanding"
          value={formatCurrency(summary.totalOutstanding)}
          meta="Open AP bill balances"
        />
        <KpiTile
          label="Overdue"
          value={formatCurrency(summary.overdueAmount)}
          tone="negative"
          meta={`${summary.overdueCount} bills`}
        />
        <KpiTile
          label="Due this week"
          value={formatCurrency(summary.dueThisWeekAmount)}
          meta={`${summary.dueThisWeekCount} bills`}
        />
        <KpiTile
          label="Paid this month"
          value={formatCurrency(summary.paidThisMonthAmount)}
          tone="positive"
          meta="AP outgoing payments"
        />
      </section>
      <NeoPanel
        title="Vendor / subcontractor AP balances"
        description="Bill-level balances, ordered by due date. Contract balances and Labor payments remain separate."
        bodyClassName="p-0"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/financial/payables/payments">Outgoing payment history</Link>
          </Button>
        }
      >
        {openBills.length === 0 ? (
          <p className="p-4 text-hh-body">No outstanding AP bills.</p>
        ) : (
          <>
            <NeoTable className="hidden lg:block">
              <thead>
                <tr>
                  <th>Payee / Project</th>
                  <th>Bill</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="text-right">Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openBills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      {bill.vendor_name}
                      <p className="text-hh-metadata">{bill.project_name || "—"}</p>
                      {bill.subcontractor_id ? (
                        <Link
                          className="underline text-hh-metadata"
                          href={`/subcontractors/${bill.subcontractor_id}`}
                        >
                          {bill.subcontractor_name || "Subcontractor record"}
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      <Link className="underline" href={`/bills/${bill.id}`}>
                        {bill.bill_no || "View bill"}
                      </Link>
                    </td>
                    <td>{bill.due_date ? formatLedgerDate(bill.due_date) : "No due date"}</td>
                    <td>
                      {bill.status}
                      {bill.due_date && bill.due_date < today ? " · Overdue" : ""}
                    </td>
                    <td className="text-right">
                      <NeoAmount>{formatCurrency(bill.balance_amount)}</NeoAmount>
                    </td>
                    <td>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/bills/${bill.id}?addPayment=1`}>Record payment</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
            <div className="space-y-2 p-3 lg:hidden">
              {openBills.map((bill) => (
                <NeoMobileCard key={bill.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">{bill.vendor_name}</span>
                    <NeoAmount>{formatCurrency(bill.balance_amount)}</NeoAmount>
                  </div>
                  <p className="text-hh-metadata">
                    {bill.project_name || "—"} · {bill.status}
                    {bill.due_date && bill.due_date < today ? " · Overdue" : ""}
                  </p>
                  <p className="text-hh-metadata">
                    Due {bill.due_date ? formatLedgerDate(bill.due_date) : "—"}
                  </p>
                  {bill.subcontractor_id ? (
                    <Link
                      className="inline-flex min-h-11 items-center underline text-hh-metadata"
                      href={`/subcontractors/${bill.subcontractor_id}`}
                    >
                      {bill.subcontractor_name || "Subcontractor record"}
                    </Link>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/bills/${bill.id}`}>{bill.bill_no || "View bill"}</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/bills/${bill.id}?addPayment=1`}>Record payment</Link>
                    </Button>
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          </>
        )}
      </NeoPanel>
    </PageLayout>
  );
}
