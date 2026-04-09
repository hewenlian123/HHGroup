import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabase } from "@/lib/supabase-server";
import { getWorkerMonthlyReport, parseMonthYm } from "@/lib/worker-monthly-report";
import { MonthReportToolbar } from "./month-report-toolbar";
import { WorkerPayrollStatementPrint } from "./worker-payroll-statement-print";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSignedUsd(n: number): string {
  if (n < 0) return `-$${fmtUsd(Math.abs(n))}`;
  return `$${fmtUsd(n)}`;
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

  return (
    <PageLayout
      divider={false}
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
                <Button variant="outline" size="sm" className="rounded-sm print:hidden">
                  Worker profile
                </Button>
              </Link>
              <Link href="/workers">
                <Button variant="outline" size="sm" className="rounded-sm print:hidden">
                  All workers
                </Button>
              </Link>
            </div>
          }
        />
      }
    >
      <Divider className="print:hidden" />
      <div className="print:hidden">
        <SetBreadcrumbEntityTitle label={titleName} />
        <div className="border-b border-border/60 py-3 print:py-2">
          <h2 className="text-lg font-semibold">{titleName}</h2>
          <p className="text-sm text-muted-foreground">{report.monthLabel}</p>
        </div>

        {!report.supabaseConfigured && (
          <p className="py-4 text-sm text-destructive">
            {report.loadError ?? "Supabase is not configured."}
          </p>
        )}

        {report.supabaseConfigured && report.loadError && (
          <p className="py-2 text-sm text-amber-600 dark:text-amber-500">
            Some data may be incomplete: {report.loadError}
          </p>
        )}

        <Divider />

        <SectionHeader label="Summary" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border/60 py-3 text-sm sm:grid-cols-3 md:grid-cols-5 md:gap-y-0">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Earned
            </div>
            <div className="tabular-nums">${fmtUsd(report.summary.earned)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reimbursements
            </div>
            <div className="tabular-nums">${fmtUsd(report.summary.reimbursements)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total owed
            </div>
            <div className="tabular-nums font-medium">${fmtUsd(report.summary.totalOwed)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paid
            </div>
            <div className="tabular-nums">${fmtUsd(report.summary.paid)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Balance
            </div>
            <div
              className={`tabular-nums font-medium ${
                report.summary.balance > 0
                  ? "text-red-600 dark:text-red-400"
                  : report.summary.balance < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : ""
              }`}
            >
              ${fmtUsd(report.summary.balance)}
            </div>
          </div>
        </div>

        <Divider />

        <SectionHeader label="Activity" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Project
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr className="border-b border-border/40">
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No rows for this month.
                  </td>
                </tr>
              ) : (
                report.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="px-3 py-1.5 tabular-nums">{r.date}</td>
                    <td className="px-3 py-1.5">{r.type}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.projectLabel}</td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        r.amount < 0 ? "text-muted-foreground" : ""
                      }`}
                    >
                      {fmtSignedUsd(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WorkerPayrollStatementPrint report={report} />
    </PageLayout>
  );
}
