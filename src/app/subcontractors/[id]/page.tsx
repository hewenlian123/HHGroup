import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader, StatusBadge } from "@/components/base";
import {
  getSubcontractorById,
  getSubcontractsBySubcontractor,
  getBillsBySubcontractIds,
  getPaymentsBySubcontractIds,
  getProjectBudgetItems,
  type SubcontractorRow,
} from "@/lib/data";
import { SubcontractorW9 } from "./subcontractor-w9";
import { SubcontractorDetailClient } from "./subcontractor-detail-client";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function SubcontractorDetailPage({ params }: Props) {
  const { id } = await params;
  const subcontractor = await getSubcontractorById(id);
  if (!subcontractor) notFound();

  const contracts = await getSubcontractsBySubcontractor(id);
  const subcontractIds = contracts.map((c) => c.id);
  const projectIds = Array.from(new Set(contracts.map((c) => c.project_id)));
  const [bills, payments, ...budgetItemArrays] = await Promise.all([
    getBillsBySubcontractIds(subcontractIds),
    getPaymentsBySubcontractIds(subcontractIds),
    ...projectIds.map((pid) => getProjectBudgetItems(pid)),
  ]);

  const approvedCoByProjectAndCostCode = new Map<string, Map<string, number>>();
  projectIds.forEach((pid, idx) => {
    const items = budgetItemArrays[idx] ?? [];
    const byCode = new Map<string, number>();
    for (const item of items) {
      const code = item.costCode ?? "";
      byCode.set(code, (byCode.get(code) ?? 0) + item.total);
    }
    approvedCoByProjectAndCostCode.set(pid, byCode);
  });

  const paidBySubcontractId = new Map<string, number>();
  for (const p of payments) {
    paidBySubcontractId.set(
      p.subcontract_id,
      (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount
    );
  }

  const contractRows = contracts.map((c) => {
    const revised =
      c.contract_amount +
      (approvedCoByProjectAndCostCode.get(c.project_id)?.get(c.cost_code ?? "") ?? 0);
    const paid = paidBySubcontractId.get(c.id) ?? 0;
    const exposure = revised - paid;
    return { ...c, revised, paid, exposure };
  });

  const totalContracts = contracts.reduce((s, c) => s + c.contract_amount, 0);
  const approved = bills
    .filter((b) => b.status === "Approved" || b.status === "Paid")
    .reduce((s, b) => s + b.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = approved - paid;

  const subcontractIdToProjectName = new Map(contracts.map((c) => [c.id, c.project_name]));

  const insuranceAlert =
    !!subcontractor.insurance_expiration_date &&
    new Date(subcontractor.insurance_expiration_date).getTime() <=
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime();

  return (
    <PageLayout
      header={
        <PageHeader
          title={subcontractor.name}
          description="Profile, contracts, progress payments, and payment history."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/subcontractors"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Subcontractors
              </Link>
              <SubcontractorDetailClient subcontractor={subcontractor as SubcontractorRow} />
            </div>
          }
        />
      }
    >
      {insuranceAlert ? (
        <div className="py-2 px-3 border-b border-border/60 bg-amber-500/10 dark:bg-amber-500/10">
          <StatusBadge
            label={
              new Date(subcontractor.insurance_expiration_date!).getTime() < Date.now()
                ? `Insurance expired ${subcontractor.insurance_expiration_date}`
                : `Insurance expires ${subcontractor.insurance_expiration_date}`
            }
            variant="warning"
          />
        </div>
      ) : null}

      <SectionHeader label="Profile" />
      <Divider />
      <div className="grid grid-cols-1 gap-y-3 py-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Phone</span>
          <span>{subcontractor.phone ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Email</span>
          <span>{subcontractor.email ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Address</span>
          <span>{subcontractor.address ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-muted-foreground">Insurance expiration</span>
          <span>{subcontractor.insurance_expiration_date ?? "—"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="text-muted-foreground">W9</span>
          <SubcontractorW9 subcontractorId={id} w9StoragePath={subcontractor.w9_storage_path} />
        </div>
        {subcontractor.notes ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-muted-foreground">Notes</span>
            <span className="max-w-xl">{subcontractor.notes}</span>
          </div>
        ) : null}
      </div>
      <Divider />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Total Contracts</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(totalContracts)}</span>
        <span className="text-sm text-muted-foreground">Approved</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(approved)}</span>
        <span className="text-sm text-muted-foreground">Paid</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(paid)}</span>
        <span className="text-sm text-muted-foreground">Outstanding</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(outstanding)}</span>
      </div>
      <Divider />

      <SectionHeader label="Contracts" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Contract Amount
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Retainage %
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Revised Contract
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Paid
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Exposure
              </th>
            </tr>
          </thead>
          <tbody>
            {contractRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={7} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No contracts.
                </td>
              </tr>
            ) : (
              contractRows.map((c) => {
                const exposurePositive = c.exposure > 0;
                const paidInFull = c.paid >= c.revised;
                const rowClass = paidInFull
                  ? "bg-green-500/10 dark:bg-green-500/10"
                  : exposurePositive
                    ? "bg-orange-500/10 dark:bg-orange-500/10"
                    : "";
                return (
                  <tr key={c.id} className={`border-b border-border/40 ${rowClass}`}>
                    <td className="py-1.5 px-3">{c.project_name}</td>
                    <td className="py-1.5 px-3">{c.cost_code ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      ${fmtUsd(c.contract_amount)}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">—</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(c.revised)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(c.paid)}</td>
                    <td
                      className={`py-1.5 px-3 text-right tabular-nums ${exposurePositive ? "text-orange-600 dark:text-orange-400" : paidInFull ? "text-green-600 dark:text-green-400" : ""}`}
                    >
                      ${fmtUsd(c.exposure)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      <SectionHeader label="Progress bills" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No bills.
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">
                    {subcontractIdToProjectName.get(b.subcontract_id) ?? "—"}
                  </td>
                  <td className="py-1.5 px-3">{b.bill_date}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(b.amount)}</td>
                  <td className="py-1.5 px-3">{b.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      <SectionHeader label="Payment history" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Method
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No payments.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">
                    {subcontractIdToProjectName.get(p.subcontract_id) ?? "—"}
                  </td>
                  <td className="py-1.5 px-3">{p.payment_date}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(p.amount)}</td>
                  <td className="py-1.5 px-3">{p.method ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
