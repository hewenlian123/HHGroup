import { Skeleton } from "@/components/ui/skeleton";

const KPI_COUNT = 6;

const kpiSkeletonCard =
  "rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 py-3 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]";

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

/**
 * Loading shell for the current Command Center HUD.
 * Keeps the title and responsive information hierarchy stable while server data streams.
 */
export function DashboardMainSkeleton() {
  return (
    <section
      className="dashboard-command-hud relative isolate min-w-0 overflow-hidden rounded-xl px-3 py-3 text-[var(--hud-text)] sm:px-4 sm:py-4 md:px-5 md:py-5"
      aria-label="Loading HH Command Center"
      aria-busy="true"
      role="status"
    >
      <div className="dashboard-command-hud__grid" aria-hidden />

      <div className="relative z-10 grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)] xl:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-[var(--hud-muted)]">
            HH Neo Operations OS
          </p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight text-[var(--hud-text)] md:text-[40px]">
            HH Command Center
          </h1>
          <p className="mt-2 max-w-[42rem] text-[13px] leading-relaxed text-[var(--hud-muted)] md:text-[14px]">
            Loading cash, project health, labor, AP, and owner action signals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end" aria-hidden>
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>

      <div
        className="relative z-10 mt-5 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(13rem,18rem)_minmax(24rem,1fr)_minmax(13rem,18rem)] xl:items-center"
        aria-hidden
      >
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[10.5rem] w-full rounded-xl" />
          ))}
        </div>
        <div className="mx-auto aspect-square w-full max-w-[29rem] min-w-0">
          <Skeleton className="h-full w-full rounded-full" />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[10.5rem] w-full rounded-xl" />
          ))}
        </div>
      </div>

      <div
        className="dashboard-quick-actions relative z-10 mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        aria-hidden
      >
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full rounded-lg" />
        ))}
      </div>

      <div
        className="relative z-10 mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]"
        aria-hidden
      >
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>

      <span className="sr-only">Dashboard data is loading.</span>
    </section>
  );
}
