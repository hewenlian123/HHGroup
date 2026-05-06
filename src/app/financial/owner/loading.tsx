import { PageLayout, PageHeader } from "@/components/base";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const cardSkeleton =
  "rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80";

export default function FinanceOwnerDashboardLoading() {
  return (
    <PageLayout
      className="bg-zinc-50 dark:bg-background"
      divider={false}
      header={
        <PageHeader
          title="Finance dashboard"
          description="Loading your financial overview…"
          actions={
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-[140px] rounded-lg" />
              <Skeleton className="h-9 w-[88px] rounded-lg" />
            </div>
          }
        />
      }
    >
      <div className="flex flex-col gap-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] lg:gap-12 lg:pb-[max(3rem,env(safe-area-inset-bottom))] lg:pt-4">
        <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn("kpi-metric px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5", cardSkeleton)}
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-5 h-10 w-full max-w-[10rem]" />
              <Skeleton className="mt-5 h-px w-full bg-transparent" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:gap-8">
          <div className={cn("xl:col-span-8 p-4 sm:p-8 lg:p-10", cardSkeleton)}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-48 max-w-full" />
            <Skeleton className="mt-2 h-4 w-full max-w-md" />
            <Skeleton className="mt-10 min-h-[260px] w-full rounded-xl" />
            <div className="mt-10 space-y-2 border-t border-zinc-100 pt-8 dark:border-border/50">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className={cn("flex flex-col p-5 sm:p-6", cardSkeleton)}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-6 w-20" />
              {Array.from({ length: 4 }).map((_, k) => (
                <Skeleton key={k} className="mt-4 h-[72px] w-full rounded-2xl" />
              ))}
            </div>
            <div className={cn("p-4 sm:p-5", cardSkeleton)}>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-4 h-24 w-full rounded-lg" />
            </div>
          </div>
        </div>

        <div className={cn("p-5 sm:p-8", cardSkeleton)}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          <Skeleton className="mt-6 h-56 w-full rounded-lg" />
        </div>
      </div>
    </PageLayout>
  );
}
