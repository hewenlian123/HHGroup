import { notFound } from "next/navigation";
import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import { WorkerPaymentReceiptScreen } from "./receipt-screen-client";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export default async function WorkerPaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let payment: Awaited<ReturnType<typeof getWorkerPaymentById>> | null = null;
  try {
    payment = await getWorkerPaymentById(id);
  } catch (e) {
    logServerPageDataError(`labor/payments/${id}/receipt`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "payment")}
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
    logServerPageDataError(`labor/payments/${id}/receipt details`, e);
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
    <>
      <SetBreadcrumbEntityTitle label={receiptNo} />
      <WorkerPaymentReceiptScreen receiptNo={receiptNo} paymentId={payment.id}>
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
      </WorkerPaymentReceiptScreen>
    </>
  );
}
