import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, NeoAmount, SectionHeader } from "@/components/base";
import {
  getApBillsBySubcontractIds,
  getBillsBySubcontractIds,
  getPaymentScheduleBySubcontractIds,
  getPaymentsBySubcontractIds,
  getProjectById,
  getSubcontractors,
  getSubcontractsByProject,
} from "@/lib/data";
import { summarizeSubcontractFinancials } from "@/lib/subcontractor-financials";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { AddSubcontractButton } from "./add-subcontract-button";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectSubcontractsPage({ params }: Props) {
  const { id } = await params;
  const [project, subcontracts, subcontractors] = await Promise.all([
    getProjectById(id),
    getSubcontractsByProject(id),
    getSubcontractors(),
  ]);

  if (!project) notFound();

  const subcontractorsForDropdown = subcontractors.map((s) => ({ id: s.id, name: s.name }));
  const subcontractIds = subcontracts.map((subcontract) => subcontract.id);
  const supabase = getServerSupabaseInternalNoStore();
  const [bills, payments, paymentSchedule, linkedApBills] = await Promise.all([
    getBillsBySubcontractIds(subcontractIds).catch(() => []),
    getPaymentsBySubcontractIds(subcontractIds).catch(() => []),
    getPaymentScheduleBySubcontractIds(subcontractIds, supabase ?? undefined).catch(() => []),
    getApBillsBySubcontractIds(subcontractIds, supabase ?? undefined).catch(() => []),
  ]);
  const rows = subcontracts.map((subcontract) => ({
    ...subcontract,
    financials: summarizeSubcontractFinancials({
      contractAmount: subcontract.contract_amount,
      scheduleItems: paymentSchedule
        .filter((item) => item.subcontract_id === subcontract.id)
        .map((item) => ({
          amount: item.amount,
          status: item.status,
          apBillId: item.ap_bill_id,
        })),
      apBills: linkedApBills
        .filter((bill) => bill.subcontract_id === subcontract.id)
        .map((bill) => ({
          id: bill.id,
          amount: bill.amount,
          paidAmount: bill.paid_amount,
          balanceAmount: bill.balance_amount,
          status: bill.status,
        })),
      bills: bills
        .filter((bill) => bill.subcontract_id === subcontract.id)
        .map((bill) => ({ amount: bill.amount, status: bill.status })),
      payments: payments
        .filter((payment) => payment.subcontract_id === subcontract.id)
        .map((payment) => ({ amount: payment.amount })),
      remainingBasis: "scheduledOrBilled",
    }),
  }));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Project Subcontracts"
          description={`Committed subcontract cost for ${project.name}. Contract amount does not directly hit actual cost.`}
          actions={
            <Link
              href={`/projects/${id}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      <SectionHeader
        label="Subcontracts"
        action={<AddSubcontractButton projectId={id} subcontractors={subcontractorsForDropdown} />}
      />
      <Divider />

      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Subcontractor
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Cost Code
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Contract Amount
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Scheduled
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Billed To Date
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Paid To Date
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  AP Outstanding
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Remaining Contract
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Status
                </th>
                <th className="h-8 px-3 text-right align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {subcontracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
                  >
                    No subcontracts yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {r.subcontractor_name}
                      </Link>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                      {r.cost_code ?? "—"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount>${fmtUsd(r.financials.contractAmount)}</NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount>${fmtUsd(r.financials.scheduledAmount)}</NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount>${fmtUsd(r.financials.billedToDate)}</NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount tone="income">${fmtUsd(r.financials.paidToDate)}</NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount tone={r.financials.apOutstanding > 0 ? "expense" : "neutral"}>
                        ${fmtUsd(r.financials.apOutstanding)}
                      </NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      <NeoAmount tone={r.financials.remainingContract < 0 ? "expense" : "neutral"}>
                        ${fmtUsd(r.financials.remainingContract)}
                      </NeoAmount>
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                      {r.status ?? "Draft"}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}/bills`}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        View Bills
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
