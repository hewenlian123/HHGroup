import { notFound } from "next/navigation";
import { PageLayout, PageHeader } from "@/components/base";
import { getApBillById, getApBills, getProjects } from "@/lib/data";
import type { ApBillWithProject } from "@/lib/data";
import { EditBillClient } from "./edit-bill-client";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { billsPageWrapClass } from "../../bills-ui-styles";

function uniqueBillCategories(bills: ApBillWithProject[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of bills) {
    const label = row.category?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditBillPage({ params }: Props) {
  const { id } = await params;
  const [bill, projects, bills] = await Promise.all([
    getApBillById(id),
    getProjects(),
    getApBills(),
  ]);
  if (!bill) notFound();
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const learnedCategories = uniqueBillCategories(bills);

  return (
    <PageLayout
      className={billsPageWrapClass}
      header={
        <PageHeader title={`Edit ${bill.bill_no ?? "bill"}`} description={bill.vendor_name} />
      }
    >
      <SetBreadcrumbEntityTitle label={bill.bill_no?.trim() || bill.vendor_name?.trim() || null} />
      <EditBillClient bill={bill} projects={projectOptions} learnedCategories={learnedCategories} />
    </PageLayout>
  );
}
