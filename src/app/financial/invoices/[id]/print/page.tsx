import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoiceById, getProjectById } from "@/lib/data";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { InvoiceDocument } from "../invoice-document";

/** Company block must reflect latest `company_profile` after Settings saves (no stale RSC cache). */
export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Awaited<ReturnType<typeof getInvoiceById>> | null = null;
  try {
    invoice = await getInvoiceById(id);
  } catch (e) {
    logServerPageDataError(`financial/invoices/${id}/print`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "invoice")}
        backHref="/financial/invoices"
        backLabel="Back to invoices"
      />
    );
  }
  if (!invoice) notFound();

  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  let company: Awaited<ReturnType<typeof fetchDocumentCompanyProfile>>;
  try {
    [project, company] = await Promise.all([
      getProjectById(invoice.projectId),
      fetchDocumentCompanyProfile(),
    ]);
  } catch (e) {
    logServerPageDataError(`financial/invoices/${id}/print details`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "invoice details")}
        backHref={`/financial/invoices/${id}`}
        backLabel="View invoice in app"
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-white p-8 text-black mx-auto print:p-0"
      style={{ maxWidth: "8.5in" }}
    >
      <SetBreadcrumbEntityTitle label={invoice.invoiceNo} />
      <InvoiceDocument
        invoice={invoice}
        projectName={project?.name ?? invoice.projectId}
        company={company}
      />
      <p className="mt-6 text-center text-xs text-zinc-500 print:hidden">
        <Link href={`/financial/invoices/${id}`} className="text-blue-600 underline">
          View in app
        </Link>
      </p>
    </div>
  );
}
