import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingInvoiceDetail() {
  return (
    <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
      <PageHeader title="Invoice" subtitle="Loading invoice details…" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-gray-300 p-6 dark:border-border">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-4 w-72 rounded-md" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
      </div>

      <div className="overflow-hidden rounded-sm border border-gray-300 dark:border-border">
        <div className="p-4 pb-2">
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
        <div className="px-4 pb-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
