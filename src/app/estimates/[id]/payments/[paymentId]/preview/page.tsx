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
      className="min-h-screen bg-white text-zinc-900 print:min-h-0"
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
              <p className="text-xs text-zinc-500 tabular-nums">Due: {formattedDueDate}</p>
            ) : null
          }
        />

        <section className="mb-8 grid grid-cols-2 gap-6 text-sm print:break-inside-avoid">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Bill to
            </h2>
            <p className="font-semibold text-zinc-900">{meta.client.name || "—"}</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">
              {meta.client.address || meta.project.siteAddress || "—"}
            </p>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Project
            </h2>
            <p className="font-semibold text-zinc-900">{meta.project.name || "—"}</p>
            <p className="mt-1 text-zinc-700">Estimate {estimate.number}</p>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-zinc-200 p-6 print:break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Payment milestone
          </p>
          <div className="mt-4 flex items-start justify-between gap-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
                {payment.title}
              </h1>
              {payment.description ? (
                <div className="mt-3 max-w-2xl text-sm leading-6 text-zinc-700">
                  <ProposalScopePreview text={payment.description} variant="print" />
                </div>
              ) : null}
              {formattedDueDate ? (
                <p className="mt-3 text-sm tabular-nums text-zinc-600">Due: {formattedDueDate}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Amount due
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-950">
                ${fmt(amountDue)}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10 text-sm text-zinc-700 print:break-inside-avoid">
          <p>
            This payment milestone is tied to estimate{" "}
            <span className="font-semibold text-zinc-900">{estimate.number}</span> for{" "}
            <span className="font-semibold text-zinc-900">
              {meta.project.name || "this project"}
            </span>
            .
          </p>
        </section>

        <footer className="border-t border-zinc-200 pt-6 text-xs text-zinc-400 whitespace-pre-wrap">
          {company.invoiceFooter || `Payment Milestone — ${company.companyName}`}
        </footer>
      </article>
    </div>
  );
}
