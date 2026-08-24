import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import { getWorkerByIdWithClient } from "@/lib/labor-db";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { ReceiptPrintAutoprint } from "../receipt-print-autoprint";
import { ReceiptPrintClientShell } from "../receipt-print-client-shell";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import { getWorkerPaymentByIdWithClient } from "@/lib/worker-payments-db";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";

export const metadata: Metadata = {
  title: "Worker Payment Receipt",
  robots: { index: false, follow: false },
};

export default async function WorkerPaymentReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string; pdf?: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const autoprint = sp.autoprint === "1" || sp.autoprint === "true";
  const pdfCapture = sp.pdf === "1" || sp.pdf === "true";

  const supabase = getServerSupabaseAdminNoStore();
  if (!supabase) {
    return (
      <ServerDataLoadFallback
        message="Supabase not configured."
        backHref="/labor/payments"
        backLabel="Back to payments"
      />
    );
  }

  let payment: Awaited<ReturnType<typeof getWorkerPaymentByIdWithClient>> | null = null;
  try {
    payment = await getWorkerPaymentByIdWithClient(supabase, id);
  } catch (e) {
    logServerPageDataError(`receipt/print/${id}`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "payment receipt")}
        backHref="/labor/payments"
        backLabel="Back to payments"
      />
    );
  }
  if (!payment) notFound();

  let worker: Awaited<ReturnType<typeof getWorkerByIdWithClient>> | undefined;
  let project: Awaited<ReturnType<typeof getProjectByIdWithClient>> | undefined;
  let receiptData: Awaited<ReturnType<typeof getWorkerPaymentReceiptPayload>>;
  let receiptNo: string;
  let company: Awaited<ReturnType<typeof fetchDocumentCompanyProfile>>;
  try {
    [worker, project, receiptData, receiptNo, company] = await Promise.all([
      getWorkerByIdWithClient(supabase, payment.workerId),
      payment.projectId
        ? getProjectByIdWithClient(supabase, payment.projectId)
        : Promise.resolve(undefined),
      getWorkerPaymentReceiptPayload(payment.id, payment.workerId, payment.amount, {
        laborEntryIdsFromPayment: payment.laborEntryIds,
        client: supabase,
      }),
      computeWorkerPaymentReceiptNo(payment.id, payment.paymentDate, supabase),
      fetchDocumentCompanyProfile(),
    ]);
  } catch (e) {
    logServerPageDataError(`receipt/print/${id} details`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "receipt details")}
        backHref="/labor/payments"
        backLabel="Back to payments"
      />
    );
  }
  if (!worker) notFound();

  const projectName = project?.name ?? (payment.projectId ? payment.projectId : null);
  const laborLines = receiptData?.laborLines ?? [];
  const reimbLines = receiptData?.reimbLines ?? [];
  const laborSubtotal = receiptData?.laborSubtotal ?? 0;
  const reimbSubtotal = receiptData?.reimbSubtotal ?? 0;
  const bal = receiptData?.balance ?? null;

  return (
    <div
      className="receipt-print-route"
      data-worker-payment-receipt-pdf-capture={pdfCapture ? "true" : undefined}
      data-hh-context="document-route"
      data-hh-theme="document-light"
      role="document"
      aria-label="Worker payment receipt print view"
    >
      {!pdfCapture ? <SetBreadcrumbEntityTitle label={receiptNo} /> : null}
      {!pdfCapture ? <ReceiptPrintAutoprint enabled={autoprint} /> : null}
      <ReceiptPrintClientShell>
        <WorkerPaymentReceiptBody
          company={company}
          receiptNo={receiptNo}
          paymentDate={payment.paymentDate}
          workerName={worker.name}
          workerTrade={worker.trade}
          projectName={projectName}
          paymentMethod={payment.paymentMethod}
          amount={payment.amount}
          notes={payment.notes}
          laborLines={laborLines}
          reimbLines={reimbLines}
          laborSubtotal={laborSubtotal}
          reimbSubtotal={reimbSubtotal}
          balance={bal}
        />
      </ReceiptPrintClientShell>
    </div>
  );
}
