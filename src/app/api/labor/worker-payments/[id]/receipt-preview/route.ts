import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminWithClient } from "@/lib/auth-boundary";
import { getWorkerByIdWithClient } from "@/lib/labor-db";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import { getWorkerPaymentByIdWithClient } from "@/lib/worker-payments-db";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import type { WorkerPaymentReceiptPreviewDto } from "@/lib/worker-payment-receipt-preview-dto";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSupabaseOwnerOrAdminWithClient(req, getServerSupabaseAdminNoStore);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Payment id required." }, { status: 400 });
  }

  try {
    const supabase = guard.client;
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }

    const payment = await getWorkerPaymentByIdWithClient(supabase, id);
    if (!payment) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const [worker, project, receiptData, receiptNo, company] = await Promise.all([
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

    if (!worker) {
      return NextResponse.json({ error: "Worker not found." }, { status: 404 });
    }

    const projectName = project?.name ?? (payment.projectId ? payment.projectId : null);

    const body: WorkerPaymentReceiptPreviewDto = {
      company,
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
