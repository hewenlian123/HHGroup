import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getInvoiceById, getProjectById } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { InvoiceDocument } from "../invoice-document";
import { InvoicePreviewShell } from "./invoice-preview-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  noStore();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  const supabase = guard.client;
  let invoice: Awaited<ReturnType<typeof getInvoiceById>> | null = null;
  try {
    invoice = await getInvoiceById(id, supabase);
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
      getProjectById(invoice.projectId, supabase),
      fetchDocumentCompanyProfile(supabase),
    ]);

    return (
      <InvoicePreviewShell key={invoice.id} invoiceId={id} invoiceNo={invoice.invoiceNo}>
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
