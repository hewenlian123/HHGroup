import Link from "next/link";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
} from "@/components/base";
import { getSubcontractors } from "@/lib/data";
import { SubcontractorsActions } from "./subcontractors-actions";
import { SubcontractorsTableClient } from "./subcontractors-table-client";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  const rows = await getSubcontractors();

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
      <SectionHeader
        label="Subcontractors"
        action={<SubcontractorsActions />}
      />
      <Divider />

      <SubcontractorsTableClient rows={rows} />
    </PageLayout>
  );
}
