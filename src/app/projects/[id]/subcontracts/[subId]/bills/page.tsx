import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import {
  getSubcontractById,
  getBillsBySubcontract,
  getPaymentsBySubcontractIds,
  getSubcontractDeductionsBySubcontractIds,
} from "@/lib/data";
import { AddBillButton } from "./add-bill-button";
import { ApproveBillButton } from "./approve-bill-button";
import { BillRowActions } from "./bill-row-actions";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { subcontractBillCountsAsBilled } from "@/lib/subcontractor-financials";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string; subId: string }> };

export default async function SubcontractBillsPage({ params }: Props) {
  const { id: projectId, subId } = await params;
  const supabase = getServerSupabaseInternalNoStore();
  const [subcontract, bills, payments, deductions] = await Promise.all([
    getSubcontractById(subId),
    getBillsBySubcontract(subId),
    getPaymentsBySubcontractIds([subId]),
    getSubcontractDeductionsBySubcontractIds([subId], supabase ?? undefined),
  ]);

  if (!subcontract || subcontract.project_id !== projectId) notFound();
  const billedToDate = bills
    .filter((bill) => subcontractBillCountsAsBilled(bill.status))
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const paymentsMade = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const materialDeductions = deductions.reduce(
    (sum, deduction) => sum + Number(deduction.amount || 0),
    0
  );
  const netPayable = Math.max(0, billedToDate - materialDeductions - paymentsMade);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Subcontract Bills"
          description={`Bills for ${subcontract.subcontractor_name}.`}
          actions={
            <Link
              href={`/projects/${projectId}/subcontracts`}
              className="text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
            >
              Subcontracts
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={subcontract.subcontractor_name} />
      <SectionHeader
        label="Bills"
        action={<AddBillButton projectId={projectId} subcontractId={subId} />}
      />
      <Divider />

      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full text-hh-body">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Bill Date
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Due
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Description
                </th>
                <th className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums">
                  Amount
                </th>
                <th className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Status
                </th>
                <th className="h-8 px-3 text-right align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No bills yet.
                  </td>
                </tr>
              ) : (
                bills.map((r) =>
                  (() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const overdue =
                      r.due_date &&
                      r.due_date < today &&
                      r.status !== "Paid" &&
                      r.status !== "Void";
                    return (
                      <tr key={r.id} className={listTableRowStaticClassName}>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell font-medium tabular-nums">
                          {r.bill_date}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle hh-fin text-hh-table-cell tabular-nums">
                          {r.due_date ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  overdue
                                    ? "text-[var(--hh-danger)]"
                                    : "text-[var(--hh-text-secondary)]"
                                }
                              >
                                {r.due_date}
                              </span>
                              {overdue ? (
                                <span className="rounded-hh-compact border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-1.5 py-0.5 text-hh-status font-medium text-[var(--hh-danger)] ">
                                  Overdue
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[var(--hh-text-secondary)]">—</span>
                          )}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                          {r.description ?? "—"}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums">
                          ${fmtUsd(r.amount)}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell">
                          {r.status}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-hh-table-cell">
                          {r.status === "Pending" ? (
                            <div className="flex items-center justify-end gap-2">
                              <ApproveBillButton
                                projectId={projectId}
                                subcontractId={subId}
                                billId={r.id}
                              />
                              <BillRowActions
                                projectId={projectId}
                                subcontractId={subId}
                                bill={r}
                                materialDeductions={materialDeductions}
                                paymentsMade={paymentsMade}
                                netPayable={netPayable}
                              />
                            </div>
                          ) : (
                            <BillRowActions
                              projectId={projectId}
                              subcontractId={subId}
                              bill={r}
                              materialDeductions={materialDeductions}
                              paymentsMade={paymentsMade}
                              netPayable={netPayable}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })()
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
