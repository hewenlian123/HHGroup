import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getWorkers } from "@/lib/workers-db";
import { WorkersListClient } from "./workers-list-client";
import { WorkersActions } from "./workers-actions";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const rows = await getWorkers();

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

      <WorkersListClient rows={rows} />
    </PageLayout>
  );
}
