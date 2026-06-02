import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EmptyState,
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoPanel,
  NeoTable,
  PageLayout,
  PageHeader,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabase } from "@/lib/supabase-server";
import { getWorkerMonthlyReport, parseMonthYm } from "@/lib/worker-monthly-report";
import { MonthReportToolbar } from "./month-report-toolbar";
import { WorkerPayrollStatementPrint } from "./worker-payroll-statement-print";
import { cn } from "@/lib/utils";

const reportSecondaryButtonClass =
  "h-9 rounded-[0.625rem] border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-3 text-[13px] font-semibold text-[var(--neo-text-primary)] shadow-none hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-muted)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-11";

const reportTableHeadClass =
  "h-10 whitespace-nowrap border-b border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--neo-text-tertiary)]";

const reportTableCellClass =
  "h-11 border-b border-[var(--neo-border)] px-3 py-2 align-middle text-[13px] text-[var(--neo-text-primary)]";

function displayDeduction(n: number): string {
  const clean = Math.abs(n) < 0.005 ? 0 : n;
  return clean > 0 ? `-$${fmtUsd(clean)}` : "$0.00";
}

function balanceTone(n: number): "neutral" | "positive" | "negative" {
  if (n > 0.005) return "negative";
  if (n < -0.005) return "positive";
  return "positive";
}

