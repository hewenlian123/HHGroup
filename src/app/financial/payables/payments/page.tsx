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

export const dynamic = "force-dynamic";

export default async function OutgoingPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  let data;
  try {
    data = await getApPaymentsPage(guard.client, Number((await searchParams).page) || 1);
  } catch {
    return (
      <ServerDataLoadFallback
        message="Outgoing payments are unavailable. No amounts are shown until the AP ledger can be loaded."
        backHref="/financial/payables/payments"
        backLabel="Retry payments"
      />
    );
  }
  const { payments, page, total, pageSize } = data;
  return (
    <PageLayout
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
                  <tr key={payment.id}>
                    <td>{formatLedgerDate(payment.payment_date)}</td>
                    <td>
                      {payment.bill?.vendor_name || "Payee unavailable"}
                      <p className="text-hh-metadata">{payment.bill?.project_name || "—"}</p>
                    </td>
                    <td>
                      <Link href={`/bills/${payment.bill_id}`} className="underline">
                        {payment.bill?.bill_no || "View bill"}
                      </Link>
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
                <NeoMobileCard key={payment.id} className="space-y-2 p-3">
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
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/bills/${payment.bill_id}`}
                  >
                    {payment.bill?.bill_no || "View bill"} ·{" "}
                    {payment.bill?.status || "Bill unavailable"}
                  </Link>
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
              <Link href={`/financial/payables/payments?page=${page - 1}`}>Previous</Link>
            </Button>
          ) : null}
          {page * pageSize < total ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/financial/payables/payments?page=${page + 1}`}>Next</Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </PageLayout>
  );
}
