import { notFound } from "next/navigation";
import { getInvoiceById, getProjectById } from "@/lib/data";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import EditInvoiceClient from "./edit-invoice-client";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Awaited<ReturnType<typeof getInvoiceById>> | null = null;

  try {
    invoice = await getInvoiceById(id);
  } catch (e) {
    logServerPageDataError(`financial/invoices/${id}/edit`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "invoice")}
        backHref="/financial/invoices"
        backLabel="Back to invoices"
      />
    );
  }

  if (!invoice) notFound();

  let initialProjectName = invoice.projectId;
  try {
    const project = await getProjectById(invoice.projectId);
    initialProjectName = project?.name ?? invoice.projectId;
  } catch {
    initialProjectName = invoice.projectId;
  }

  return (
    <>
      <SetBreadcrumbEntityTitle label={`${invoice.invoiceNo} Edit`} />
      <EditInvoiceClient invoice={invoice} initialProjectName={initialProjectName} />
    </>
  );
}
