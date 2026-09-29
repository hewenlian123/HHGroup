import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Route shell for the invoice list. The server payload replaces this without a second browser fetch. */
export default function LoadingInvoices() {
  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Invoices"
        description="Invoice status, due dates, and organization-wide receivable balances."
      />
      <div className="space-y-3" aria-hidden>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
