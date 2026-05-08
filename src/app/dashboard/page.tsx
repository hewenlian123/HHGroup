import { Suspense } from "react";
import { DashboardKpiSection } from "./dashboard-kpi-section";
import { DashboardMainSection } from "./dashboard-main-section";
import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardKpiSkeleton, DashboardMainSkeleton } from "./dashboard-skeletons";

export const dynamic = "force-dynamic";

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <div className="min-h-full min-w-0 max-w-full overflow-x-hidden bg-slate-50 dark:bg-background">
      <div className="page-container page-stack min-w-0 max-w-full max-md:!gap-3 max-md:!py-3 max-md:pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+1rem))] max-md:pl-[max(0.875rem,env(safe-area-inset-left))] max-md:pr-[max(0.875rem,env(safe-area-inset-right))] max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <DashboardPageHeader />
        <Suspense fallback={<DashboardKpiSkeleton />}>
          <DashboardKpiSection />
        </Suspense>
        <Suspense fallback={<DashboardMainSkeleton />}>
          <DashboardMainSection searchParamsPromise={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
