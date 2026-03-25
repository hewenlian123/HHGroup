import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getWorkers } from "@/lib/workers-db";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { WorkersListClient } from "./workers-list-client";
import { WorkersActions } from "./workers-actions";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  let rows: Awaited<ReturnType<typeof getWorkers>> = [];
  let dataLoadWarning: string | null = null;
  try {
    rows = await getWorkers();
  } catch (e) {
    logServerPageDataError("workers", e);
    dataLoadWarning = serverDataLoadWarning(e, "workers");
  }

  return (
    <PageLayout
      header={
        <PageHeader
          title="Workers"
          description="Manage workers: trades, daily rate, default OT rate, and status."
        />
      }
    >
      <SectionHeader label="Workers" action={<WorkersActions />} />
      <Divider />

      <WorkersListClient rows={rows} dataLoadWarning={dataLoadWarning} />
    </PageLayout>
  );
}