function fmtUsd(n: number): string {
  const clean = Math.abs(n) < 0.005 ? 0 : n;
  return clean.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSignedUsd(n: number): string {
  const clean = Math.abs(n) < 0.005 ? 0 : n;
  if (clean < 0) return `-$${fmtUsd(Math.abs(clean))}`;
  return `$${fmtUsd(clean)}`;
}

type PageProps = {
  params: Promise<{ workerId: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function WorkerMonthlyReportPage({ params, searchParams }: PageProps) {
  const { workerId } = await params;
  const sp = await searchParams;
  const id = workerId?.trim();
  if (!id) notFound();

  const admin = getServerSupabase();
  if (admin) {
    const { data: workerRow, error: wErr } = await admin
      .from("workers")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!wErr && !workerRow) notFound();
  }

  const monthYm = parseMonthYm(sp.month);
  const report = await getWorkerMonthlyReport(id, monthYm);
  const titleName = report.workerName || "Worker";
  const summaryCards = [
    {
      label: "Earned",
      value: `$${fmtUsd(report.summary.earned)}`,
      meta: "Labor snapshot total",
      tone: "neutral" as const,
    },
    {
      label: "Reimbursements",
      value: `$${fmtUsd(report.summary.reimbursements)}`,
      meta: "Approved for the period",
      tone: "neutral" as const,
    },
    {
      label: "Total owed",
      value: `$${fmtUsd(report.summary.totalOwed)}`,
      meta: "Earned + reimbursements",
      tone: "warning" as const,
    },
    {
      label: "Cash paid",
      value: `$${fmtUsd(report.summary.cashPaid)}`,
      meta: "Worker payment cash",
      tone: "neutral" as const,
    },
    {
      label: "Advance deduction",
      value: displayDeduction(report.summary.advanceDeductions),
      meta: "Settlement deduction",
      tone: "neutral" as const,
    },
    {
      label: "Settled",
      value: `$${fmtUsd(report.summary.settled)}`,
      meta: "Cash + deductions",
      tone: "positive" as const,
    },
    {
      label: "Balance",
      value: `$${fmtUsd(report.summary.balance)}`,
      meta: Math.abs(report.summary.balance) < 0.005 ? "Fully settled" : "Remaining amount",
      tone: balanceTone(report.summary.balance),
      className:
        Math.abs(report.summary.balance) < 0.005
          ? "border-[rgb(16_185_129_/_0.22)] bg-[rgb(16_185_129_/_0.055)]"
          : "border-[rgb(244_114_182_/_0.24)] bg-[rgb(244_114_182_/_0.055)]",
    },
  ];

  return (
    <PageLayout
      divider={false}
      className="dark financial-nums max-md:!gap-3 max-md:!py-3"
      header={
        <PageHeader
          className="print:hidden"
          title="Monthly report"
          description={`${titleName} · ${report.monthLabel}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <MonthReportToolbar
                workerId={id}
                currentYm={monthYm}
                printDocumentTitle={`Payroll Statement — ${titleName}`}
              />
              <Link href={`/workers/${encodeURIComponent(id)}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(reportSecondaryButtonClass, "print:hidden")}
                >
                  Worker profile
                </Button>
              </Link>
              <Link href="/workers">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(reportSecondaryButtonClass, "print:hidden")}
                >
                  All workers
                </Button>
              </Link>
            </div>
          }
        />
      }
    >
      <div className="space-y-4 print:hidden">
        <SetBreadcrumbEntityTitle label={titleName} />
        <NeoPanel
          className="print:hidden"
          bodyClassName="px-4 py-3"
          eyebrow="Worker statement"
          title={titleName}
          description={`${report.monthLabel} payroll activity and settlement summary.`}
        >
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--neo-text-tertiary)]">
            <span className="rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-2.5 py-1">
              {report.monthLabel}
            </span>
            <span className="rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-2.5 py-1">
              {report.rows.length.toLocaleString("en-US")} activity rows
            </span>
          </div>
        </NeoPanel>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {summaryCards.map((card) => (
            <KpiTile
              key={card.label}
              label={card.label}
              value={card.value}
              meta={card.meta}
              tone={card.tone}
              className={cn("min-h-[104px]", card.className)}
            />
          ))}
        </div>

        {!report.supabaseConfigured && (
          <NeoPanel bodyClassName="px-4 py-3">
            <p className="text-sm text-rose-300">
              {report.loadError ?? "Supabase is not configured."}
            </p>
          </NeoPanel>
        )}

        {report.supabaseConfigured && report.loadError && (
          <NeoPanel
            className="border-[rgb(216_180_106_/_0.22)] bg-[rgb(216_180_106_/_0.06)]"
            bodyClassName="px-4 py-3"
          >
            <p className="text-sm text-[var(--neo-gold-soft)]">
              Some data may be incomplete: {report.loadError}
            </p>
          </NeoPanel>
        )}

        <NeoPanel
          eyebrow="Activity"
          title="Monthly activity"
          description="Labor, reimbursements, advance deductions, and payments included in this period."
          bodyClassName="p-0"
        >
          {report.rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No rows for this month."
                description="Choose another month or return to the worker profile to review older activity."
                className="py-10"
              />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <NeoTable
                  className="rounded-none border-0 bg-transparent shadow-none"
                  scrollClassName="airtable-table-scroll"
                  tableClassName="min-w-[720px]"
                >
                  <thead>
                    <tr>
                      <th className={reportTableHeadClass}>Date</th>
                      <th className={reportTableHeadClass}>Type</th>
                      <th className={reportTableHeadClass}>Project</th>
                      <th className={cn(reportTableHeadClass, "text-right tabular-nums")}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr
                        key={r.id}
                        className="transition-colors duration-150 hover:bg-[var(--neo-surface-muted)]"
                      >
                        <td className={cn(reportTableCellClass, "tabular-nums")}>{r.date}</td>
                        <td className={reportTableCellClass}>{r.type}</td>
                        <td
                          className={cn(reportTableCellClass, "text-[var(--neo-text-secondary)]")}
                        >
                          {r.projectLabel}
                        </td>
                        <td className={cn(reportTableCellClass, "text-right")}>
                          <NeoAmount tone={r.amount < 0 ? "muted" : "neutral"}>
                            {fmtSignedUsd(r.amount)}
                          </NeoAmount>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </NeoTable>
              </div>

              <div className="grid gap-2 p-3 md:hidden">
                {report.rows.map((r) => (
                  <NeoMobileCard key={r.id} className="px-3 py-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--neo-text-primary)]">
                          {r.type}
                        </p>
                        <p className="mt-1 truncate text-[12px] text-[var(--neo-text-secondary)]">
                          {r.projectLabel}
                        </p>
                        <p className="mt-2 text-[12px] tabular-nums text-[var(--neo-text-tertiary)]">
                          {r.date}
                        </p>
                      </div>
                      <NeoAmount
                        tone={r.amount < 0 ? "muted" : "neutral"}
                        className="shrink-0 text-right text-[13px]"
                      >
                        {fmtSignedUsd(r.amount)}
                      </NeoAmount>
                    </div>
                  </NeoMobileCard>
                ))}
              </div>
            </>
          )}
        </NeoPanel>
      </div>

      <WorkerPayrollStatementPrint report={report} />
    </PageLayout>
  );
}
