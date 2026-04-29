import { Skeleton } from "@/components/ui/skeleton";

/** Route-level shell while Dashboard RSC loads — matches outer layout, no data logic. */
export default function LoadingDashboard() {
  return (
    <div className="min-h-full bg-page dark:bg-background">
      <div className="page-container page-stack max-md:!gap-2 max-md:!py-2">
        <header className="flex h-11 shrink-0 items-center md:hidden" aria-hidden>
          <Skeleton className="h-5 w-28" />
        </header>
        <header
          className="hidden flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 md:flex"
          aria-hidden
        >
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-32 shrink-0" />
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-metric relative overflow-hidden">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-8 w-20" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
          ))}
        </div>

        <div className="border-b border-border/60" aria-hidden />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 border-b border-border/40 py-2.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
