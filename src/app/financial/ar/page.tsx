import Link from "next/link";
import { notFound } from "next/navigation";
import { Select } from "@/components/ui/native-select";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoPanel,
  NeoStatus,
  NeoTable,
  type StatusBadgeVariant,
} from "@/components/base";
import { MobileFabPlus, MobileListHeader } from "@/components/mobile/mobile-list-chrome";
import { type InvoiceComputedStatus } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadARPageReadModel } from "@/lib/financial/invoice-read-model";
import { CreditCard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { OS, TYPO } from "@/lib/typography";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { emitRscTiming } from "@/lib/performance/server-timing";

function getAgingBucket(dueDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate >= today) return "Current";
  const due = new Date(dueDate).getTime();
  const t = new Date(today).getTime();
  const daysOverdue = Math.floor((t - due) / (24 * 60 * 60 * 1000));
  if (daysOverdue <= 30) return "1–30";
  if (daysOverdue <= 60) return "31–60";
  if (daysOverdue <= 90) return "61–90";
  return "90+";
}

function statusMeta(status: InvoiceComputedStatus): { label: string; variant: StatusBadgeVariant } {
  if (status === "Draft") return { label: "Draft", variant: "muted" };
  if (status === "Paid") return { label: "Paid", variant: "success" };
  if (status === "Partial") return { label: "Partial", variant: "warning" };
  if (status === "Overdue") return { label: "Overdue", variant: "danger" };
  if (status === "Void") return { label: "Void", variant: "danger" };
  return { label: status === "Unpaid" ? "Unpaid" : "Sent", variant: "default" };
}

export const dynamic = "force-dynamic";

