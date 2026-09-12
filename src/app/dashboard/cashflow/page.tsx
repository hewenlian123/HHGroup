import Link from "next/link";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getReportsData, getReportDateRange } from "@/lib/reports-db";
import { financePathWithReturn } from "@/lib/finance-navigation";
import { formatCurrency } from "@/lib/formatters";
import { authorizedAppRole } from "@/lib/auth-role";
import { FinancialDataUnavailableError } from "@/lib/financial-availability";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const supabase = await createServerSupabaseClient({ noStore: true });
  if (!supabase) throw new FinancialDataUnavailableError("cashflow session", null);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new FinancialDataUnavailableError("cashflow session", authError);
  if (!user || !authorizedAppRole(user)) {
    throw new FinancialDataUnavailableError("cashflow session", {
      code: "42501",
      message: "Owner or admin authentication required.",
    });
  }
  const dataLoadWarning =
    "Paid Expenses and full Net Cash Flow are unavailable: expense recognition does not establish cash settlement, and separate payment ledgers do not prove a complete non-duplicated cash-out total.";
  const reporting = await getReportsData(
    getReportDateRange({
      period: searchParams?.period || "all-time",
      from: searchParams?.from,
      to: searchParams?.to,
    }),
    supabase,
    { projectId: searchParams?.projectId, customerId: searchParams?.customerId }
  );
  const cashIn = reporting.monthly.kpis.find((k) => k.key === "cashCollected")!.value;
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const inWindow = (date: string | null) => !!date && date >= today && date <= in30Days;
  const expectedInflow = reporting.arAging.rows
    .filter((r) => inWindow(r.dueDate))
    .reduce((n, r) => n + r.amount, 0);
  const expectedOutflow = reporting.apAging.rows
    .filter((r) => inWindow(r.dueDate))
    .reduce((n, r) => n + r.amount, 0);
  const cashInByProject = new Map<string, number>();
  for (const record of reporting.records.cashCollected) {
    const id = record.projectId || "unassigned";
    cashInByProject.set(id, (cashInByProject.get(id) || 0) + record.amount);
  }
  const allBreakdownRows = [...cashInByProject].map(([id, cashIn]) => ({
    id,
    name:
      reporting.projectProfitability.rows.find((p) => p.projectId === id)?.project ||
      (id === "unassigned" ? "Unassigned project" : id),
    cashIn,
  }));
  const originParams = Object.fromEntries(
    Object.entries(searchParams || {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
  const reportHref = (metric: string, extra: Record<string, string> = {}) =>
    financePathWithReturn(
      `/reports?${new URLSearchParams({ period: "all-time", ...originParams, metric, ...extra })}`,
      `/dashboard/cashflow?${new URLSearchParams(originParams)}`
    );

  return (
    <PageLayout
      header={
        <PageHeader
          title="Cashflow"
          description={`Collected cash: ${reporting.range.label} (${reporting.range.start} to ${reporting.range.end}). Current AR/AP due in next 30 days; not guaranteed cash movements.`}
          actions={
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          }
        />
      }
    >
      {dataLoadWarning ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      <SectionHeader label="Current Position" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Collected Cash</span>
        <span className="text-lg font-medium tabular-nums">
          <Link className="underline" href={reportHref("cashCollected")}>
            {formatCurrency(cashIn)}
          </Link>
        </span>
        <span className="text-sm text-muted-foreground">Paid Expenses</span>
        <span className="text-lg font-medium tabular-nums">Unavailable</span>
        <span className="text-sm text-muted-foreground">Net Cash Flow</span>
        <span className="text-lg font-medium tabular-nums">Unavailable</span>
      </div>
      <Divider />

      <SectionHeader label="Balances due in next 30 days" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">AR due</span>
        <span className="text-lg font-medium tabular-nums">
          <Link
            className="underline"
            href={reportHref("outstandingAr", { dueFrom: today, dueTo: in30Days })}
          >
            {formatCurrency(expectedInflow)}
          </Link>
        </span>
        <span className="text-sm text-muted-foreground">AP due</span>
        <span className="text-lg font-medium tabular-nums">
          <Link
            className="underline"
            href={reportHref("billsAp", { dueFrom: today, dueTo: in30Days })}
          >
            {formatCurrency(expectedOutflow)}
          </Link>
        </span>
      </div>
      <Divider />

      <SectionHeader label="Project Breakdown" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 text-left text-hh-table-header uppercase text-muted-foreground">
                Project
              </th>
              <th className="px-3 py-2 text-right text-hh-table-header uppercase text-muted-foreground hh-fin">
                Collected Cash
              </th>
              <th className="px-3 py-2 text-right text-hh-table-header uppercase text-muted-foreground hh-fin">
                Paid Expenses
              </th>
              <th className="px-3 py-2 text-right text-hh-table-header uppercase text-muted-foreground hh-fin">
                Net Cash Flow
              </th>
            </tr>
          </thead>
          <tbody>
            {allBreakdownRows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="py-1.5 px-3">
                  <Link
                    className="underline"
                    href={reportHref("cashCollected", { projectId: r.id })}
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">{formatCurrency(r.cashIn)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">Unavailable</td>
                <td className="py-1.5 px-3 text-right tabular-nums">Unavailable</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
