import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadInvoiceDetailWithClient } from "@/lib/invoice-detail-read";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import InvoiceDetailClient from "./invoice-detail-client";
import { emitRscTiming } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const pageStartedAt = performance.now();
  const { id } = await params;
  noStore();

  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();

  let initialData;
  const serverDataStartedAt = performance.now();
  try {
    initialData = await loadInvoiceDetailWithClient(id, guard.client);
  } catch (error) {
    logServerPageDataError(`financial/invoices/${id}`, error);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(error, "invoice")}
        backHref="/financial/invoices"
        backLabel="Back to invoices"
      />
    );
  }

  if (!initialData) notFound();

  const serverDataCompletedAt = performance.now();
  const rscPreparedAt = performance.now();
  emitRscTiming("invoices/[id]", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return <InvoiceDetailClient invoiceId={id} initialData={initialData} />;
}
