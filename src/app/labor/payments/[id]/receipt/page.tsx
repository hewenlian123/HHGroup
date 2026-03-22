import { notFound } from "next/navigation";
import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import { WorkerPaymentReceiptScreen } from "./receipt-screen-client";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";

export default async function WorkerPaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const payment = await getWorkerPaymentById(id);
  if (!payment) notFound();

  const [worker, project, receiptData, receiptNo, company] = await Promise.all([
    getWorkerById(payment.workerId),
    payment.projectId ? getProjectById(payment.projectId) : Promise.resolve(undefined),
    getWorkerPaymentReceiptPayload(payment.id, payment.workerId, payment.amount, {
      laborEntryIdsFromPayment: payment.laborEntryIds,
    }),
    computeWorkerPaymentReceiptNo(payment.id, payment.paymentDate),
    fetchDocumentCompanyProfile(),
  ]);
  if (!worker) notFound();

  const projectName = project?.name ?? (payment.projectId ? payment.projectId : null);
  const laborLines = receiptData?.laborLines ?? [];
  const reimbLines = receiptData?.reimbLines ?? [];
  const laborSubtotal = receiptData?.laborSubtotal ?? 0;
  const reimbSubtotal = receiptData?.reimbSubtotal ?? 0;
  const bal = receiptData?.balance ?? null;

  return (
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
  );
}
