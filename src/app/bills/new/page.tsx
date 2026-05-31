import { PageLayout, PageHeader } from "@/components/base";
import { getSubcontractors, getSubcontractsWithDetailsAll } from "@/lib/data";
import { fetchBillsPageData } from "../bills-api";
import { billsPageWrapClass } from "../bills-ui-styles";
import { NewBillClient } from "./new-bill-client";

export const dynamic = "force-dynamic";

async function fetchSubcontractLinkOptions() {
  try {
    const [subcontractors, subcontracts] = await Promise.all([
      getSubcontractors(),
      getSubcontractsWithDetailsAll(),
    ]);
    return { subcontractors, subcontracts, message: null as string | null };
  } catch {
    return {
      subcontractors: [],
      subcontracts: [],
      message: "Subcontract link options are unavailable.",
    };
  }
}

export default async function NewBillPage() {
  const [listData, linkOptions] = await Promise.all([
    fetchBillsPageData({}),
    fetchSubcontractLinkOptions(),
  ]);
  const dataLoadWarning = [listData.message, linkOptions.message].filter(Boolean).join(" ") || null;

  return (
    <PageLayout
      className={billsPageWrapClass}
      header={
        <PageHeader title="New bill" description="Create a vendor, labor, or other payable bill." />
      }
    >
      <NewBillClient
        projects={listData.projects}
        subcontractors={linkOptions.subcontractors}
        subcontracts={linkOptions.subcontracts}
        dataLoadWarning={dataLoadWarning}
      />
    </PageLayout>
  );
}
