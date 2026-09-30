import { Suspense } from "react";
import { DashboardMainSection } from "./dashboard-main-section";
import { DashboardMainSkeleton } from "./dashboard-skeletons";

export const dynamic = "force-dynamic";

const dashboardFrameClass =
  "hh-list-frame page-stack flex min-w-0 max-w-full flex-col overflow-x-hidden bg-[var(--hh-l0-canvas)] py-3 md:py-6";

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <div className={dashboardFrameClass}>
      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMainSection searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}
