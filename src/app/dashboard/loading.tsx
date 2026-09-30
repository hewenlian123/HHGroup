import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardMainSkeleton } from "./dashboard-skeletons";

const dashboardFrameClass =
  "hh-list-frame page-stack flex min-w-0 max-w-full flex-col overflow-x-hidden bg-[var(--hh-l0-canvas)] py-3 md:py-6";

/** Route-level shell while the dashboard RSC tree hydrates — real title + stable skeletons, no data. */
export default function LoadingDashboard() {
  return (
    <div className={dashboardFrameClass}>
      <DashboardPageHeader />
      <DashboardMainSkeleton />
    </div>
  );
}
