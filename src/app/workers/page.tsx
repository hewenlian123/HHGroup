import { PageLayout, PageHeader } from "@/components/base";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { getWorkers } from "@/lib/workers-db";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { WorkersListClient } from "./workers-list-client";
import { WorkersActions } from "./workers-actions";
import { cn } from "@/lib/utils";
import { emitRscTiming } from "@/lib/performance/server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function WorkersPage() {
  const pageStartedAt = performance.now();
  noStore();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();
  const serverDataStartedAt = performance.now();
  let data;
  try {
    data = await Promise.all([
      getWorkers(guard.client),
      getWorkerPaymentsWithClient(guard.client, { limit: 500 }),
    ] as const);
  } catch (e) {
    logServerPageDataError("workers", e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "workers")}
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
    );
  }
  const [rows, initialLastPayments] = data;
  const serverDataCompletedAt = performance.now();
  const rscPreparedAt = performance.now();
  emitRscTiming("workers", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <PageLayout
      divider={false}
      className={cn("financial-nums max-md:!py-3", "max-md:!gap-3")}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Worker Center"
            description="Run worker payroll tasks from one place: labor, receipts, advances, payments, and statements."
            actions={<WorkersActions />}
          />
        </div>
      }
    >
      <WorkersListClient
        rows={rows}
        dataLoadWarning={null}
        initialLastPayments={initialLastPayments}
      />
    </PageLayout>
  );
}
