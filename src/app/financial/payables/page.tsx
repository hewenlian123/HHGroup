import { getReportDateRange, getReportsData } from "@/lib/reports-db";
import OutgoingPaymentsContent from "./payments/outgoing-payments-content";
import { BillsListClient } from "@/app/bills/bills-list-client";
import { fetchBillsPageData } from "@/app/bills/bills-api";
import { FinanceContextBack } from "@/components/financial/finance-context-back";
import { BillDetailLink, BillDetailSheet } from "@/components/financial/bill-detail-sheet";
import { financePathWithReturn } from "@/lib/finance-navigation";
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
import { getApBills, summarizeApBillsForDashboard } from "@/lib/ap-bills-db";
import { formatCurrency } from "@/lib/formatters";
import { formatLedgerDate } from "@/lib/ledger-date";

export const dynamic = "force-dynamic";

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = `/financial/payables?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString()}`;
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  const header = (
    <PageHeader
      title="Payables"
      description="Bills, outstanding AP, and outgoing payments."
      actions={
        <Button asChild>
          <Link href={financePathWithReturn("/bills/new", context)}>New bill</Link>
        </Button>
      }
    />
  );
  if (params.tab === "payments")
    return (
      <PageLayout header={header}>
        <FinanceContextBack />
        <OutgoingPaymentsContent searchParams={Promise.resolve(params)} embedded />
      </PageLayout>
    );
  if (params.tab === "bills") {
    const result = await fetchBillsPageData(params);
    return (
      <PageLayout header={header}>
        <FinanceContextBack />
        {result.available ? (
          <BillsListClient
            bills={result.bills}
            summary={result.summary}
            projects={result.projects}
          />
        ) : (
          <ServerDataLoadFallback
            message={result.message || "Bills unavailable."}
            backHref={context}
            backLabel="Retry bills"
          />
        )}
      </PageLayout>
    );
  }
  let data;
  try {
    data = await Promise.all([
      getApBills({}, guard.client),
      getReportsData(getReportDateRange({ period: "this-month" }), guard.client, {
        projectId: params.projectId || params.project_id,
        customerId: params.customerId,
      }),
    ]);
  } catch {
    return (
      <ServerDataLoadFallback
        message="Payables are unavailable. No balances are shown until the AP ledger can be loaded."
        backHref={context}
        backLabel="Retry Payables"
      />
    );
  }
  const [bills, reporting] = data;
  const openAmounts = new Map(reporting.records.billsAp.map((row) => [row.id, row.amount]));
  const openBills = bills
    .filter((bill) => openAmounts.has(bill.id))
    .map((bill) => ({ ...bill, balance_amount: openAmounts.get(bill.id)! }))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const summary = summarizeApBillsForDashboard(openBills, {
    today,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    paidThisMonthAmount: reporting.records.paidAp.reduce((sum, row) => sum + row.amount, 0),
  });
  const reportHref = (metric: string, extra: Record<string, string> = {}) =>
    financePathWithReturn(
      `/reports?${new URLSearchParams({ metric, period: "all-time", ...(params.projectId || params.project_id ? { projectId: params.projectId || params.project_id! } : {}), ...(params.customerId ? { customerId: params.customerId } : {}), ...extra })}`,
      context
    );
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return (
    <PageLayout header={header}>
      <FinanceContextBack />
      <BillDetailSheet />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="AP summary">
        <Link href={reportHref("billsAp")}>
          <KpiTile
            label="Outstanding"
            value={formatCurrency(summary.totalOutstanding)}
            meta="Open AP bill balances"
          />
        </Link>
        <Link href={reportHref("billsAp", { dueTo: yesterday.toISOString().slice(0, 10) })}>
          <KpiTile
            label="Overdue"
            value={formatCurrency(summary.overdueAmount)}
            tone="negative"
            meta={`${summary.overdueCount} bills`}
          />
        </Link>
        <Link
          href={reportHref("billsAp", {
            dueFrom: weekStart.toISOString().slice(0, 10),
            dueTo: weekEnd.toISOString().slice(0, 10),
          })}
        >
          <KpiTile
            label="Due this week"
            value={formatCurrency(summary.dueThisWeekAmount)}
            meta={`${summary.dueThisWeekCount} bills`}
          />
        </Link>
        <Link href={reportHref("paidAp", { period: "this-month" })}>
          <KpiTile
            label="Paid this month"
            value={formatCurrency(summary.paidThisMonthAmount)}
            tone="positive"
            meta="AP outgoing payments"
          />
        </Link>
      </section>
      <NeoPanel
        title="Vendor / subcontractor AP balances"
        description="Bill-level balances, ordered by due date. Contract balances and Labor payments remain separate."
        bodyClassName="p-0"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={context.replace(/([?&])tab=[^&]*/, "$1") + "&tab=payments"}>
              Outgoing payment history
            </Link>
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
                  <tr key={bill.id} data-finance-record={bill.id} tabIndex={-1}>
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
                      <BillDetailLink
                        className="underline"
                        href={financePathWithReturn(`/bills/${bill.id}`, context)}
                      >
                        {bill.bill_no || "View bill"}
                      </BillDetailLink>
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
                        <BillDetailLink
                          href={financePathWithReturn(`/bills/${bill.id}?addPayment=1`, context)}
                        >
                          Record payment
                        </BillDetailLink>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
            <div className="space-y-2 p-3 lg:hidden">
              {openBills.map((bill) => (
                <NeoMobileCard
                  key={bill.id}
                  data-finance-record={bill.id}
                  tabIndex={-1}
                  className="space-y-2 p-3"
                >
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
                      <BillDetailLink href={financePathWithReturn(`/bills/${bill.id}`, context)}>
                        {bill.bill_no || "View bill"}
                      </BillDetailLink>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <BillDetailLink
                        href={financePathWithReturn(`/bills/${bill.id}?addPayment=1`, context)}
                      >
                        Record payment
                      </BillDetailLink>
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
