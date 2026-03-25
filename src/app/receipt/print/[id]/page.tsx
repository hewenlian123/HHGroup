import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { ReceiptPrintAutoprint } from "../receipt-print-autoprint";
import { ReceiptPrintClientShell } from "../receipt-print-client-shell";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export const metadata: Metadata = {
  title: "Worker Payment Receipt",
  robots: { index: false, follow: false },
};

export default async function WorkerPaymentReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const autoprint = sp.autoprint === "1" || sp.autoprint === "true";

  let payment: Awaited<ReturnType<typeof getWorkerPaymentById>> | null = null;
  try {
    payment = await getWorkerPaymentById(id);
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

  let worker: Awaited<ReturnType<typeof getWorkerById>> | undefined;
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  let receiptData: Awaited<ReturnType<typeof getWorkerPaymentReceiptPayload>>;
  let receiptNo: string;
  let company: Awaited<ReturnType<typeof fetchDocumentCompanyProfile>>;
  try {
    [worker, project, receiptData, receiptNo, company] = await Promise.all([
      getWorkerById(payment.workerId),
      payment.projectId ? getProjectById(payment.projectId) : Promise.resolve(undefined),
      getWorkerPaymentReceiptPayload(payment.id, payment.workerId, payment.amount, {
        laborEntryIdsFromPayment: payment.laborEntryIds,
      }),
      computeWorkerPaymentReceiptNo(payment.id, payment.paymentDate),
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
    <div className="receipt-print-route">
      <SetBreadcrumbEntityTitle label={receiptNo} />
      <ReceiptPrintAutoprint enabled={autoprint} />
      <ReceiptPrintClientShell receiptNo={receiptNo}>
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
