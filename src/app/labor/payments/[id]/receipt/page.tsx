import { notFound } from "next/navigation";
import { WorkerPaymentReceiptBody } from "@/components/labor/worker-payment-receipt-body";
import { WorkerPaymentReceiptScreen } from "./receipt-screen-client";
import { getWorkerByIdWithClient } from "@/lib/labor-db";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { getWorkerPaymentReceiptPayload } from "@/lib/worker-payment-receipt-data";
import { computeWorkerPaymentReceiptNo } from "@/lib/worker-payment-receipt-no";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabaseAdminNoStore } from "@/lib/supabase-server";
import { getWorkerPaymentByIdWithClient } from "@/lib/worker-payments-db";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";

export default async function WorkerPaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const supabase = getServerSupabaseAdminNoStore();
  if (!supabase) {
    return (
      <ServerDataLoadFallback
        message="Supabase is not configured."
        backHref="/labor/payments"
        backLabel="Back to payments"
      />
    );
  }

  let payment: Awaited<ReturnType<typeof getWorkerPaymentByIdWithClient>> | null = null;
  try {
    payment = await getWorkerPaymentByIdWithClient(supabase, id);
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
      <WorkerPaymentReceiptScreen paymentId={payment.id}>
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
