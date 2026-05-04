import Link from "next/link";
import { PageLayout, PageHeader, SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import {
  getFinanceOwnerDashboard,
  type FinanceOwnerCashFlowPoint,
  type FinanceOwnerProjectRow,
} from "@/lib/finance-owner-dashboard";
import { cn } from "@/lib/utils";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const EMPTY_OWNER_DASHBOARD: Awaited<ReturnType<typeof getFinanceOwnerDashboard>> = {
  kpis: {
    cashCollectedThisMonth: 0,
    invoicedThisMonth: 0,
    expenseThisMonth: 0,
    profitThisMonth: 0,
    unpaidInvoices: 0,
    pendingPayments: 0,
    pendingPaymentsBreakdown: {
      apOutstanding: 0,
      workerOwed: 0,
      approvedReimbursementsUnpaid: 0,
    },
  },
  cashFlow: [] as FinanceOwnerCashFlowPoint[],
  topProjects: [] as FinanceOwnerProjectRow[],
  underwaterProjects: [] as FinanceOwnerProjectRow[],
  alerts: {
    overdueInvoiceAmount: 0,
    overdueInvoiceCount: 0,
    unpaidWorkersCount: 0,
    unpaidWorkersAmount: 0,
    missingReceiptsCount: 0,
    projectsInLossCount: 0,
  },
};

export default async function FinanceOwnerDashboardPage() {
  let data = EMPTY_OWNER_DASHBOARD;
  let dataLoadWarning: string | null = null;
  try {
    data = await getFinanceOwnerDashboard();
  } catch (e) {
    logServerPageDataError("financial/owner", e);
    dataLoadWarning = serverDataLoadWarning(e, "owner finance dashboard");
  }

  const kpiItems = [
    { label: "Cash collected (month)", value: data.kpis.cashCollectedThisMonth },
    { label: "Invoiced (month)", value: data.kpis.invoicedThisMonth },
    { label: "Expense (month)", value: data.kpis.expenseThisMonth },
    {
      label: "Profit (month)",
      value: data.kpis.profitThisMonth,
      emphasize: true as const,
    },
    { label: "Unpaid invoices", value: data.kpis.unpaidInvoices },
    {
      label: "Pending payments",
      value: data.kpis.pendingPayments,
      sub: `AP ${fmtUsd(data.kpis.pendingPaymentsBreakdown.apOutstanding)} · Workers ${fmtUsd(
        data.kpis.pendingPaymentsBreakdown.workerOwed
      )} · Approved reimb ${fmtUsd(
        data.kpis.pendingPaymentsBreakdown.approvedReimbursementsUnpaid
      )} (overlap possible)`,
    },
  ] as const;

  const alertRows = [
    {
      key: "overdue",
      label: "Overdue invoices",
      detail:
        data.alerts.overdueInvoiceCount > 0
          ? `${data.alerts.overdueInvoiceCount} · ${fmtUsd(data.alerts.overdueInvoiceAmount)}`
          : "None",
      href: "/financial/ar",
      active: data.alerts.overdueInvoiceCount > 0,
    },
    {
      key: "workers",
      label: "Unpaid workers",
      detail:
        data.alerts.unpaidWorkersCount > 0
          ? `${data.alerts.unpaidWorkersCount} · ${fmtUsd(data.alerts.unpaidWorkersAmount)}`
          : "None",
      href: "/labor/worker-balances",
      active: data.alerts.unpaidWorkersCount > 0,
    },
    {
      key: "receipts",
      label: "Missing receipts",
      detail:
        data.alerts.missingReceiptsCount > 0
          ? `${data.alerts.missingReceiptsCount} in last 90 days (no receipt URL)`
          : "None flagged",
      href: "/financial/expenses",
      active: data.alerts.missingReceiptsCount > 0,
    },
    {
      key: "loss",
      label: "Projects in loss",
      detail:
        data.alerts.projectsInLossCount > 0
          ? `${data.alerts.projectsInLossCount} with negative profit`
          : "None",
      href: "/projects",
      active: data.alerts.projectsInLossCount > 0,
    },
  ];

  const quickActions = [
    { label: "Add expense", href: "/financial/expenses/new" },
    { label: "Upload receipt", href: "/upload-receipt" },
    { label: "Pay worker", href: "/labor/payments" },
    { label: "Create invoice", href: "/financial/invoices/new" },
  ] as const;

  const cfMax = Math.max(1, ...data.cashFlow.flatMap((p) => [p.income, p.expense]));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Finance dashboard"
          description="This month performance, project profitability, and cash movement."
          actions={
            <Link
              href="/financial"
              className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] sm:min-h-0 inline-flex items-center"
            >
              Financial
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

      <SectionHeader label="This month" />
      <p className="mt-1 text-xs text-muted-foreground">
        Profit uses cash collected minus expense (expense lines + labor). Pending payments = AP
        outstanding + worker balances owed; approved reimbursement rows are listed separately and
        may already be included in worker balances.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpiItems.map((k) => (
          <div key={k.label} className="kpi-metric">
            <span className="kpi-metric-label">{k.label}</span>
            <span
              className={cn(
                "kpi-metric-value mt-0.5 block tabular-nums",
                "emphasize" in k &&
                  k.emphasize &&
                  (k.value >= 0 ? "text-hh-profit-positive" : "text-red-600 dark:text-red-400")
              )}
            >
              {"emphasize" in k && k.emphasize && k.value < 0 ? "−" : ""}
              {fmtUsd(Math.abs(k.value))}
            </span>
            {"sub" in k && k.sub ? (
              <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                {k.sub}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <Divider />

      <SectionHeader label="Cash flow" />
      <p className="mt-1 text-xs text-muted-foreground">
        Payments received vs. expense lines + labor (last 6 months).
      </p>
      <div className="mt-3 space-y-3">
        {data.cashFlow.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          data.cashFlow.map((row) => (
            <div key={row.label} className="border-b border-border/60 pb-3 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{row.label}</span>
                <div className="flex gap-4 text-sm tabular-nums text-muted-foreground">
                  <span>
                    In <span className="text-foreground">{fmtUsd(row.income)}</span>
                  </span>
                  <span>
                    Out <span className="text-foreground">{fmtUsd(row.expense)}</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="h-1.5 bg-muted/40">
                  <div
                    className="h-full bg-emerald-600/75 dark:bg-emerald-500/80"
                    style={{ width: `${Math.min(100, (row.income / cfMax) * 100)}%` }}
                  />
                </div>
                <div className="h-1.5 bg-muted/40">
                  <div
                    className="h-full bg-foreground/30"
                    style={{ width: `${Math.min(100, (row.expense / cfMax) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Divider />

      <SectionHeader label="Top projects" />
      <p className="mt-1 text-xs text-muted-foreground">
        By profit (contract + approved CO vs. labor, expenses, sub bills).
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="py-2 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Project
              </th>
              <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                Revenue
              </th>
              <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                Expense
              </th>
              <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                Profit
              </th>
              <th className="py-2 pl-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                Profit %
              </th>
            </tr>
          </thead>
          <tbody>
            {data.topProjects.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-muted-foreground">
                  No projects.
                </td>
              </tr>
            ) : (
              data.topProjects.map((r) => (
                <tr key={r.projectId} className="border-b border-border/40">
                  <td className="py-1.5 pr-3">
                    <Link
                      href={`/projects/${r.projectId}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtUsd(r.revenue)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtUsd(r.expense)}</td>
                  <td
                    className={cn(
                      "py-1.5 px-2 text-right tabular-nums",
                      r.profit < 0 ? "text-red-600 dark:text-red-400" : ""
                    )}
                  >
                    {fmtUsd(r.profit)}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                    {r.revenue > 0 ? `${r.profitPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.underwaterProjects.length > 0 ? (
        <>
          <Divider />
          <SectionHeader label="In the red" />
          <p className="mt-1 text-xs text-muted-foreground">
            Other losing projects (worst first), when they are not already listed in the top five
            above.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Project
                  </th>
                  <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Revenue
                  </th>
                  <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Expense
                  </th>
                  <th className="py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Profit
                  </th>
                  <th className="py-2 pl-2 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground tabular-nums">
                    Profit %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.underwaterProjects.map((r) => (
                  <tr key={`u-${r.projectId}`} className="border-b border-border/40">
                    <td className="py-1.5 pr-3">
                      <Link
                        href={`/projects/${r.projectId}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmtUsd(r.revenue)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmtUsd(r.expense)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-red-600 dark:text-red-400">
                      {fmtUsd(r.profit)}
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                      {r.revenue > 0 ? `${r.profitPct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <Divider />

      <SectionHeader label="Alerts" />
      <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
        {alertRows.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  a.active ? "bg-amber-500" : "bg-muted-foreground/40"
                )}
                aria-hidden
              />
              <span className="font-medium">{a.label}</span>
              <span className="truncate text-sm text-muted-foreground">{a.detail}</span>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href={a.href}>Open</Link>
            </Button>
          </li>
        ))}
      </ul>

      <Divider />

      <SectionHeader label="Quick actions" />
      <div className="mt-2 flex flex-wrap gap-2">
        {quickActions.map((q) => (
          <Button key={q.href} variant="outline" size="sm" asChild>
            <Link href={q.href}>{q.label}</Link>
          </Button>
        ))}
      </div>
    </PageLayout>
  );
}
