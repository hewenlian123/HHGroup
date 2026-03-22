import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";

/**
 * Receipt body for modal preview — same {@link WorkerPaymentReceiptBody} as `/receipt/print/[id]`.
 */
export function WorkerPaymentReceiptDocument({ data }: { data: WorkerPaymentReceiptPreviewDto }) {
  const r = data.receipt;

  return (
    <WorkerPaymentReceiptBody
      company={data.company}
      receiptNo={data.receiptNo}
      paymentDate={data.payment.paymentDate}
      workerName={data.workerName}
      projectName={data.projectName}
      paymentMethod={data.payment.paymentMethod}
      amount={data.payment.amount}
      notes={data.payment.notes}
      laborLines={r?.laborLines ?? []}
      reimbLines={r?.reimbLines ?? []}
      laborSubtotal={r?.laborSubtotal ?? 0}
      reimbSubtotal={r?.reimbSubtotal ?? 0}
      balance={r?.balance ?? null}
    />
  );
}
