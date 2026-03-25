import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getSubcontractors } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SubcontractorsActions } from "./subcontractors-actions";
import { SubcontractorsTableClient } from "./subcontractors-table-client";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  let rows: Awaited<ReturnType<typeof getSubcontractors>> = [];
  let dataLoadWarning: string | null = null;
  try {
    rows = await getSubcontractors();
  } catch (e) {
    logServerPageDataError("settings/subcontractors", e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractors");
  }

  return (
    <PageLayout
      header={
        <PageHeader
          title="Subcontractors"
          description="Manage subcontractors."
          actions={
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
              Settings
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Subcontractors" action={<SubcontractorsActions />} />
      <Divider />

      <SubcontractorsTableClient rows={rows} dataLoadWarning={dataLoadWarning} />
    </PageLayout>
  );
}
