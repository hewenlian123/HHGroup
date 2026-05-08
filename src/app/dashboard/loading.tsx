import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardKpiSkeleton, DashboardMainSkeleton } from "./dashboard-skeletons";

/** Route-level shell while the dashboard RSC tree hydrates — real title + stable skeletons, no data. */
export default function LoadingDashboard() {
  return (
    <div className="min-h-full min-w-0 max-w-full overflow-x-hidden bg-slate-50 dark:bg-background">
      <div className="page-container page-stack min-w-0 max-w-full max-md:!gap-3 max-md:!py-3 max-md:pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+1rem))] max-md:pl-[max(0.875rem,env(safe-area-inset-left))] max-md:pr-[max(0.875rem,env(safe-area-inset-right))] max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <DashboardPageHeader />
        <DashboardKpiSkeleton />
        <DashboardMainSkeleton />
      </div>
    </div>
  );
}
