import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardKpiSkeleton, DashboardMainSkeleton } from "./dashboard-skeletons";

/** Route-level shell while the dashboard RSC tree hydrates — real title + stable skeletons, no data. */
export default function LoadingDashboard() {
  return (
    <div className="min-h-full bg-page dark:bg-background">
      <div className="page-container page-stack max-md:!gap-2 max-md:!py-2">
        <DashboardPageHeader />
        <DashboardKpiSkeleton />
        <DashboardMainSkeleton />
      </div>
    </div>
  );
}
