import { PageLayout, PageHeader } from "@/components/base";
import { getSubcontractors, getSubcontractsWithDetailsAll } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { fetchBillsPageData } from "../bills-api";
import { billsPageWrapClass } from "../bills-ui-styles";
import { NewBillClient } from "./new-bill-client";

export const dynamic = "force-dynamic";

async function fetchSubcontractLinkOptions() {
  try {
    const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
    if (!guard.ok) throw new Error(guard.error);
    const [subcontractors, subcontracts] = await Promise.all([
      getSubcontractors(guard.client),
      getSubcontractsWithDetailsAll(guard.client),
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
      frame="list"
      className={billsPageWrapClass}
      header={
        <PageHeader
          variant="workspace"
          title="New bill"
          description="Create a vendor, labor, or other payable bill."
        />
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
