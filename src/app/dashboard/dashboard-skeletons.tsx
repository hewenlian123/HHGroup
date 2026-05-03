import { Skeleton } from "@/components/ui/skeleton";

const KPI_COUNT = 5;

/** Matches `kpi-metric` + sparkline row height so layout does not shift when data arrives. */
export function DashboardKpiSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 lg:gap-4"
      aria-hidden
    >
      {Array.from({ length: KPI_COUNT }).map((_, i) => (
        <div key={i} className="kpi-metric relative overflow-hidden">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-8 w-20" />
          <Skeleton className="mt-1.5 h-3 w-32" />
          <Skeleton className="mt-1.5 h-4 w-full md:h-5" />
        </div>
      ))}
    </div>
  );
}

const PROJECT_ROW_SKELETONS = 5;

/**
 * Placeholder for main column (recent projects + activity) — fixed row counts and section shell
 * heights to avoid jump when RSC resolves.
 */
export function DashboardMainSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 md:gap-6 lg:grid-cols-3" aria-hidden>
      <div className="space-y-2 md:space-y-6 lg:col-span-2">
        <section className="max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-border/50 max-md:bg-transparent max-md:pb-3 max-md:shadow-none md:overflow-hidden md:rounded-xl md:border md:border-gray-100 md:bg-white md:pb-0 md:shadow-sm dark:md:border-border dark:md:bg-card md:dark:shadow-none">
          <div className="border-b border-gray-100 px-4 py-2 md:py-3 dark:border-border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-36 md:h-6 md:w-40" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-0.5 hidden h-3 w-64 md:block" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
            {Array.from({ length: PROJECT_ROW_SKELETONS }).map((_, i) => (
              <div key={i} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40 max-w-[200px]" />
                  <Skeleton className="h-3 w-24 max-w-[120px]" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0" />
              </div>
            ))}
          </div>
          <div className="table-responsive hidden px-4 pb-2 pt-0 md:block">
            <table className="w-full min-w-0 text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-white">
                  <th className="py-2.5 px-4 text-left">
                    <Skeleton className="h-3 w-16" />
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    <Skeleton className="ml-auto h-3 w-12" />
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    <Skeleton className="ml-auto h-3 w-14" />
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    <Skeleton className="ml-auto h-3 w-14" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PROJECT_ROW_SKELETONS }).map((_, i) => (
                  <tr key={i} className="h-10 border-b">
                    <td className="py-2 px-4">
                      <Skeleton className="h-4 w-[min(40vw,200px)]" />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Skeleton className="ml-auto h-4 w-12" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="hidden space-y-4 lg:block">
        <Skeleton className="h-32 w-full rounded-sm" />
        <Skeleton className="h-40 w-full rounded-sm" />
      </div>
    </div>
  );
}
