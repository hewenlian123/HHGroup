import { NextResponse } from "next/server";
import { getProjectById, getWorkerById, getWorkerPaymentById } from "@/lib/data";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Payment id required." }, { status: 400 });
  }

  try {
    const payment = await getWorkerPaymentById(id);
    if (!payment) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const [worker, project, receiptData, receiptNo] = await Promise.all([
      getWorkerById(payment.workerId),
      payment.projectId ? getProjectById(payment.projectId) : Promise.resolve(undefined),
      getWorkerPaymentReceiptPayload(payment.id, payment.workerId, payment.amount, {
        laborEntryIdsFromPayment: payment.laborEntryIds,
      }),
      computeWorkerPaymentReceiptNo(payment.id, payment.paymentDate),
    ]);

    if (!worker) {
      return NextResponse.json({ error: "Worker not found." }, { status: 404 });
    }

    const projectName = project?.name ?? (payment.projectId ? payment.projectId : null);

    const body: WorkerPaymentReceiptPreviewDto = {
      receiptNo,
      payment: {
        id: payment.id,
        workerId: payment.workerId,
        projectId: payment.projectId,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
      },
      workerName: worker.name,
      projectName,
      receipt: receiptData,
    };

    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load receipt preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
