import { notFound } from "next/navigation";
import Link from "next/link";
import { PageLayout, PageHeader } from "@/components/base";
import { fetchBillDetailData } from "../bills-api";
import { BillDetailClient } from "./bill-detail-client";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { billsDetailMaxClass, billsPageWrapClass } from "../bills-ui-styles";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ addPayment?: string }> };

export default async function BillDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const detail = await fetchBillDetailData(id);
  if (!detail) notFound();
  const { bill, payments } = detail;

  return (
    <PageLayout
      className={billsPageWrapClass}
      header={
        <PageHeader
          title={bill.bill_no ?? "Bill"}
          description={`${bill.vendor_name} · ${bill.bill_type}${bill.project_name ? ` · ${bill.project_name}` : ""}`}
          actions={
            <Link href="/bills" className="text-sm text-muted-foreground hover:text-foreground">
              Back to Bills
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={bill.bill_no?.trim() || bill.vendor_name?.trim() || null} />
      <div className={billsDetailMaxClass}>
        <BillDetailClient bill={bill} payments={payments} addPaymentOpen={sp.addPayment === "1"} />
      </div>
    </PageLayout>
  );
}
