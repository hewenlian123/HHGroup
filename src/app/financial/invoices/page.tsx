import { PermissionDenied } from "@/components/ui/system-state";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadDefaultInvoiceList } from "@/lib/financial/invoice-list-read";
import { logServerPageDataError } from "@/lib/server-load-warning";
import { InvoicesPageClient } from "./invoices-list-client";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) {
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  }

  try {
    const { invoices, projects } = await loadDefaultInvoiceList(guard.client);
    return <InvoicesPageClient initialInvoices={invoices} initialProjects={projects} />;
  } catch (error) {
    logServerPageDataError("financial/invoices", error);
    const message = error instanceof Error ? error.message : "Failed to load invoices.";
    return <InvoicesPageClient initialInvoices={[]} initialProjects={[]} initialError={message} />;
  }
}
