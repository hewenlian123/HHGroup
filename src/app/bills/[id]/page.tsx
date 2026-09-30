import { financeReturnPath, financeReturnLabel } from "@/lib/finance-navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageLayout, PageHeader } from "@/components/base";
import { fetchBillDetailData } from "../bills-api";
import { BillDetailClient } from "./bill-detail-client";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { billsDetailMaxClass, billsPageWrapClass } from "../bills-ui-styles";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ addPayment?: string; returnTo?: string }>;
};

export default async function BillDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const returnHref = financeReturnPath(sp.returnTo, "/bills");
  const detail = await fetchBillDetailData(id);
  if (!detail) notFound();
  const { bill, payments } = detail;

  return (
    <PageLayout
      frame="list"
      className={billsPageWrapClass}
      header={
        <PageHeader
          variant="workspace"
          title={bill.bill_no ?? "Bill"}
          description={`${bill.vendor_name} · ${bill.bill_type}${bill.project_name ? ` · ${bill.project_name}` : ""}`}
          actions={
            <Link
              href={returnHref}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--hh-link)] underline decoration-[var(--hh-link-underline)] underline-offset-4"
            >
              {financeReturnLabel(returnHref)}
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
