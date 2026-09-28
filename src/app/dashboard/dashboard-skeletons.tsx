import { Skeleton } from "@/components/ui/skeleton";

/** Geometry matches the flat, attention-first Operations Home. */
export function DashboardMainSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <div className="mt-6 grid border-y border-[var(--hh-border)] lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="py-6 lg:border-r lg:border-[var(--hh-border)] lg:pr-8">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-4 h-12 w-64 max-w-full" />
          <Skeleton className="mt-3 h-3 w-72 max-w-full" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-3 w-20 max-w-full" />
                <Skeleton className="mt-2 h-5 w-16 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="py-6 lg:pl-8">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-5 w-44" />
          <div className="mt-4 space-y-3 border-t border-[var(--hh-border)] pt-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-7">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-5 w-48" />
        <div className="mt-4 grid grid-cols-2 gap-4 border-y border-[var(--hh-border)] py-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="mt-7 grid gap-8 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section}>
            <Skeleton className="h-5 w-40" />
            <div className="mt-3 space-y-3 border-y border-[var(--hh-border)] py-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
