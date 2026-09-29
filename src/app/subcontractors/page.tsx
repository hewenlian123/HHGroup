import { getSubcontractorsWithInsuranceAlerts } from "@/lib/subcontractors-db";
import { getSubcontractsSummaryAll } from "@/lib/subcontracts-db";
import { getContactPaymentSchedule } from "./contact-schedule-read";
import { PageLayout, PageHeader } from "@/components/base";
import { getApBillsBySubcontractIds, getBillsSummaryAll, getPaymentsSummaryAll } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { summarizeSubcontractorFinancials } from "@/lib/subcontractor-financials";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { cn } from "@/lib/utils";
import { SubcontractorsListClient } from "./subcontractors-list-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SubcontractorsPage() {
  let subcontractors: Awaited<ReturnType<typeof getSubcontractorsWithInsuranceAlerts>> = [];
  let subcontracts: Awaited<ReturnType<typeof getSubcontractsSummaryAll>> = [];
  let billsSummary: Awaited<ReturnType<typeof getBillsSummaryAll>> = [];
  let paymentsSummary: Awaited<ReturnType<typeof getPaymentsSummaryAll>> = [];
  let paymentSchedule: Awaited<ReturnType<typeof getContactPaymentSchedule>> = [];
  let linkedApBills: Awaited<ReturnType<typeof getApBillsBySubcontractIds>> = [];
  let dataLoadWarning: string | null = null;

  try {
    const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
    if (!guard.ok) throw new Error(guard.error);
    const supabase = guard.client;
    [subcontractors, subcontracts, billsSummary, paymentsSummary] = await Promise.all([
      getSubcontractorsWithInsuranceAlerts(supabase),
      getSubcontractsSummaryAll(supabase),
      getBillsSummaryAll(supabase),
      getPaymentsSummaryAll(supabase),
    ]);
    const subcontractIds = subcontracts.map((subcontract) => subcontract.id);
    [paymentSchedule, linkedApBills] = await Promise.all([
      getContactPaymentSchedule(subcontractIds, supabase ?? undefined),
      getApBillsBySubcontractIds(subcontractIds, supabase ?? undefined),
    ]);
  } catch (e) {
    logServerPageDataError("subcontractors", e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractors summary");
  }

  const contractsBySubcontractorId = new Map<string, { id: string; contractAmount: number }[]>();
  for (const s of subcontracts) {
    const contracts = contractsBySubcontractorId.get(s.subcontractor_id) ?? [];
    contracts.push({ id: s.id, contractAmount: s.contract_amount });
    contractsBySubcontractorId.set(s.subcontractor_id, contracts);
  }

  const rows = subcontractors.map((sc) => {
    const summary = summarizeSubcontractorFinancials({
      contracts: contractsBySubcontractorId.get(sc.id) ?? [],
      scheduleItems: paymentSchedule.map((item) => ({
        subcontractId: item.subcontract_id,
        amount: item.amount,
        status: item.status,
        apBillId: item.ap_bill_id,
      })),
      apBills: linkedApBills.map((bill) => ({
        subcontractId: bill.subcontract_id,
        id: bill.id,
        amount: bill.amount,
        paidAmount: bill.paid_amount,
        balanceAmount: bill.balance_amount,
        status: bill.status,
      })),
      bills: billsSummary.map((bill) => ({
        subcontractId: bill.subcontract_id,
        amount: bill.amount,
        status: bill.status,
      })),
      payments: paymentsSummary.map((payment) => ({
        subcontractId: payment.subcontract_id,
        amount: payment.amount,
      })),
    });
    return {
      id: sc.id,
      name: sc.name,
      phone: sc.phone,
      email: sc.email,
      active: sc.active,
      contractAmount: summary.contractAmount,
      scheduledAmount: summary.scheduledAmount,
      billedToDate: summary.billedToDate,
      paidToDate: summary.paidToDate,
      apOutstanding: summary.apOutstanding,
      remainingContract: summary.remainingContract,
      insurance_alert: sc.insurance_alert,
      insurance_expiration_date: sc.insurance_expiration_date,
    };
  });

  return (
    <PageLayout
      frame="list"
      divider={false}
      className={cn("max-md:!py-3", "max-md:!gap-3", "[&_button]:min-h-11")}
      header={
        <div className="hidden md:block">
          <PageHeader
            variant="workspace"
            title="Subcontractors"
            description="Committed contracts, billed-to-date, paid-to-date, and AP outstanding. Contract amount is committed cost only."
          />
        </div>
      }
    >
      <SubcontractorsListClient rows={rows} dataLoadWarning={dataLoadWarning} />
    </PageLayout>
  );
}
