import { notFound } from "next/navigation";
import { PageLayout, PageHeader } from "@/components/base";
import { getApBillById, getProjects } from "@/lib/data";
import { EditBillClient } from "./edit-bill-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditBillPage({ params }: Props) {
  const { id } = await params;
  const [bill, projects] = await Promise.all([getApBillById(id), getProjects()]);
  if (!bill) notFound();
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <PageLayout
      header={
        <PageHeader title={`Edit ${bill.bill_no ?? "bill"}`} description={bill.vendor_name} />
      }
    >
      <EditBillClient bill={bill} projects={projectOptions} />
    </PageLayout>
  );
}
