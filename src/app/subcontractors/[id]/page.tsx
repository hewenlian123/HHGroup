import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EmptyState,
  NeoAmount,
  NeoPanel,
  NeoStatus,
  NeoTable,
  PageLayout,
  PageHeader,
  StatusBadge,
} from "@/components/base";
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
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function SubcontractorDetailPage({ params }: Props) {
  const { id } = await params;
  let subcontractor: SubcontractorRow | null = null;
  try {
    subcontractor = await getSubcontractorById(id);
  } catch (e) {
    logServerPageDataError(`subcontractors/${id}`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "subcontractor")}
        backHref="/subcontractors"
        backLabel="Back to subcontractors"
      />
    );
  }
  if (!subcontractor) notFound();

  let contracts: Awaited<ReturnType<typeof getSubcontractsBySubcontractor>> = [];
  let bills: Awaited<ReturnType<typeof getBillsBySubcontractIds>> = [];
  let payments: Awaited<ReturnType<typeof getPaymentsBySubcontractIds>> = [];
  let budgetItemArrays: Awaited<ReturnType<typeof getProjectBudgetItems>>[] = [];
  let dataLoadWarning: string | null = null;
  try {
    contracts = await getSubcontractsBySubcontractor(id);
    const subcontractIds = contracts.map((c) => c.id);
    const projectIds = Array.from(new Set(contracts.map((c) => c.project_id)));
    [bills, payments] = await Promise.all([
      getBillsBySubcontractIds(subcontractIds),
      getPaymentsBySubcontractIds(subcontractIds),
    ]);
    budgetItemArrays = await Promise.all(projectIds.map((pid) => getProjectBudgetItems(pid)));
  } catch (e) {
    logServerPageDataError(`subcontractors/${id} financials`, e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractor contracts or payments");
  }

  const projectIds = Array.from(new Set(contracts.map((c) => c.project_id)));

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
      divider={false}
      className="dark"
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
      <SetBreadcrumbEntityTitle label={subcontractor.name} />
      {dataLoadWarning ? (
        <p
          className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2 text-sm text-[var(--neo-text-secondary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}
      {insuranceAlert ? (
        <div className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2">
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

      <NeoPanel title="Profile" bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {[
            ["Phone", subcontractor.phone ?? "—"],
            ["Email", subcontractor.email ?? "—"],
            ["Address", subcontractor.address ?? "—"],
            ["Insurance expiration", subcontractor.insurance_expiration_date ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                {label}
              </p>
              <p className="mt-1 break-words text-[var(--neo-text-primary)]">{value}</p>
            </div>
          ))}
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
              W9
            </p>
            <div className="mt-1">
              <SubcontractorW9 subcontractorId={id} w9StoragePath={subcontractor.w9_storage_path} />
            </div>
          </div>
          {subcontractor.notes ? (
            <div className="min-w-0 md:col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                Notes
              </p>
              <p className="mt-1 max-w-3xl break-words text-[var(--neo-text-primary)]">
                {subcontractor.notes}
              </p>
            </div>
          ) : null}
        </div>
      </NeoPanel>

      <NeoPanel bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Contracts", value: totalContracts, tone: "neutral" as const },
          { label: "Approved", value: approved, tone: "neutral" as const },
          { label: "Paid", value: paid, tone: "income" as const },
          {
            label: "Outstanding",
            value: outstanding,
            tone: outstanding > 0 ? ("expense" as const) : ("neutral" as const),
          },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]">
              {item.label}
            </p>
            <p className="mt-1 text-lg">
              <NeoAmount tone={item.tone}>${fmtUsd(item.value)}</NeoAmount>
            </p>
          </div>
        ))}
      </NeoPanel>

      <NeoPanel title="Contracts" bodyClassName="p-0">
        <NeoTable className="border-0 shadow-none" tableClassName="min-w-[880px]">
          <thead>
            <tr className="border-b border-[var(--neo-border)]">
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Contract Amount
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Retainage %
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Revised Contract
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Paid
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Exposure
              </th>
            </tr>
          </thead>
          <tbody>
            {contractRows.length === 0 ? (
              <tr className="border-b border-[var(--neo-border)]">
                <td colSpan={7} className="py-6 px-3">
                  <EmptyState
                    title="No contracts"
                    description="No contract records for this subcontractor."
                  />
                </td>
              </tr>
            ) : (
              contractRows.map((c) => {
                const exposurePositive = c.exposure > 0;
                const paidInFull = c.paid >= c.revised;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-[var(--neo-border)] ${
                      paidInFull
                        ? "bg-emerald-500/10"
                        : exposurePositive
                          ? "bg-[rgb(184_137_45_/_0.08)]"
                          : ""
                    }`}
                  >
                    <td className="py-1.5 px-3">{c.project_name}</td>
                    <td className="py-1.5 px-3">{c.cost_code ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount>${fmtUsd(c.contract_amount)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">—</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount>${fmtUsd(c.revised)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount tone="income">${fmtUsd(c.paid)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount
                        tone={exposurePositive ? "expense" : paidInFull ? "income" : "neutral"}
                      >
                        ${fmtUsd(c.exposure)}
                      </NeoAmount>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </NeoTable>
      </NeoPanel>

      <NeoPanel title="Progress bills" bodyClassName="p-0">
        <NeoTable className="border-0 shadow-none" tableClassName="min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--neo-border)]">
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr className="border-b border-[var(--neo-border)]">
                <td colSpan={4} className="py-6 px-3">
                  <EmptyState title="No bills" description="No approved progress bills yet." />
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-b border-[var(--neo-border)]">
                  <td className="py-1.5 px-3">
                    {subcontractIdToProjectName.get(b.subcontract_id) ?? "—"}
                  </td>
                  <td className="py-1.5 px-3">{b.bill_date}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    <NeoAmount>${fmtUsd(b.amount)}</NeoAmount>
                  </td>
                  <td className="py-1.5 px-3">
                    <NeoStatus
                      label={b.status}
                      variant={b.status === "Paid" ? "success" : "default"}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </NeoTable>
      </NeoPanel>

      <NeoPanel title="Payment history" bodyClassName="p-0">
        <NeoTable className="border-0 shadow-none" tableClassName="min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--neo-border)]">
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Project
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal">
                Method
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr className="border-b border-[var(--neo-border)]">
                <td colSpan={4} className="py-6 px-3">
                  <EmptyState
                    title="No payments"
                    description="No subcontractor payments recorded."
                  />
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="border-b border-[var(--neo-border)]">
                  <td className="py-1.5 px-3">
                    {subcontractIdToProjectName.get(p.subcontract_id) ?? "—"}
                  </td>
                  <td className="py-1.5 px-3">{p.payment_date}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">
                    <NeoAmount tone="income">${fmtUsd(p.amount)}</NeoAmount>
                  </td>
                  <td className="py-1.5 px-3">{p.method ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </NeoTable>
      </NeoPanel>
    </PageLayout>
  );
}
