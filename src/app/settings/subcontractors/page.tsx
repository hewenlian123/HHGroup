import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getSubcontractors } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SubcontractorsActions } from "./subcontractors-actions";
import { SubcontractorsTableClient } from "./subcontractors-table-client";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  // Legacy management surface kept for add/edit workflows until `/subcontractors/new`
  // becomes the canonical entry point.
  let rows: Awaited<ReturnType<typeof getSubcontractors>> = [];
  let dataLoadWarning: string | null = null;
  try {
    const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
    if (!guard.ok) throw new Error(guard.error);
    rows = await getSubcontractors(guard.client);
  } catch (e) {
    logServerPageDataError("settings/subcontractors", e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractors");
  }

  return (
    <PageLayout
      frame="embedded"
      header={
        <PageHeader
          variant="workspace"
          title="Subcontractors"
          description="Manage subcontractors."
          actions={
            <Link
              href="/settings"
              className="text-sm text-[var(--hh-link)] underline-offset-2 hover:underline"
            >
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
