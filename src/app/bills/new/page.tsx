import { PageLayout, PageHeader } from "@/components/base";
import { fetchBillsPageData } from "../bills-api";
import { billsPageWrapClass } from "../bills-ui-styles";
import { NewBillClient } from "./new-bill-client";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const listData = await fetchBillsPageData({});

  return (
    <PageLayout
      className={billsPageWrapClass}
      header={
        <PageHeader title="New bill" description="Create a vendor, labor, or other payable bill." />
      }
    >
      <NewBillClient projects={listData.projects} dataLoadWarning={listData.message} />
    </PageLayout>
  );
}
