import { PageLayout, PageHeader } from "@/components/base";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillsLoading() {
  return (
    <PageLayout
      header={<PageHeader title="Bills" description="Track vendor, labor, and other payables" />}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-border/60 pb-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-6 w-28" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
