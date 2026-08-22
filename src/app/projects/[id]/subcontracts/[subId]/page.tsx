import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PageLayout,
  PageHeader,
  Divider,
  NeoAmount,
  NeoPanel,
  NeoTable,
  SectionHeader,
  StatusBadge,
} from "@/components/base";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import {
  getApBillsBySubcontractIds,
  getBillsBySubcontractIds,
  getPaymentScheduleBySubcontractId,
  getPaymentsBySubcontractIds,
  getProjectById,
  getSubcontractById,
} from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { summarizeSubcontractFinancials } from "@/lib/subcontractor-financials";
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  SubcontractDetailClient,
  SubcontractPaymentScheduleClient,
} from "./subcontract-detail-client";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string; subId: string }> };

export default async function SubcontractDetailPage({ params }: Props) {
  const { id: projectId, subId } = await params;
  const projectSupabase = await createServerSupabaseClient();
  if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
  const [project, subcontract] = await Promise.all([
    getProjectById(projectId, projectSupabase),
    getSubcontractById(subId),
  ]);
  if (!project || !subcontract || subcontract.project_id !== projectId) notFound();

  let dataLoadWarning: string | null = null;
  const supabase = getServerSupabaseInternalNoStore();
  let financials = summarizeSubcontractFinancials({
    contractAmount: subcontract.contract_amount,
    bills: [],
    payments: [],
  });
  let paymentSchedule: Awaited<ReturnType<typeof getPaymentScheduleBySubcontractId>> = [];
  let linkedApBills: Awaited<ReturnType<typeof getApBillsBySubcontractIds>> = [];
  try {
    const [bills, payments, schedule, apBills] = await Promise.all([
      getBillsBySubcontractIds([subcontract.id]),
      getPaymentsBySubcontractIds([subcontract.id]),
      getPaymentScheduleBySubcontractId(subcontract.id, supabase ?? undefined),
      getApBillsBySubcontractIds([subcontract.id], supabase ?? undefined),
    ]);
    paymentSchedule = schedule;
    linkedApBills = apBills;
    financials = summarizeSubcontractFinancials({
      contractAmount: subcontract.contract_amount,
      scheduleItems: schedule.map((item) => ({
        amount: item.amount,
        status: item.status,
        apBillId: item.ap_bill_id,
      })),
      apBills: apBills.map((bill) => ({
        id: bill.id,
        amount: bill.amount,
        paidAmount: bill.paid_amount,
        balanceAmount: bill.balance_amount,
        status: bill.status,
      })),
      bills: bills.map((bill) => ({ amount: bill.amount, status: bill.status })),
      payments: payments.map((payment) => ({ amount: payment.amount })),
      remainingBasis: "scheduledOrBilled",
    });
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/subcontracts/${subId} financials`, e);
    dataLoadWarning = serverDataLoadWarning(e, "subcontract financials");
  }

  return (
    <PageLayout
      header={
        <PageHeader
          title={subcontract.subcontractor_name}
          description="Committed subcontract cost, payment schedule, linked AP bills, and AP outstanding."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/projects/${projectId}/subcontracts`}
                className="text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
              >
                Back to Project Subcontracts
              </Link>
              <SubcontractDetailClient projectId={projectId} subcontract={subcontract} />
            </div>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={subcontract.subcontractor_name} />
      {dataLoadWarning ? (
        <p
          className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-body text-[var(--hh-text-secondary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}
      <NeoPanel
        title="Contract Summary"
        bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        {[
          { label: "Contract Amount", value: financials.contractAmount, tone: "neutral" as const },
          { label: "Scheduled", value: financials.scheduledAmount, tone: "neutral" as const },
          { label: "Billed To Date", value: financials.billedToDate, tone: "neutral" as const },
          { label: "Paid To Date", value: financials.paidToDate, tone: "income" as const },
          {
            label: "AP Outstanding",
            value: financials.apOutstanding,
            tone: financials.apOutstanding > 0 ? ("expense" as const) : ("neutral" as const),
          },
          {
            label: "Remaining Contract",
            value: financials.remainingContract,
            tone: financials.remainingContract < 0 ? ("expense" as const) : ("neutral" as const),
          },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]">
              {item.label}
            </p>
            <p className="mt-1 text-hh-section-title">
              <NeoAmount tone={item.tone}>${fmtUsd(item.value)}</NeoAmount>
            </p>
          </div>
        ))}
      </NeoPanel>
      <SectionHeader label="Contract" />
      <Divider />
      <div className="grid grid-cols-1 gap-y-3 py-4 text-hh-body max-w-2xl">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-[var(--hh-text-secondary)]">Cost code</span>
          <span>{subcontract.cost_code ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-[var(--hh-text-secondary)]">Contract amount</span>
          <span className="tabular-nums">
            $
            {subcontract.contract_amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-[var(--hh-text-secondary)]">Start</span>
          <span className="tabular-nums">{subcontract.start_date ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-[var(--hh-text-secondary)]">End</span>
          <span className="tabular-nums">{subcontract.end_date ?? "—"}</span>
        </div>
        {subcontract.description ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-[var(--hh-text-secondary)]">Description</span>
            <span>{subcontract.description}</span>
          </div>
        ) : null}
      </div>
      <SubcontractPaymentScheduleClient
        projectId={projectId}
        subcontractId={subcontract.id}
        subcontractorId={subcontract.subcontractor_id}
        scheduleItems={paymentSchedule}
      />
      <NeoPanel title="Linked AP Bills" bodyClassName="p-0">
        {linkedApBills.length === 0 ? (
          <p className="px-4 py-6 text-hh-body text-[var(--hh-text-secondary)]">
            No linked AP bills yet.
          </p>
        ) : (
          <NeoTable className="rounded-none border-0 shadow-none" tableClassName="min-w-[900px]">
            <thead>
              <tr>
                <th className={tableRawThClass}>Bill</th>
                <th className={tableRawThClass}>Vendor</th>
                <th className={tableRawThClass}>Project</th>
                <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
                <th className={cn(tableRawThClass, "text-right tabular-nums")}>Paid</th>
                <th className={cn(tableRawThClass, "text-right tabular-nums")}>Balance</th>
                <th className={tableRawThClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {linkedApBills.map((bill) => (
                <tr key={bill.id} className="border-b border-[var(--hh-border)] last:border-b-0">
                  <td className={tableRawTdClass}>
                    <Link href={`/bills/${bill.id}`} className="font-medium hover:underline">
                      {bill.bill_no ?? "Bill"}
                    </Link>
                    <span className="mt-0.5 block text-hh-metadata text-[var(--hh-text-tertiary)]">
                      Due {formatDate(bill.due_date)}
                    </span>
                  </td>
                  <td className={tableRawTdClass}>{bill.vendor_name}</td>
                  <td className={tableRawTdClass}>{bill.project_name ?? project.name}</td>
                  <td className={cn(tableRawTdClass, "text-right tabular-nums")}>
                    {formatCurrency(bill.amount)}
                  </td>
                  <td className={cn(tableRawTdClass, "text-right tabular-nums")}>
                    {formatCurrency(bill.paid_amount)}
                  </td>
                  <td className={cn(tableRawTdClass, "text-right tabular-nums")}>
                    {formatCurrency(bill.balance_amount)}
                  </td>
                  <td className={tableRawTdClass}>
                    <StatusBadge
                      label={bill.status}
                      variant={
                        bill.status === "Paid"
                          ? "success"
                          : bill.status === "Void"
                            ? "muted"
                            : "warning"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        )}
      </NeoPanel>
    </PageLayout>
  );
}
