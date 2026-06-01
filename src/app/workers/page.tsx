import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { unstable_noStore as noStore } from "next/cache";
import { getWorkers as getLaborWorkersFlat, type Worker as LaborWorker } from "@/lib/labor-db";
import { getWorkers } from "@/lib/workers-db";
import type { WorkerRow, WorkerStatus } from "@/lib/workers-db";
import { getServerSupabaseInternal } from "@/lib/supabase-server";
import { getWorkerPaymentsWithClient, type WorkerPayment } from "@/lib/worker-payments-db";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { WorkersListClient } from "./workers-list-client";
import { WorkersActions } from "./workers-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function laborWorkerToWorkerRow(w: LaborWorker): WorkerRow {
  const st: WorkerStatus = w.status === "inactive" ? "Inactive" : "Active";
  return {
    id: w.id,
    name: w.name,
    phone: w.phone ?? null,
    trade: w.trade ?? null,
    daily_rate: Number(w.dailyRate) || 0,
    default_ot_rate: 0,
    status: st,
    notes: w.notes ?? null,
    created_at: w.createdAt ?? "",
  };
}

export default async function WorkersPage() {
  noStore();
  let rows: Awaited<ReturnType<typeof getWorkers>> = [];
  let initialLastPayments: WorkerPayment[] = [];
  let dataLoadWarning: string | null = null;
  const internal = getServerSupabaseInternal();
  try {
    rows = await getWorkers(internal ?? undefined);
  } catch (e) {
    logServerPageDataError("workers", e);
    dataLoadWarning = serverDataLoadWarning(e, "workers");
  }

  /** Same table, narrower column set — fills list when workers-db extended select misbehaves. */
  if (rows.length === 0) {
    try {
      const lw = await getLaborWorkersFlat(internal ?? undefined);
      if (lw.length > 0) rows = lw.map(laborWorkerToWorkerRow);
    } catch {
      /* keep empty / existing warning */
    }
  }

  try {
    if (internal) {
      initialLastPayments = await getWorkerPaymentsWithClient(internal, { limit: 500 });
    }
  } catch (e) {
    logServerPageDataError("worker center last payments", e);
  }

  return (
    <PageLayout
      className={cn("max-md:!py-3", "max-md:!gap-3")}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Worker Center"
            description="Run worker payroll tasks from one place: labor, receipts, advances, payments, and statements."
          />
        </div>
      }
    >
      <div className="hidden md:block">
        <SectionHeader label="Worker Center" action={<WorkersActions />} />
        <Divider />
      </div>

      <WorkersListClient
        rows={rows}
        dataLoadWarning={dataLoadWarning}
        initialLastPayments={initialLastPayments}
      />
    </PageLayout>
  );
}
