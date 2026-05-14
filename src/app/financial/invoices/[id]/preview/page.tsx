import { notFound } from "next/navigation";
import { getInvoiceById, getProjectById } from "@/lib/data";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { InvoiceDocument } from "../invoice-document";
import { InvoicePreviewShell } from "./invoice-preview-shell";

export const dynamic = "force-dynamic";

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Awaited<ReturnType<typeof getInvoiceById>> | null = null;
  try {
    invoice = await getInvoiceById(id);
  } catch (e) {
    logServerPageDataError(`financial/invoices/${id}/preview`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "invoice")}
        backHref="/financial/invoices"
        backLabel="Back to invoices"
      />
    );
  }
  if (!invoice) notFound();

  try {
    const [project, company] = await Promise.all([
      getProjectById(invoice.projectId),
      fetchDocumentCompanyProfile(),
    ]);

    return (
      <InvoicePreviewShell invoiceId={id} invoiceNo={invoice.invoiceNo}>
        <SetBreadcrumbEntityTitle label={`${invoice.invoiceNo} Preview`} />
        <InvoiceDocument
          invoice={invoice}
          projectName={project?.name ?? invoice.projectId}
          company={company}
        />
      </InvoicePreviewShell>
    );
  } catch (e) {
    logServerPageDataError(`financial/invoices/${id}/preview details`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "invoice details")}
        backHref={`/financial/invoices/${id}`}
        backLabel="View invoice in app"
      />
    );
  }
}
