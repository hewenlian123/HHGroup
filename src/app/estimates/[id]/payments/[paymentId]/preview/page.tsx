import { notFound, redirect } from "next/navigation";
import {
  getEstimateById,
  getEstimateMeta,
  getPaymentSchedule,
  paymentMilestoneAmount,
} from "@/lib/data";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { PaymentPreviewActions } from "./payment-preview-actions";
import { ProposalScopePreview } from "@/app/estimates/_components/proposal-scope-preview";
import { formatEstimatePaymentDueDate } from "@/app/estimates/_components/estimate-payment-date";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function EstimatePaymentPreviewPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  const readClient = getServerSupabaseInternalNoStore();

  const pageData = await Promise.all([
    getEstimateById(id, readClient),
    getEstimateMeta(id, readClient),
    getPaymentSchedule(id, readClient),
    fetchDocumentCompanyProfile(),
  ])
    .then((data) => ({ data }))
    .catch((error: unknown) => ({ error }));

  if ("error" in pageData) {
    logServerPageDataError(`estimates/${id}/payments/${paymentId}/preview`, pageData.error);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(pageData.error, "payment preview financial details")}
        backHref={`/estimates/${id}`}
        backLabel="Back to estimate"
      />
    );
  }

  const [estimate, meta, paymentSchedule, company] = pageData.data;

  if (!estimate || !meta) redirect("/estimates");

  const payment = paymentSchedule.find((item) => item.id === paymentId);
  if (!payment) notFound();
  const formattedDueDate = formatEstimatePaymentDueDate(payment.dueDate);

  const amountDue = paymentMilestoneAmount(payment, estimate.total);
  const estimateDate =
    meta.estimateDate ?? (estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—");

  return (
    <div
      className="min-h-screen bg-[var(--hh-l0-canvas)] text-[var(--hh-ink)] print:min-h-0 print:bg-white"
      data-hh-context="document-route"
      data-hh-theme="document-light"
      role="document"
      aria-label="Payment milestone preview"
    >
      <SetBreadcrumbEntityTitle label={`${estimate.number} payment`} />
      <PaymentPreviewActions estimateId={id} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: letter; margin: 0.5in; }
              body { background: #fff !important; }
            }
          `,
        }}
      />
      <article className="mx-auto max-w-[8.5in] px-6 py-8 print:max-w-none print:px-0 print:py-0">
        <DocumentCompanyHeader
          company={company}
          documentTitle="Payment Milestone"
          documentNo={estimate.number}
          documentDate={estimateDate}
          documentNoLabel="Related Estimate"
          extraRight={
            formattedDueDate ? (
              <p className="text-xs text-[var(--hh-muted)] tabular-nums">Due: {formattedDueDate}</p>
            ) : null
          }
        />

        <section className="mb-8 grid grid-cols-2 gap-6 text-sm print:break-inside-avoid">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
              Bill to
            </h2>
            <p className="font-semibold text-[var(--hh-ink)]">{meta.client.name || "—"}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--hh-text)]">
              {meta.client.address || meta.project.siteAddress || "—"}
            </p>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
              Project
            </h2>
            <p className="font-semibold text-[var(--hh-ink)]">{meta.project.name || "—"}</p>
            <p className="mt-1 text-[var(--hh-text)]">Estimate {estimate.number}</p>
          </div>
        </section>

        <section className="mb-8 rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] p-6 print:break-inside-avoid print:bg-white">
          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Payment milestone
          </p>
          <div className="mt-4 flex items-start justify-between gap-8">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--hh-ink)]">{payment.title}</h1>
              {payment.description ? (
                <div className="mt-3 max-w-2xl text-sm leading-6 text-[var(--hh-text)]">
                  <ProposalScopePreview text={payment.description} variant="print" />
                </div>
              ) : null}
              {formattedDueDate ? (
                <p className="mt-3 text-sm tabular-nums text-[var(--hh-muted)]">
                  Due: {formattedDueDate}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                Amount due
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--hh-ink)]">
                ${fmt(amountDue)}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10 text-sm text-[var(--hh-text)] print:break-inside-avoid">
          <p>
            This payment milestone is tied to estimate{" "}
            <span className="font-semibold text-[var(--hh-ink)]">{estimate.number}</span> for{" "}
            <span className="font-semibold text-[var(--hh-ink)]">
              {meta.project.name || "this project"}
            </span>
            .
          </p>
        </section>

        <footer className="whitespace-pre-wrap border-t border-[var(--hh-line)] pt-6 text-xs text-[var(--hh-muted)]">
          {company.invoiceFooter || `Payment Milestone — ${company.companyName}`}
        </footer>
      </article>
    </div>
  );
}
