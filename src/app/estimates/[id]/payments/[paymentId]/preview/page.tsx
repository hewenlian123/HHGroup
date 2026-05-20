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

export const dynamic = "force-dynamic";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function EstimatePaymentPreviewPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;

  const [estimate, meta, paymentSchedule, company] = await Promise.all([
    getEstimateById(id),
    getEstimateMeta(id),
    getPaymentSchedule(id),
    fetchDocumentCompanyProfile(),
  ]);

  if (!estimate || !meta) redirect("/estimates");

  const payment = paymentSchedule.find((item) => item.id === paymentId);
  if (!payment) notFound();

  const amountDue = paymentMilestoneAmount(payment, estimate.total);
  const estimateDate =
    meta.estimateDate ?? (estimate.updatedAt ? estimate.updatedAt.slice(0, 10) : "—");

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 print:min-h-0"
      role="document"
      aria-label="Payment request preview"
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
          documentTitle="Payment Request"
          documentNo={estimate.number}
          documentDate={estimateDate}
          documentNoLabel="Related Estimate"
          extraRight={
            payment.dueDate ? (
              <p className="text-xs text-zinc-500 tabular-nums">Due date: {payment.dueDate}</p>
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
                <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {payment.description}
                </p>
              ) : null}
              {payment.dueDate ? (
                <p className="mt-3 text-sm tabular-nums text-zinc-600">
                  Due date: {payment.dueDate}
                </p>
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
            This payment request is tied to estimate{" "}
            <span className="font-semibold text-zinc-900">{estimate.number}</span> for{" "}
            <span className="font-semibold text-zinc-900">
              {meta.project.name || "this project"}
            </span>
            .
          </p>
        </section>

        <footer className="border-t border-zinc-200 pt-6 text-xs text-zinc-400 whitespace-pre-wrap">
          {company.invoiceFooter || `Payment Request — ${company.companyName}`}
        </footer>
      </article>
    </div>
  );
}
