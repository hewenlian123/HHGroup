import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getSubcontractById, getBillsBySubcontract } from "@/lib/data";
import { AddBillButton } from "./add-bill-button";
import { ApproveBillButton } from "./approve-bill-button";
import { BillRowActions } from "./bill-row-actions";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string; subId: string }> };

export default async function SubcontractBillsPage({ params }: Props) {
  const { id: projectId, subId } = await params;
  const [subcontract, bills] = await Promise.all([
    getSubcontractById(subId),
    getBillsBySubcontract(subId),
  ]);

  if (!subcontract || subcontract.project_id !== projectId) notFound();

  return (
    <PageLayout
      header={
        <PageHeader
          title="Subcontract Bills"
          description={`Bills for ${subcontract.subcontractor_name}.`}
          actions={
            <Link
              href={`/projects/${projectId}/subcontracts`}
              className="text-sm text-muted-foreground hover:text-foreground"
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
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Bill Date
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Due
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Description
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Amount
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
              {bills.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
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
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-[#F5F7FA] dark:hover:bg-muted/30"
                      >
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] font-medium tabular-nums">
                          {r.bill_date}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle font-mono text-[13px] tabular-nums">
                          {r.due_date ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  overdue
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }
                              >
                                {r.due_date}
                              </span>
                              {overdue ? (
                                <span className="rounded-sm border border-red-200/70 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                  Overdue
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-muted-foreground">
                          {r.description ?? "—"}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                          ${fmtUsd(r.amount)}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                          {r.status}
                        </td>
                        <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                          {r.status === "Pending" ? (
                            <div className="flex items-center justify-end gap-2">
                              <ApproveBillButton billId={r.id} />
                              <BillRowActions
                                projectId={projectId}
                                subcontractId={subId}
                                bill={r}
                              />
                            </div>
                          ) : (
                            <BillRowActions projectId={projectId} subcontractId={subId} bill={r} />
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
