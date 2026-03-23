import { notFound } from "next/navigation";
import { PageLayout, PageHeader } from "@/components/base";
import { getApBillById, getApBillPayments } from "@/lib/data";
import { BillDetailClient } from "./bill-detail-client";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ addPayment?: string }> };

export default async function BillDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const [bill, payments] = await Promise.all([getApBillById(id), getApBillPayments(id)]);
  if (!bill) notFound();

  return (
    <PageLayout
      header={
        <PageHeader
          title={bill.bill_no ?? "Bill"}
          description={`${bill.vendor_name} · ${bill.bill_type}${bill.project_name ? ` · ${bill.project_name}` : ""}`}
        />
      }
    >
      <SetBreadcrumbEntityTitle label={bill.bill_no?.trim() || bill.vendor_name?.trim() || null} />
      <BillDetailClient bill={bill} payments={payments} addPaymentOpen={sp.addPayment === "1"} />
    </PageLayout>
  );
}
