import { PageLayout, PageHeader } from "@/components/base";
import { getProjects } from "@/lib/data";
import { NewBillClient } from "./new-bill-client";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const projects = await getProjects();
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      header={
        <PageHeader title="New bill" description="Create a vendor, labor, or other payable bill." />
      }
    >
      <NewBillClient projects={projectOptions} />
    </PageLayout>
  );
}
