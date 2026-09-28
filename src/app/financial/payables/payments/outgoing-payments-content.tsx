import { OutgoingPaymentDetail } from "@/components/financial/outgoing-payment-detail";
import { BillDetailLink, BillDetailSheet } from "@/components/financial/bill-detail-sheet";
import { FinanceContextBack } from "@/components/financial/finance-context-back";

import { financePathWithReturn } from "@/lib/finance-navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
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
import { getApPaymentsPage } from "@/lib/ap-bills-db";
import { formatCurrency } from "@/lib/formatters";
import { formatLedgerDate } from "@/lib/ledger-date";

export default async function OutgoingPaymentsPage({
  searchParams,
  embedded = false,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  embedded?: boolean;
}) {
  const params = await searchParams;
  const basePath = embedded ? "/financial/payables" : "/financial/payables/payments";
  const context = `${basePath}?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString()}`;
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  let data;
  try {
    data = await getApPaymentsPage(guard.client, Number(params.page) || 1);
  } catch {
    return (
      <ServerDataLoadFallback
        message="Outgoing payments are unavailable. No amounts are shown until the AP ledger can be loaded."
        backHref={context}
        backLabel="Retry payments"
      />
    );
  }
  const { payments, page, total, pageSize } = data;
  const Layout = embedded
    ? ({ children }: { children: React.ReactNode; header: React.ReactNode }) => <>{children}</>
    : PageLayout;
  return (
    <Layout
      header={
        <PageHeader
          title="Outgoing Payments"
          description="Payables · Money Out. AP bill payments only."
          actions={
            <Button asChild>
              <Link href="/bills">Choose bill to pay</Link>
            </Button>
          }
        />
      }
    >
      {!embedded ? <FinanceContextBack /> : null}
      <BillDetailSheet />
      <NeoPanel
        title="AP payment history"
        description="Payments stay linked to their original bill. History includes payments on void bills; customer receipts and Labor payments are separate."
        bodyClassName="p-0"
      >
        {payments.length === 0 ? (
          <p className="p-4 text-hh-body">No outgoing payments on this page.</p>
        ) : (
          <>
            <NeoTable className="hidden lg:block">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee / Project</th>
                  <th>Bill</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} data-finance-record={payment.id} tabIndex={-1}>
                    <td>
                      {formatLedgerDate(payment.payment_date)}
                      <OutgoingPaymentDetail payment={payment} />
                    </td>
                    <td>
                      {payment.bill?.vendor_name || "Payee unavailable"}
                      <p className="text-hh-metadata">{payment.bill?.project_name || "—"}</p>
                    </td>
                    <td>
                      <BillDetailLink
                        href={financePathWithReturn(`/bills/${payment.bill_id}`, context)}
                        className="underline"
                      >
                        {payment.bill?.bill_no || "View bill"}
                      </BillDetailLink>
                      <p className="text-hh-metadata">
                        {payment.bill?.status || "Bill unavailable"}
                      </p>
                    </td>
                    <td>{payment.payment_method || "—"}</td>
                    <td>{payment.reference_no || "—"}</td>
                    <td className="text-right">
                      <NeoAmount>{formatCurrency(payment.amount)}</NeoAmount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
            <div className="space-y-2 p-3 lg:hidden">
              {payments.map((payment) => (
                <NeoMobileCard
                  key={payment.id}
                  data-finance-record={payment.id}
                  tabIndex={-1}
                  className="space-y-2 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {payment.bill?.vendor_name || "Payee unavailable"}
                    </span>
                    <NeoAmount>{formatCurrency(payment.amount)}</NeoAmount>
                  </div>
                  <p className="text-hh-metadata">
                    {formatLedgerDate(payment.payment_date)} · {payment.payment_method || "—"}
                  </p>
                  <p className="break-words text-hh-metadata">
                    {payment.bill?.project_name || "—"} · Reference: {payment.reference_no || "—"}
                  </p>
                  <OutgoingPaymentDetail payment={payment} />
                  <BillDetailLink
                    className="inline-flex min-h-11 items-center underline"
                    href={financePathWithReturn(`/bills/${payment.bill_id}`, context)}
                  >
                    {payment.bill?.bill_no || "View bill"} ·{" "}
                    {payment.bill?.status || "Bill unavailable"}
                  </BillDetailLink>
                </NeoMobileCard>
              ))}
            </div>
          </>
        )}
      </NeoPanel>
      <nav
        aria-label="Outgoing payment pages"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <span className="text-hh-control">
          {total} payments · Page {page}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${basePath}?${new URLSearchParams({ ...Object.fromEntries(new URL(context, "http://hh.local").searchParams), page: String(page - 1) })}`}
              >
                Previous
              </Link>
            </Button>
          ) : null}
          {page * pageSize < total ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${basePath}?${new URLSearchParams({ ...Object.fromEntries(new URL(context, "http://hh.local").searchParams), page: String(page + 1) })}`}
              >
                Next
              </Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </Layout>
  );
}
