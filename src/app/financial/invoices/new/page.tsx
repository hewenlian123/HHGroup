import NewInvoiceClient from "./new-invoice-client";
import { getEstimateInvoicePrefill } from "./estimate-prefill";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<{ estimateId?: string; paymentScheduleItemId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const estimateId = params.estimateId?.trim() ?? "";
  const paymentScheduleItemId = params.paymentScheduleItemId?.trim() ?? "";
  const estimatePrefill =
    estimateId && paymentScheduleItemId
      ? await getEstimateInvoicePrefill(estimateId, paymentScheduleItemId)
      : null;

  return <NewInvoiceClient estimatePrefill={estimatePrefill} />;
}
