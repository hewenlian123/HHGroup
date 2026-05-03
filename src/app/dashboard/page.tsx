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
    <div className="min-h-full bg-page dark:bg-background">
      <div className="page-container page-stack max-md:!gap-2 max-md:!py-2">
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
