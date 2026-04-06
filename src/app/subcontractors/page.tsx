import { PageLayout, PageHeader } from "@/components/base";
import {
  getSubcontractorsWithInsuranceAlerts,
  getSubcontractsSummaryAll,
  getBillsSummaryAll,
  getPaymentsSummaryAll,
} from "@/lib/data";
import { StatusBadge } from "@/components/base";
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
      header={
        <PageHeader
          title="Subcontractors"
          description="Contracts + approved subcontract bills + payments summary. (Vendor profiles & compliance are under Vendors.)"
        />
      }
    >
      {dataLoadWarning ? <p className="text-sm text-muted-foreground">{dataLoadWarning}</p> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No subcontractors yet"
          description="Add subcontractor profiles in Settings to start tracking contracts, bills, and payments."
          icon={<Users className="h-5 w-5" />}
          action={
            <Button asChild size="sm" className="h-8">
              <Link href="/settings/subcontractors">Add subcontractor</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/subcontractors/${r.id}`}
                className="block rounded-sm border border-border/60 p-4 transition-colors hover:bg-muted/20 active:bg-muted/30"
              >
                <p className="font-medium text-foreground">{r.name}</p>
                <div className="mt-2">
                  {r.insurance_expiration_date ? (
                    r.insurance_alert ? (
                      <StatusBadge
                        label={`Expires ${r.insurance_expiration_date}`}
                        variant="warning"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.insurance_expiration_date}
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs tabular-nums">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Contracts
                    </dt>
                    <dd className="text-foreground">${fmtUsd(r.totalContracts)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Outstanding
                    </dt>
                    <dd className="font-medium text-foreground">${fmtUsd(r.outstanding)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
          <div className="airtable-table-wrap airtable-table-wrap--ruled hidden md:block">
            <div className="airtable-table-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm lg:min-w-0">
                <thead>
                  <tr>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Subcontractor
                    </th>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Insurance
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Total Contracts
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Approved
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Paid
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Outstanding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={listTableRowStaticClassName}>
                      <td className="py-1.5 px-3">
                        <Link
                          href={`/subcontractors/${r.id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-1.5 px-3">
                        {r.insurance_expiration_date ? (
                          r.insurance_alert ? (
                            <StatusBadge
                              label={`Expires ${r.insurance_expiration_date}`}
                              variant="warning"
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {r.insurance_expiration_date}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">
                        ${fmtUsd(r.totalContracts)}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.approved)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.paid)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">
                        ${fmtUsd(r.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
