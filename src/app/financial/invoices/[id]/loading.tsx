import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingInvoiceDetail() {
  return (
    <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
      <PageHeader title="Invoice" subtitle="Loading invoice details…" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16 rounded-hh-standard" />
          <Skeleton className="h-7 w-32 rounded-hh-standard" />
          <Skeleton className="h-6 w-20 rounded-hh-standard" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-hh-standard" />
          <Skeleton className="h-9 w-24 rounded-hh-standard" />
        </div>
      </div>

      <div className="space-y-3 rounded-hh-compact border border-[var(--hh-border)] p-6">
        <Skeleton className="h-4 w-40 rounded-hh-standard" />
        <Skeleton className="h-4 w-72 rounded-hh-standard" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-3 w-20 rounded-hh-standard" />
          <Skeleton className="h-3 w-20 rounded-hh-standard" />
          <Skeleton className="h-3 w-20 rounded-hh-standard" />
        </div>
      </div>

      <div className="overflow-hidden rounded-hh-compact border border-[var(--hh-border)]">
        <div className="p-4 pb-2">
          <Skeleton className="h-4 w-24 rounded-hh-standard" />
        </div>
        <div className="px-4 pb-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48 rounded-hh-standard" />
              <Skeleton className="h-4 w-20 rounded-hh-standard" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
