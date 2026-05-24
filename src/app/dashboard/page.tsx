import { Suspense } from "react";
import { DashboardMainSection } from "./dashboard-main-section";
import { DashboardMainSkeleton } from "./dashboard-skeletons";

export const dynamic = "force-dynamic";

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <div className="dark neo-page-on-graphite min-h-full min-w-0 max-w-full overflow-x-hidden">
      <div className="page-container page-stack min-w-0 max-w-full max-md:!gap-3 max-md:!py-3 max-md:pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] max-md:pl-[max(0.875rem,env(safe-area-inset-left))] max-md:pr-[max(0.875rem,env(safe-area-inset-right))] max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <Suspense fallback={<DashboardMainSkeleton />}>
          <DashboardMainSection searchParamsPromise={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
