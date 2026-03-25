import { PageLayout, PageHeader } from "@/components/base";
import { getProjects } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { NewBillClient } from "./new-bill-client";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let dataLoadWarning: string | null = null;
  try {
    projects = await getProjects();
  } catch (e) {
    logServerPageDataError("bills/new", e);
    dataLoadWarning = serverDataLoadWarning(e, "projects");
  }
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      header={
        <PageHeader title="New bill" description="Create a vendor, labor, or other payable bill." />
      }
    >
      <NewBillClient projects={projectOptions} dataLoadWarning={dataLoadWarning} />
    </PageLayout>
  );
}
