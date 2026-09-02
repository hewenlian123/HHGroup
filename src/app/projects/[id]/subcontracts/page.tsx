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
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { AddSubcontractButton } from "./add-subcontract-button";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  ProjectFinancialTable,
  ProjectFinancialTableCell,
  ProjectFinancialTableHead,
  ProjectFinancialTableHeader,
} from "../_components/project-financial-responsive-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectSubcontractsPage({ params }: Props) {
  const { id } = await params;
  const projectSupabase = await createServerSupabaseClient();
  if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
  const [project, subcontracts, subcontractors] = await Promise.all([
    getProjectById(id, projectSupabase),
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
              className="inline-flex min-h-[44px] items-center text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
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
          <ProjectFinancialTable aria-label="Project subcontracts">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="subcontract-subcontractor"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Subcontractor
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-cost-code"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Cost Code
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-contract-amount"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Contract Amount
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-scheduled"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Scheduled
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-billed"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Billed To Date
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-paid"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Paid To Date
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-ap-outstanding"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  AP Outstanding
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-remaining"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Remaining Contract
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-status"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Status
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="subcontract-actions"
                  className="h-8 px-3 text-right align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Actions
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {subcontracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No subcontracts yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={listTableRowStaticClassName}>
                    <ProjectFinancialTableCell
                      headerId="subcontract-subcontractor"
                      label="Subcontractor"
                      className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                    >
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}`}
                        className="inline-flex min-h-[44px] min-w-0 items-center break-words hover:text-[var(--hh-text-primary)] hover:underline xl:min-h-0"
                      >
                        {r.subcontractor_name}
                      </Link>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-cost-code"
                      label="Cost Code"
                      className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]"
                    >
                      {r.cost_code ?? "—"}
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-contract-amount"
                      label="Contract Amount"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount>${fmtUsd(r.financials.contractAmount)}</NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-scheduled"
                      label="Scheduled"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount>${fmtUsd(r.financials.scheduledAmount)}</NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-billed"
                      label="Billed To Date"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount>${fmtUsd(r.financials.billedToDate)}</NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-paid"
                      label="Paid To Date"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount tone="income">${fmtUsd(r.financials.paidToDate)}</NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-ap-outstanding"
                      label="AP Outstanding"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount tone={r.financials.apOutstanding > 0 ? "expense" : "neutral"}>
                        ${fmtUsd(r.financials.apOutstanding)}
                      </NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-remaining"
                      label="Remaining Contract"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      <NeoAmount tone={r.financials.remainingContract < 0 ? "expense" : "neutral"}>
                        ${fmtUsd(r.financials.remainingContract)}
                      </NeoAmount>
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-status"
                      label="Status"
                      className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell"
                    >
                      {r.status ?? "Draft"}
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="subcontract-actions"
                      label="Actions"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-hh-table-cell"
                    >
                      <Link
                        href={`/projects/${id}/subcontracts/${r.id}/bills`}
                        className="inline-flex min-h-[44px] items-center text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)] xl:min-h-0"
                      >
                        View Bills
                      </Link>
                    </ProjectFinancialTableCell>
                  </tr>
                ))
              )}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
    </PageLayout>
  );
}