export default async function ARPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; customerId?: string }>;
}) {
  const pageStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();
  const serverDataStartedAt = performance.now();
  let model;
  try {
    model = await loadARPageReadModel(guard.client);
  } catch {
    return (
      <ServerDataLoadFallback
        message="Billing data is unavailable. No balances are shown until the ledger can be loaded."
        backHref="/financial/ar"
        backLabel="Retry Billing"
      />
    );
  }
  const { summary, projects, invoices, payments } = model;
  const { customerId, invoice: requestedInvoiceId } = await searchParams;
  const outstanding = customerId
    ? model.outstanding.filter((invoice) => invoice.customerId === customerId)
    : model.outstanding;
  const customers = new Map(
    invoices
      .filter((invoice) => invoice.customerId)
      .map((invoice) => [invoice.customerId!, invoice.clientName])
  );
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const history = payments
    .filter(
      (payment) => !customerId || invoiceById.get(payment.invoiceId)?.customerId === customerId
    )
    .toSorted((a, b) => b.date.localeCompare(a.date));
  const recentPayments = customerId ? history : history.slice(0, 8);
  const customerQuery = customerId ? `?${new URLSearchParams({ customerId })}` : "";
  const serverDataCompletedAt = performance.now();
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const byBucket: Record<string, typeof outstanding> = {};
  for (const inv of outstanding) {
    const bucket = getAgingBucket(inv.dueDate);
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(inv);
  }
  const bucketOrder = ["Current", "1–30", "31–60", "61–90", "90+"];
  const sortedBuckets = bucketOrder.filter((b) => byBucket[b]?.length);

  const selectedInvoice =
    outstanding.find((invoice) => invoice.id === requestedInvoiceId) ?? outstanding[0] ?? null;

  const rscPreparedAt = performance.now();
  emitRscTiming("financial/ar", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <div
      data-revenue-ar-v2
      className="page-container page-stack py-4 text-[var(--hh-text-secondary)] md:py-6"
    >
      <div className="hidden md:block">
        <PageHeader
          title="Billing"
          description="Customer receivables, invoices, and received payments."
          actions={
            <div className="flex gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn(OS.secondaryButton, "h-11 min-h-[44px] xl:h-9 xl:min-h-0")}
              >
                <Link href={`/financial/payments${customerQuery}`}>Received payments</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className={cn(OS.primaryButton, "h-11 min-h-[44px] xl:h-9 xl:min-h-0")}
              >
                <Link href="/financial/invoices/new">New invoice</Link>
              </Button>
            </div>
          }
        />
      </div>
      <MobileListHeader
        title="Billing"
        fab={<MobileFabPlus href="/financial/invoices/new" ariaLabel="New invoice" />}
      />

      <section data-testid="ar-workspace-summary" aria-label="Accounts receivable summary">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 md:gap-3">
          <KpiTile
            label="Outstanding"
            value={formatCurrency(summary.totalAR)}
            meta="Open invoice balances"
          />
          <KpiTile
            label="Overdue"
            value={formatCurrency(summary.overdueAR)}
            tone="negative"
            meta="Past due balances"
          />
          <KpiTile
            label="Paid this month"
            value={formatCurrency(summary.paidThisMonth)}
            tone="positive"
            meta="Posted customer payments"
          />
          <KpiTile
            label="Awaiting payment"
            value={String(model.outstanding.length)}
            meta="Open invoices across all customers"
          />
        </div>
        <p className="mt-2 text-hh-metadata text-[var(--hh-text-secondary)]">
          Company-wide balances · Posted invoice payments are counted once.
        </p>
      </section>

      <form action="/financial/ar" className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-hh-control text-[var(--hh-text-primary)]">
          Customer history
          <Select name="customerId" defaultValue={customerId ?? ""} className="mt-1 w-full">
            <option value="">All customers</option>
            {customerId && !customers.has(customerId) ? (
              <option value={customerId}>Selected customer</option>
            ) : null}
            {[...customers].map(([id, name]) => (
              <option key={id} value={id}>
                {name || "Unnamed customer"}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          View history
        </Button>
        {customerId ? (
          <Button asChild variant="ghost">
            <Link href="/financial/ar">Clear customer</Link>
          </Button>
        ) : null}
      </form>
      {customerId ? (
        <p className="text-hh-control">
          Showing invoices and payments linked to this customer.{" "}
          <Link className="underline" href={`/financial/invoices${customerQuery}`}>
            View invoices
          </Link>{" "}
          ·{" "}
          <Link className="underline" href={`/financial/payments${customerQuery}`}>
            Received payments
          </Link>
        </p>
      ) : null}

      {sortedBuckets.length === 0 ? (
        <NeoPanel bodyClassName="px-4 py-10 text-center md:px-6" data-testid="ar-invoice-queue">
          <FileText className="mx-auto h-5 w-5 text-[var(--hh-text-tertiary)]" aria-hidden />
          <p className={cn("mt-3", TYPO.body)}>No outstanding invoices.</p>
        </NeoPanel>
      ) : (
        <section
          className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
          aria-label="Invoice receivables workspace"
        >
          <NeoPanel
            data-testid="ar-invoice-queue"
            eyebrow="Receivables queue"
            title="Outstanding invoices"
            description="Needs attention: review overdue and unpaid balances, then receive payment against the invoice."
            bodyClassName="p-0"
          >
            <div className="space-y-4 p-2.5 md:p-3">
              {sortedBuckets.map((bucket) => (
                <section key={bucket} aria-label={`${bucket} invoices`}>
                  <div className="flex items-center justify-between border-b border-[var(--hh-border)] px-2 py-2">
                    <h3 className={cn(TYPO.sectionLabel, "text-[var(--hh-text-primary)]")}>
                      {bucket === "Current" ? "Current" : `${bucket} days overdue`}
                    </h3>
                    <span className="text-hh-status tabular-nums text-[var(--hh-text-secondary)]">
                      {byBucket[bucket].length} invoice{byBucket[bucket].length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <NeoTable
                    className="hidden lg:block"
                    tableClassName="min-w-0 table-fixed"
                    data-testid={`ar-dense-group-${bucket}`}
                  >
                    <colgroup>
                      <col className="w-[25%] xl:w-[25%]" />
                      <col className="w-[20%] xl:w-[19%]" />
                      <col className="w-[13%] xl:w-[13%]" />
                      <col className="w-[11%] xl:w-[11%]" />
                      <col className="w-[15%] xl:w-[20%]" />
                      <col className="w-[16%] xl:w-[12%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Due</th>
                        <th className="text-right">Balance</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byBucket[bucket].map((invoice) => {
                        const status = statusMeta(invoice.computedStatus);
                        const selected = selectedInvoice?.id === invoice.id;
                        return (
                          <tr
                            key={invoice.id}
                            className={cn("h-10", selected && "bg-[var(--hh-l3-selected)]")}
                          >
                            <td
                              className={cn(
                                "border-b border-[var(--hh-border)] px-4 py-2",
                                selected && "border-l-[3px] border-l-[var(--hh-accent-primary)]"
                              )}
                            >
                              <Link
                                href={`/financial/invoices/${invoice.id}`}
                                className="block truncate font-medium text-[var(--hh-text-primary)] hover:underline"
                              >
                                {invoice.invoiceNo}
                              </Link>
                              <span className="block truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                                {invoice.clientName}
                              </span>
                            </td>
                            <td className="border-b border-[var(--hh-border)] px-4 py-2 text-hh-table-cell text-[var(--hh-text-secondary)]">
                              <span className="block truncate">
                                {projectNameById.get(invoice.projectId) ?? invoice.projectId}
                              </span>
                            </td>
                            <td className="border-b border-[var(--hh-border)] px-4 py-2">
                              <NeoStatus label={status.label} variant={status.variant} />
                            </td>
                            <td className="border-b border-[var(--hh-border)] px-4 py-2">
                              <span className={LEDGER_DATE_CLASS}>
                                {formatLedgerDate(invoice.dueDate)}
                              </span>
                            </td>
                            <td className="border-b border-[var(--hh-border)] px-4 py-2 text-right">
                              <NeoAmount
                                tone={invoice.computedStatus === "Overdue" ? "danger" : "neutral"}
                                className="whitespace-nowrap"
                              >
                                {formatCurrency(invoice.balanceDue)}
                              </NeoAmount>
                            </td>
                            <td className="border-b border-[var(--hh-border)] px-2 py-2 text-right">
                              <div className="flex justify-end gap-1.5 whitespace-nowrap">
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className={cn(OS.secondaryButton, "h-8")}
                                >
                                  <Link
                                    href={`/financial/ar?${new URLSearchParams({ invoice: invoice.id, ...(customerId ? { customerId } : {}) })}`}
                                    aria-label="View invoice context"
                                    aria-current={selected ? "true" : undefined}
                                  >
                                    Context
                                  </Link>
                                </Button>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className={cn(OS.secondaryButton, "h-8 xl:hidden")}
                                >
                                  <Link
                                    href={`/financial/invoices/${invoice.id}?recordPayment=1`}
                                    aria-label="Receive payment"
                                  >
                                    Receive
                                  </Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </NeoTable>
                  <div className="space-y-2 pt-2 lg:hidden">
                    {byBucket[bucket].map((invoice) => {
                      const status = statusMeta(invoice.computedStatus);
                      const selected = selectedInvoice?.id === invoice.id;
                      return (
                        <NeoMobileCard
                          key={invoice.id}
                          className={cn(
                            "p-3",
                            selected &&
                              "border-l-[3px] border-l-[var(--hh-accent-primary)] bg-[var(--hh-l3-selected)]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link href={`/financial/invoices/${invoice.id}`} className="min-w-0">
                              <p className="truncate text-hh-body font-semibold text-[var(--hh-text-primary)]">
                                {invoice.clientName}
                              </p>
                              <p className="mt-0.5 text-hh-metadata text-[var(--hh-text-secondary)]">
                                {invoice.invoiceNo}
                              </p>
                            </Link>
                            <NeoStatus label={status.label} variant={status.variant} />
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-3 text-hh-metadata text-[var(--hh-text-secondary)]">
                            <span>{formatLedgerDate(invoice.dueDate)}</span>
                            <NeoAmount
                              tone={invoice.computedStatus === "Overdue" ? "danger" : "neutral"}
                            >
                              {formatCurrency(invoice.balanceDue)}
                            </NeoAmount>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className={cn(OS.secondaryButton, "h-11 min-h-[44px]")}
                            >
                              <Link
                                href={`/financial/ar?${new URLSearchParams({ invoice: invoice.id, ...(customerId ? { customerId } : {}) })}`}
                                aria-current={selected ? "true" : undefined}
                              >
                                View context
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className={cn(OS.secondaryButton, "h-11 min-h-[44px]")}
                            >
                              <Link href={`/financial/invoices/${invoice.id}?recordPayment=1`}>
                                Receive payment
                              </Link>
                            </Button>
                          </div>
                        </NeoMobileCard>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </NeoPanel>
          <NeoPanel
            data-testid="ar-selected-invoice-context"
            className="hidden self-start xl:block"
            eyebrow="Selected invoice"
            title={selectedInvoice ? selectedInvoice.invoiceNo : "No invoice selected"}
            description={
              selectedInvoice ? selectedInvoice.clientName : "Choose an invoice from the queue."
            }
            bodyClassName="space-y-4 p-4"
          >
            {selectedInvoice ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={TYPO.kpiLabel}>Balance</p>
                    <NeoAmount
                      tone={selectedInvoice.computedStatus === "Overdue" ? "danger" : "neutral"}
                      className="mt-1 block text-hh-financial font-semibold"
                    >
                      {formatCurrency(selectedInvoice.balanceDue)}
                    </NeoAmount>
                  </div>
                  <div>
                    <p className={TYPO.kpiLabel}>Total paid</p>
                    <NeoAmount className="mt-1 block text-hh-financial font-semibold">
                      {formatCurrency(selectedInvoice.paidTotal)}
                    </NeoAmount>
                  </div>
                </div>
                <div className="border-t border-[var(--hh-border)] pt-3 text-hh-table-cell text-[var(--hh-text-secondary)]">
                  <p>Due {formatLedgerDate(selectedInvoice.dueDate)}</p>
                  <p className="mt-1">
                    Project:{" "}
                    {projectNameById.get(selectedInvoice.projectId) ?? selectedInvoice.projectId}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className={cn(OS.secondaryButton, "h-9")}
                  >
                    <Link href={`/financial/invoices/${selectedInvoice.id}`}>
                      Open full invoice
                    </Link>
                  </Button>
                  <Button asChild size="sm" className={cn(OS.primaryButton, "h-9")}>
                    <Link href={`/financial/invoices/${selectedInvoice.id}?recordPayment=1`}>
                      <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Receive payment
                    </Link>
                  </Button>
                </div>
              </>
            ) : null}
          </NeoPanel>
        </section>
      )}
      <NeoPanel
        title={customerId ? "Customer payment history" : "Recent customer payments"}
        description="Invoice ledger history, including partial and voided payments. Open the linked record for full details."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/financial/payments${customerQuery}`}>Received payments</Link>
          </Button>
        }
        bodyClassName="p-0"
      >
        {recentPayments.length === 0 ? (
          <p className="p-4 text-hh-body">No customer payments found.</p>
        ) : (
          <>
            <NeoTable className="hidden lg:block">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer / Project</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Reference / memo</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => {
                  const invoice = invoiceById.get(payment.invoiceId);
                  const href = payment.paymentReceivedId
                    ? `/financial/payments?${new URLSearchParams({ paymentId: payment.paymentReceivedId, ...(customerId ? { customerId } : {}) })}`
                    : `/financial/invoices/${payment.invoiceId}`;
                  return (
                    <tr key={payment.id}>
                      <td>{formatLedgerDate(payment.date)}</td>
                      <td>
                        {invoice?.clientName || "Customer unavailable"}
                        <p className="text-hh-metadata">
                          {invoice ? (projectNameById.get(invoice.projectId) ?? "—") : "—"}
                        </p>
                      </td>
                      <td>
                        <Link href={href} className="underline">
                          {invoice?.invoiceNo ?? "View invoice"}
                        </Link>
                      </td>
                      <td>{payment.method || "—"}</td>
                      <td>{payment.memo || "—"}</td>
                      <td>
                        <NeoStatus
                          label={payment.status ?? "Posted"}
                          variant={payment.status === "Voided" ? "muted" : "success"}
                        />
                      </td>
                      <td className="text-right">
                        <NeoAmount>{formatCurrency(payment.amount)}</NeoAmount>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </NeoTable>
            <div className="space-y-2 p-3 lg:hidden">
              {recentPayments.map((payment) => {
                const invoice = invoiceById.get(payment.invoiceId);
                const href = payment.paymentReceivedId
                  ? `/financial/payments?${new URLSearchParams({ paymentId: payment.paymentReceivedId, ...(customerId ? { customerId } : {}) })}`
                  : `/financial/invoices/${payment.invoiceId}`;
                return (
                  <NeoMobileCard key={payment.id} className="space-y-2 p-3">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 break-words">
                        {invoice?.clientName || "Customer unavailable"}
                      </span>
                      <NeoAmount>{formatCurrency(payment.amount)}</NeoAmount>
                    </div>
                    <Link href={href} className="inline-flex min-h-11 items-center underline">
                      {invoice?.invoiceNo ?? "View invoice"}
                    </Link>
                    <p className="text-hh-metadata">
                      {formatLedgerDate(payment.date)} · {payment.method || "—"} ·{" "}
                      {payment.status ?? "Posted"}
                    </p>
                    <p className="break-words text-hh-metadata">
                      {invoice ? (projectNameById.get(invoice.projectId) ?? "—") : "—"} · Reference
                      / memo: {payment.memo || "—"}
                    </p>
                  </NeoMobileCard>
                );
              })}
            </div>
          </>
        )}
      </NeoPanel>
    </div>
  );
}
