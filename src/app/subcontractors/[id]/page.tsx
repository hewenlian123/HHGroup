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
  getApBillsBySubcontractIds,
  getSubcontractorById,
  getSubcontractsBySubcontractor,
  getBillsBySubcontractIds,
  getPaymentScheduleBySubcontractIds,
  getPaymentsBySubcontractIds,
  type SubcontractorRow,
} from "@/lib/data";
import { SubcontractorW9 } from "./subcontractor-w9";
import { SubcontractorDetailClient } from "./subcontractor-detail-client";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import {
  summarizeSubcontractFinancials,
  summarizeSubcontractorFinancials,
} from "@/lib/subcontractor-financials";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  let paymentSchedule: Awaited<ReturnType<typeof getPaymentScheduleBySubcontractIds>> = [];
  let linkedApBills: Awaited<ReturnType<typeof getApBillsBySubcontractIds>> = [];
  let dataLoadWarning: string | null = null;
  try {
    contracts = await getSubcontractsBySubcontractor(id);
    const subcontractIds = contracts.map((c) => c.id);
    const supabase = getServerSupabaseInternalNoStore();
    [bills, payments, paymentSchedule, linkedApBills] = await Promise.all([
      getBillsBySubcontractIds(subcontractIds),
      getPaymentsBySubcontractIds(subcontractIds),
      getPaymentScheduleBySubcontractIds(subcontractIds, supabase ?? undefined).catch(() => []),
      getApBillsBySubcontractIds(subcontractIds, supabase ?? undefined).catch(() => []),
    ]);
  } catch (e) {
    logServerPageDataError(`subcontractors/${id} financials`, e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontractor contracts or payments");
  }

  const contractRows = contracts.map((c) => {
    const summary = summarizeSubcontractFinancials({
      contractAmount: c.contract_amount,
      scheduleItems: paymentSchedule
        .filter((item) => item.subcontract_id === c.id)
        .map((item) => ({
          amount: item.amount,
          status: item.status,
          apBillId: item.ap_bill_id,
        })),
      apBills: linkedApBills
        .filter((bill) => bill.subcontract_id === c.id)
        .map((bill) => ({
          id: bill.id,
          amount: bill.amount,
          paidAmount: bill.paid_amount,
          balanceAmount: bill.balance_amount,
          status: bill.status,
        })),
      bills: bills
        .filter((bill) => bill.subcontract_id === c.id)
        .map((bill) => ({ amount: bill.amount, status: bill.status })),
      payments: payments
        .filter((payment) => payment.subcontract_id === c.id)
        .map((payment) => ({ amount: payment.amount })),
      remainingBasis: "scheduledOrBilled",
    });
    return { ...c, summary };
  });

  const summary = summarizeSubcontractorFinancials({
    contracts: contracts.map((contract) => ({
      id: contract.id,
      contractAmount: contract.contract_amount,
    })),
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
    bills: bills.map((bill) => ({
      subcontractId: bill.subcontract_id,
      amount: bill.amount,
      status: bill.status,
    })),
    payments: payments.map((payment) => ({
      subcontractId: payment.subcontract_id,
      amount: payment.amount,
    })),
    remainingBasis: "scheduledOrBilled",
  });

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

      <NeoPanel bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Contract Amount", value: summary.contractAmount, tone: "neutral" as const },
          { label: "Scheduled", value: summary.scheduledAmount, tone: "neutral" as const },
          { label: "Billed To Date", value: summary.billedToDate, tone: "neutral" as const },
          { label: "Paid To Date", value: summary.paidToDate, tone: "income" as const },
          {
            label: "AP Outstanding",
            value: summary.apOutstanding,
            tone: summary.apOutstanding > 0 ? ("expense" as const) : ("neutral" as const),
          },
          {
            label: "Remaining Contract",
            value: summary.remainingContract,
            tone: summary.remainingContract < 0 ? ("expense" as const) : ("neutral" as const),
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
        <NeoTable className="border-0 shadow-none" tableClassName="min-w-[1080px]">
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
                Scheduled
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Billed To Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Paid To Date
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                AP Outstanding
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-[var(--neo-text-tertiary)] uppercase tracking-normal tabular-nums">
                Remaining Contract
              </th>
            </tr>
          </thead>
          <tbody>
            {contractRows.length === 0 ? (
              <tr className="border-b border-[var(--neo-border)]">
                <td colSpan={8} className="py-6 px-3">
                  <EmptyState
                    title="No contracts"
                    description="No contract records for this subcontractor."
                  />
                </td>
              </tr>
            ) : (
              contractRows.map((c) => {
                const outstandingPositive = c.summary.apOutstanding > 0;
                const fullyBilled = c.summary.remainingContract <= 0;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-[var(--neo-border)] ${
                      fullyBilled
                        ? "bg-emerald-500/10"
                        : outstandingPositive
                          ? "bg-[rgb(184_137_45_/_0.08)]"
                          : ""
                    }`}
                  >
                    <td className="py-1.5 px-3">{c.project_name}</td>
                    <td className="py-1.5 px-3">{c.cost_code ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount>${fmtUsd(c.contract_amount)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount>${fmtUsd(c.summary.scheduledAmount)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount>${fmtUsd(c.summary.billedToDate)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount tone="income">${fmtUsd(c.summary.paidToDate)}</NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount tone={c.summary.apOutstanding > 0 ? "expense" : "neutral"}>
                        ${fmtUsd(c.summary.apOutstanding)}
                      </NeoAmount>
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums">
                      <NeoAmount tone={c.summary.remainingContract < 0 ? "expense" : "neutral"}>
                        ${fmtUsd(c.summary.remainingContract)}
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
