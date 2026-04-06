import { PageLayout, PageHeader } from "@/components/base";
import {
  getSubcontractorsWithInsuranceAlerts,
  getSubcontractsSummaryAll,
  getBillsSummaryAll,
  getPaymentsSummaryAll,
} from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { cn } from "@/lib/utils";
import { SubcontractorsListClient } from "./subcontractors-list-client";

export const dynamic = "force-dynamic";

export default async function SubcontractorsPage() {
  let subcontractors: Awaited<ReturnType<typeof getSubcontractorsWithInsuranceAlerts>> = [];
  let subcontracts: Awaited<ReturnType<typeof getSubcontractsSummaryAll>> = [];
  let billsSummary: Awaited<ReturnType<typeof getBillsSummaryAll>> = [];
  let paymentsSummary: Awaited<ReturnType<typeof getPaymentsSummaryAll>> = [];
  let dataLoadWarning: string | null = null;

  try {
    [subcontractors, subcontracts, billsSummary, paymentsSummary] = await Promise.all([
      getSubcontractorsWithInsuranceAlerts(),
      getSubcontractsSummaryAll(),
      getBillsSummaryAll(),
      getPaymentsSummaryAll(),
    ]);
  } catch (e) {
    logServerPageDataError("subcontractors", e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractors summary");
  }

  const subcontractIdsBySubcontractorId = new Map<string, string[]>();
  const totalContractsBySubcontractorId = new Map<string, number>();
  for (const s of subcontracts) {
    const list = subcontractIdsBySubcontractorId.get(s.subcontractor_id) ?? [];
    list.push(s.id);
    subcontractIdsBySubcontractorId.set(s.subcontractor_id, list);
    const sum = (totalContractsBySubcontractorId.get(s.subcontractor_id) ?? 0) + s.contract_amount;
    totalContractsBySubcontractorId.set(s.subcontractor_id, sum);
  }

  const approvedBySubcontractId = new Map<string, number>();
  for (const b of billsSummary) {
    if (b.status !== "Approved" && b.status !== "Paid") continue;
    const sum = (approvedBySubcontractId.get(b.subcontract_id) ?? 0) + b.amount;
    approvedBySubcontractId.set(b.subcontract_id, sum);
  }
  const paidBySubcontractId = new Map<string, number>();
  for (const p of paymentsSummary) {
    const sum = (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount;
    paidBySubcontractId.set(p.subcontract_id, sum);
  }

  const rows = subcontractors.map((sc) => {
    const subcontractIds = subcontractIdsBySubcontractorId.get(sc.id) ?? [];
    const totalContracts = totalContractsBySubcontractorId.get(sc.id) ?? 0;
    let approved = 0;
    let paid = 0;
    for (const sid of subcontractIds) {
      approved += approvedBySubcontractId.get(sid) ?? 0;
      paid += paidBySubcontractId.get(sid) ?? 0;
    }
    const outstanding = approved - paid;
    return {
      id: sc.id,
      name: sc.name,
      totalContracts,
      approved,
      paid,
      outstanding,
      insurance_alert: sc.insurance_alert,
      insurance_expiration_date: sc.insurance_expiration_date,
    };
  });

  return (
    <PageLayout
      className={cn("max-md:!py-3", "max-md:!gap-3")}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Subcontractors"
            description="Contracts + approved subcontract bills + payments summary. (Vendor profiles & compliance are under Vendors.)"
          />
        </div>
      }
    >
      <SubcontractorsListClient rows={rows} dataLoadWarning={dataLoadWarning} />
    </PageLayout>
  );
}
