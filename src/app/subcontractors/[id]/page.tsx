import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubcontractorById } from "@/lib/subcontractors-db";
import { getSubcontractsBySubcontractor } from "@/lib/subcontracts-db";
import { getContactPaymentSchedule } from "../contact-schedule-read";
import { ContactChannels, ContactSections } from "@/components/contacts/contact-sections";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
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
  getBillsBySubcontractIds,
  getPaymentsBySubcontractIds,
  getSubcontractDeductionsBySubcontractIds,
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
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
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
  let supabase: SupabaseClient | undefined;
  try {
    const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
    if (!guard.ok) throw new Error(guard.error);
    supabase = guard.client;
    subcontractor = await getSubcontractorById(id, supabase);
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
  let deductions: Awaited<ReturnType<typeof getSubcontractDeductionsBySubcontractIds>> = [];
  let paymentSchedule: Awaited<ReturnType<typeof getContactPaymentSchedule>> = [];
  let linkedApBills: Awaited<ReturnType<typeof getApBillsBySubcontractIds>> = [];
  let dataLoadWarning: string | null = null;
  try {
    contracts = await getSubcontractsBySubcontractor(id, supabase);
    const subcontractIds = contracts.map((c) => c.id);
    [bills, payments, deductions, paymentSchedule, linkedApBills] = await Promise.all([
      getBillsBySubcontractIds(subcontractIds, supabase),
      getPaymentsBySubcontractIds(subcontractIds, supabase),
      getSubcontractDeductionsBySubcontractIds(subcontractIds, supabase ?? undefined),
      getContactPaymentSchedule(subcontractIds, supabase ?? undefined),
      getApBillsBySubcontractIds(subcontractIds, supabase ?? undefined),
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
      deductions: deductions
        .filter((deduction) => deduction.subcontract_id === c.id)
        .map((deduction) => ({ amount: deduction.amount })),
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
    deductions: deductions.map((deduction) => ({
      subcontractId: deduction.subcontract_id,
      subcontractorId: deduction.subcontractor_id,
      amount: deduction.amount,
    })),
    remainingBasis: "scheduledOrBilled",
  });

  const subcontractIdToProjectName = new Map(contracts.map((c) => [c.id, c.project_name]));

  const insuranceAlert =
    !!subcontractor.insurance_expiration_date &&
    new Date(subcontractor.insurance_expiration_date).getTime() <=
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime();

  const financial = (content: ReactNode) =>
    dataLoadWarning ? (
      <p role="status">Subcontractor financial data unavailable. Reload to retry.</p>
    ) : (
      content
    );
  const contractLinks = (
    <div className="flex flex-wrap gap-2">
      {contracts.map((c) => (
        <Button key={c.id} asChild variant="outline" className="min-h-11 h-auto whitespace-normal">
          <Link href={`/projects/${c.project_id}/subcontracts/${c.id}`} prefetch={false}>
            {c.project_name} · Contract
          </Link>
        </Button>
      ))}
    </div>
  );

  return (
    <PageLayout
      className="[&_button]:min-h-11"
      divider={false}
      header={
        <PageHeader
          title={subcontractor.name}
          description="Profile, contracts, progress payments, and payment history."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/subcontractors"
                className="inline-flex min-h-11 items-center text-sm underline"
              >
                Back to Subcontractors
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
          className="rounded-hh-standard border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-3 py-2 text-hh-body text-[var(--hh-information)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}
      {insuranceAlert ? (
        <div className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2">
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

      <ContactChannels phone={subcontractor.phone} email={subcontractor.email} />
      <ContactSections
        sections={[
          {
            label: "Overview",
            content: (
              <>
                <NeoPanel title="Profile" bodyClassName="p-4">
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    {[
                      ["Phone", subcontractor.phone ?? "—"],
                      ["Email", subcontractor.email ?? "—"],
                      ["Address", subcontractor.address ?? "—"],
                      ["Insurance expiration", subcontractor.insurance_expiration_date ?? "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
                          {label}
                        </p>
                        <p className="mt-1 break-words text-[var(--hh-text-primary)]">{value}</p>
                      </div>
                    ))}
                    {subcontractor.notes ? (
                      <div className="min-w-0 md:col-span-2">
                        <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
                          Notes
                        </p>
                        <p className="mt-1 max-w-3xl break-words text-[var(--hh-text-primary)]">
                          {subcontractor.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </NeoPanel>
                {financial(
                  <NeoPanel bodyClassName="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
                    {[
                      {
                        label: "Contract Amount",
                        value: summary.contractAmount,
                        tone: "neutral" as const,
                      },
                      {
                        label: "Scheduled",
                        value: summary.scheduledAmount,
                        tone: "neutral" as const,
                      },
                      { label: "Bills", value: summary.billedToDate, tone: "neutral" as const },
                      {
                        label: "Material Deductions",
                        value: summary.materialDeductions,
                        tone: "expense" as const,
                      },
                      {
                        label: "Payments Made",
                        value: summary.paidToDate,
                        tone: "income" as const,
                      },
                      {
                        label: "Net Payable",
                        value: summary.netPayable,
                        tone: summary.netPayable > 0 ? ("expense" as const) : ("neutral" as const),
                      },
                      {
                        label: "Remaining Contract",
                        value: summary.remainingContract,
                        tone:
                          summary.remainingContract < 0
                            ? ("expense" as const)
                            : ("neutral" as const),
                      },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0">
                        <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
                          {item.label}
                        </p>
                        <p className="mt-1 text-lg">
                          <NeoAmount tone={item.tone}>${fmtUsd(item.value)}</NeoAmount>
                        </p>
                      </div>
                    ))}
                  </NeoPanel>
                )}
              </>
            ),
          },
          {
            label: "Projects",
            content: financial(
              <div className="space-y-2">
                {contracts.length === 0 ? (
                  <p>No linked projects.</p>
                ) : (
                  contracts.map((c) => (
                    <Button key={c.id} asChild variant="outline" className="min-h-11">
                      <Link href={`/projects/${c.project_id}`}>{c.project_name}</Link>
                    </Button>
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Contracts",
            content: financial(
              <NeoPanel title="Contracts" bodyClassName="p-0">
                <div className="divide-y divide-[var(--hh-border-subtle)] px-3 md:hidden">
                  {contractRows.length === 0 && <p className="py-3">No contracts.</p>}
                  {contractRows.map((c) => (
                    <div key={c.id} className="space-y-2 py-3">
                      <Link
                        className="inline-flex min-h-11 items-center font-medium underline"
                        href={`/projects/${c.project_id}/subcontracts/${c.id}`}
                      >
                        {c.project_name} · Contract
                      </Link>
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        {[
                          ["Contract Amount", c.contract_amount],
                          ["Net Payable", c.summary.netPayable],
                          ["Remaining Contract", c.summary.remainingContract],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-[var(--hh-text-secondary)]">{label}</dt>
                            <dd>
                              <NeoAmount>${fmtUsd(Number(value))}</NeoAmount>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <NeoTable
                  className="hidden border-0 shadow-none md:block"
                  tableClassName="min-w-[1180px]"
                >
                  <thead>
                    <tr className="border-b border-[var(--hh-border)]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Project
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Cost Code
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Contract Amount
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Scheduled
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Billed To Date
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Paid To Date
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Deductions
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Net Payable
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Remaining Contract
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractRows.length === 0 ? (
                      <tr className="border-b border-[var(--hh-border)]">
                        <td colSpan={9} className="py-6 px-3">
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
                            className={`border-b border-[var(--hh-border)] ${
                              fullyBilled
                                ? "bg-[var(--hh-success-soft-fill)]"
                                : outstandingPositive
                                  ? "bg-[var(--hh-warning-soft-fill)]"
                                  : ""
                            }`}
                          >
                            <td className="py-1.5 px-3">
                              <Link
                                className="inline-flex min-h-11 items-center underline"
                                href={`/projects/${c.project_id}/subcontracts/${c.id}`}
                              >
                                {c.project_name}
                              </Link>
                            </td>
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
                              <NeoAmount
                                tone={c.summary.materialDeductions > 0 ? "expense" : "neutral"}
                              >
                                ${fmtUsd(c.summary.materialDeductions)}
                              </NeoAmount>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              <NeoAmount tone={c.summary.netPayable > 0 ? "expense" : "neutral"}>
                                ${fmtUsd(c.summary.netPayable)}
                              </NeoAmount>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              <NeoAmount
                                tone={c.summary.remainingContract < 0 ? "expense" : "neutral"}
                              >
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
            ),
          },
          {
            label: "Bills",
            content: financial(
              <NeoPanel title="Progress bills" bodyClassName="p-0">
                <div className="divide-y divide-[var(--hh-border-subtle)] px-3 md:hidden">
                  {bills.length === 0 && <p className="py-3">No bills.</p>}
                  {bills.map((record) => (
                    <div key={record.id} className="space-y-2 py-3">
                      <p className="font-medium">
                        {subcontractIdToProjectName.get(record.subcontract_id) ?? "Project"}
                      </p>
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <time>{record.bill_date}</time>
                        <NeoAmount>${fmtUsd(record.amount)}</NeoAmount>
                        <span>{record.status}</span>
                      </div>
                      {contracts
                        .filter((c) => c.id === record.subcontract_id)
                        .map((c) => (
                          <Link
                            key={c.id}
                            className="inline-flex min-h-11 items-center underline text-sm"
                            href={`/projects/${c.project_id}/subcontracts/${c.id}`}
                          >
                            Open contract
                          </Link>
                        ))}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  {linkedApBills.map((bill) => (
                    <Button key={bill.id} asChild variant="outline" className="min-h-11">
                      <Link href={`/bills/${bill.id}`}>
                        Open bill · {bill.bill_no || bill.id.slice(0, 8)}
                      </Link>
                    </Button>
                  ))}
                  {contractLinks}
                </div>
                <NeoTable
                  className="hidden border-0 shadow-none md:block"
                  tableClassName="min-w-[640px]"
                >
                  <thead>
                    <tr className="border-b border-[var(--hh-border)]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Project
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Date
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Amount
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length === 0 ? (
                      <tr className="border-b border-[var(--hh-border)]">
                        <td colSpan={4} className="py-6 px-3">
                          <EmptyState
                            title="No bills"
                            description="No approved progress bills yet."
                          />
                        </td>
                      </tr>
                    ) : (
                      bills.map((b) => (
                        <tr key={b.id} className="border-b border-[var(--hh-border)]">
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
            ),
          },
          {
            label: "Payments",
            content: financial(
              <NeoPanel title="Legacy subcontract payment history" bodyClassName="p-0">
                <Link
                  href="/financial/payables/payments"
                  className="inline-flex min-h-11 items-center px-3 underline"
                >
                  View AP payment history
                </Link>
                <div className="divide-y divide-[var(--hh-border-subtle)] px-3 md:hidden">
                  {payments.length === 0 && (
                    <p className="py-3">
                      No legacy subcontract payments. AP payments are available in Payables.
                    </p>
                  )}
                  {payments.map((record) => (
                    <div key={record.id} className="space-y-2 py-3">
                      <p className="font-medium">
                        {subcontractIdToProjectName.get(record.subcontract_id) ?? "Project"}
                      </p>
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <time>{record.payment_date}</time>
                        <NeoAmount>${fmtUsd(record.amount)}</NeoAmount>
                        <span>{record.method ?? "—"}</span>
                      </div>
                      {contracts
                        .filter((c) => c.id === record.subcontract_id)
                        .map((c) => (
                          <Link
                            key={c.id}
                            className="inline-flex min-h-11 items-center underline text-sm"
                            href={`/projects/${c.project_id}/subcontracts/${c.id}`}
                          >
                            Open contract
                          </Link>
                        ))}
                    </div>
                  ))}
                </div>
                <NeoTable
                  className="hidden border-0 shadow-none md:block"
                  tableClassName="min-w-[640px]"
                >
                  <thead>
                    <tr className="border-b border-[var(--hh-border)]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Project
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Date
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal tabular-nums">
                        Amount
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[var(--hh-text-tertiary)] uppercase tracking-normal">
                        Method
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr className="border-b border-[var(--hh-border)]">
                        <td colSpan={4} className="py-6 px-3">
                          <EmptyState
                            title="No payments"
                            description="No legacy subcontract payments recorded. AP payments are available in Payables."
                          />
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr key={p.id} className="border-b border-[var(--hh-border)]">
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
            ),
          },
          {
            label: "Documents",
            content: (
              <NeoPanel title="Documents" bodyClassName="space-y-3 p-4">
                <SubcontractorW9
                  subcontractorId={id}
                  w9StoragePath={subcontractor.w9_storage_path}
                />
                <p className="text-sm text-[var(--hh-text-secondary)]">
                  W9 is stored on this profile. Other documents belong to each project.
                </p>
                {financial(
                  <div className="space-y-2">
                    {contracts.map((c) => (
                      <Button key={c.id} asChild variant="outline" className="min-h-11">
                        <Link href={`/documents?project_id=${encodeURIComponent(c.project_id)}`}>
                          {c.project_name} · Documents
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </NeoPanel>
            ),
          },
          {
            label: "History",
            content: financial(
              <div className="space-y-3">
                <p className="text-sm">
                  Review contract activity, bills and payment history in the linked project. A
                  separate subcontractor audit history is unavailable.
                </p>
                {contractLinks}
              </div>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
