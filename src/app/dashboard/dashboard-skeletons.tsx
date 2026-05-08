import { Skeleton } from "@/components/ui/skeleton";

const KPI_COUNT = 6;

const kpiSkeletonCard =
  "rounded-sm border border-slate-900/[0.045] bg-white/[0.72] px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[10px] dark:border-border/50 dark:bg-zinc-950/32";

/** Matches KPI strip card height so layout does not shift when data arrives. */
export function DashboardKpiSkeleton() {
  return (
    <div
      className="min-w-0 max-w-full max-md:-mx-1 max-md:px-1 max-md:flex max-md:gap-3 max-md:overflow-x-hidden md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-6"
      aria-hidden
    >
      {Array.from({ length: KPI_COUNT }).map((_, i) => (
        <div key={i} className={kpiSkeletonCard}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-28 max-w-full" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

const ROW_SKELETONS = 5;

/**
 * Placeholder for main dashboard grid — cash-first: full-width hero, then 6+6, then rest.
 */
export function DashboardMainSkeleton() {
  const block =
    "rounded-sm border border-slate-900/[0.045] bg-white/[0.78] shadow-[0_1px_0_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[6px] dark:border-border/50 dark:bg-zinc-950/32";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5" aria-hidden>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:col-span-12 lg:grid-cols-3">
        <Skeleton className="h-36 w-full rounded-sm lg:col-span-1" />
        <Skeleton className="h-36 w-full rounded-sm lg:col-span-1" />
        <Skeleton className="h-36 w-full rounded-sm lg:col-span-1" />
      </div>
      <div className={cnPad(block, "lg:col-span-12")}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-4 max-w-xl" />
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="mt-6 h-36 w-full" />
      </div>
      <div className={cnPad(block, "lg:col-span-6")}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-28 w-full" />
      </div>
      <div className={cnPad(block, "lg:col-span-6")}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-28 w-full" />
      </div>
      <div className={cnPad(block, "lg:col-span-12")}>
        <Skeleton className="h-4 w-36" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: ROW_SKELETONS }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
      <div className={cnPad(block, "lg:col-span-8")}>
        <Skeleton className="h-4 w-40" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: ROW_SKELETONS }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className={cnPad(block, "lg:col-span-4")}>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
      <div className={cnPad(block, "lg:col-span-12")}>
        <Skeleton className="h-4 w-48" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function cnPad(shell: string, extra = "") {
  return `${shell} overflow-hidden p-4 ${extra}`;
}
