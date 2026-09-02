import Link from "next/link";
import { notFound } from "next/navigation";
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
import {
  getARSummary,
  getOutstandingInvoices,
  getProjects,
  type InvoiceComputedStatus,
} from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CreditCard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { OS, TYPO } from "@/lib/typography";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";

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
  searchParams: Promise<{ invoice?: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const supabase = await createServerSupabaseClient({ noStore: true });
  if (!supabase) notFound();
  const [summary, outstanding, projects] = await Promise.all([
    getARSummary(supabase),
    getOutstandingInvoices(supabase),
    getProjects(supabase),
  ]);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const byBucket: Record<string, typeof outstanding> = {};
  for (const inv of outstanding) {
    const bucket = getAgingBucket(inv.dueDate);
    if (!byBucket[bucket]) byBucket[bucket] = [];
    byBucket[bucket].push(inv);
  }
  const bucketOrder = ["Current", "1–30", "31–60", "61–90", "90+"];
  const sortedBuckets = bucketOrder.filter((b) => byBucket[b]?.length);

  const requestedInvoiceId = (await searchParams).invoice;
  const selectedInvoice =
    outstanding.find((invoice) => invoice.id === requestedInvoiceId) ?? outstanding[0] ?? null;

  return (
    <div
      data-revenue-ar-v2
      className="page-container page-stack py-4 text-[var(--hh-text-secondary)] md:py-6"
    >
      <div className="hidden md:block">
        <PageHeader
          title="Invoices & AR"
          description="Accounts receivable, balances, and payment activity."
          actions={
            <div className="flex gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn(OS.secondaryButton, "h-11 min-h-[44px] xl:h-9 xl:min-h-0")}
              >
                <Link href="/financial/payments">Payments</Link>
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
        title="Invoices & AR"
        fab={<MobileFabPlus href="/financial/invoices/new" ariaLabel="New invoice" />}
      />

      <section data-testid="ar-workspace-summary" aria-label="Accounts receivable summary">
        <div className="grid gap-2 sm:grid-cols-3 md:gap-3">
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
        </div>
      </section>

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
            description="Grouped by due status. Open an invoice for its full record."
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
                                    href={`/financial/ar?invoice=${invoice.id}`}
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
                                href={`/financial/ar?invoice=${invoice.id}`}
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
    </div>
  );
}
