import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ChevronRight,
  CircleDollarSign,
  FileText,
  FileWarning,
  Layers,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageLayout, PageHeader, SectionHeader } from "@/components/base";
import {
  getFinanceOwnerDashboard,
  type FinanceOwnerProjectRow,
} from "@/lib/finance-owner-dashboard";
import { cn } from "@/lib/utils";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { FinanceOwnerCashFlowChart } from "./_components/finance-owner-cash-flow-chart";
import { FinanceOwnerHeaderActions } from "./_components/finance-owner-header-actions";
import { FinanceOwnerPendingDonut } from "./_components/finance-owner-pending-donut";
import { fmtUsdAdaptive, fmtUsdFull, fmtUsdSignedFull } from "./_lib/format-owner-currency";

export const dynamic = "force-dynamic";

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
  cashFlow: [],
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

const pageBg = "bg-zinc-50 dark:bg-background";

const cardBase =
  "rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] transition-[transform,box-shadow,border-color] duration-200 ease-out dark:border-border/50 dark:bg-card/80 dark:shadow-none";

const cardHover =
  "hover:-translate-y-px hover:border-zinc-300/90 hover:shadow-[0_8px_32px_rgba(0,0,0,0.07)] dark:hover:border-border";

function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Margin profile shown only as UI labeling from existing profitPct (presentation only). */
function HealthStripe({ row }: { row: FinanceOwnerProjectRow }) {
  const pctOk = Number.isFinite(row.profitPct);
  const atRisk = row.profit < 0;
  const strong = !atRisk && row.revenue > 0 && pctOk && row.profitPct >= 14;
  const watch = !atRisk && !strong && row.revenue > 0 && pctOk;

  const label = atRisk
    ? "At risk"
    : strong
      ? "On track"
      : row.revenue > 0
        ? pctOk
          ? "Watch"
          : "—"
        : "—";

  const dotClass = (i: number) => {
    if (row.revenue <= 0 || !pctOk) return "bg-zinc-200 dark:bg-muted";
    if (atRisk) return i === 0 ? "bg-red-500" : "bg-zinc-200 dark:bg-muted";
    if (strong) return "bg-emerald-500";
    if (watch) return i <= 1 ? "bg-amber-400" : "bg-zinc-200 dark:bg-muted";
    return "bg-zinc-200 dark:bg-muted";
  };

  const healthTip =
    row.revenue <= 0
      ? "No revenue recorded — health neutral."
      : !pctOk
        ? "Margin data unavailable for display."
        : `${label} (${formatPctDisplay(row.profitPct)} margin)`;

  return (
    <div className="flex items-center justify-end gap-2.5" title={healthTip}>
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-2 rounded-full transition-colors duration-200 ease-out",
              dotClass(i)
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          "max-w-[5.5rem] truncate text-right text-[11px] font-semibold tabular-nums tracking-tight sm:max-w-none",
          atRisk && "text-red-600 dark:text-red-400",
          strong && "text-emerald-700 dark:text-emerald-400",
          watch && !atRisk && "text-amber-700 dark:text-amber-400",
          row.revenue <= 0 && "font-normal text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function formatPctDisplay(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const a = Math.abs(pct);
  const decimals = a >= 1000 ? 0 : 1;
  const body = a.toFixed(decimals);
  return `${pct >= 0 ? "" : "−"}${body}%`;
}

function pctFullTooltip(pct: number): string {
  if (!Number.isFinite(pct)) return "Margin —";
  return `Margin ${pct.toLocaleString("en-US", { maximumFractionDigits: 8 })}%`;
}

function ProfitMarginTrack({ row }: { row: FinanceOwnerProjectRow }) {
  if (row.revenue <= 0) {
    return <span className="text-xs tabular-nums text-muted-foreground">—</span>;
  }
  const pct = Number.isFinite(row.profitPct) ? row.profitPct : 0;
  const barW = pct === 0 ? 0 : Math.min(100, Math.max(4, Math.abs(pct)));
  const positive = pct >= 0;
  const pctLabel = formatPctDisplay(Number.isFinite(row.profitPct) ? row.profitPct : NaN);

  return (
    <div className="w-full max-w-[168px] min-w-0 sm:max-w-none">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Margin</span>
        <span
          className={cn(
            "max-w-[5rem] shrink-0 truncate tabular-nums normal-case sm:max-w-none",
            positive ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          )}
          title={pctFullTooltip(Number.isFinite(row.profitPct) ? row.profitPct : NaN)}
        >
          {pctLabel}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-muted/50">
        <div
          className={cn(
            "h-full max-w-full rounded-full transition-[width] duration-300 ease-out",
            positive
              ? "bg-gradient-to-r from-emerald-500/90 to-emerald-600/80"
              : "bg-gradient-to-r from-red-500/90 to-red-600/75"
          )}
          style={{ width: `${barW}%` }}
        />
      </div>
    </div>
  );
}

const projectCols =
  "md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(0,0.78fr)_minmax(0,1fr)_minmax(0,0.85fr)] md:gap-x-4 md:gap-y-0";

const projectHeaderGrid = cn(
  projectCols,
  "hidden border-b border-zinc-100 pb-3 dark:border-border/60"
);

const projectRowGridMd = cn(projectCols, "md:items-center md:py-5");

function OwnerProjectList({
  testId,
  rows,
  emptyTitle,
  emptyBody,
}: {
  testId: string;
  rows: FinanceOwnerProjectRow[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (rows.length === 0) {
    return (
      <div data-testid={testId} className="min-w-0">
        <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-5 py-12 text-center transition-colors duration-200 ease-out dark:border-border/60 dark:bg-muted/15 max-md:px-4 max-md:py-14">
          <Layers className="h-10 w-10 text-zinc-300 dark:text-zinc-600" aria-hidden />
          <p className="mt-4 text-sm font-semibold text-foreground">{emptyTitle}</p>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{emptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={testId} className="min-w-0">
      <div
        className={cn(
          projectHeaderGrid,
          "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid"
        )}
      >
        <div>Project</div>
        <div className="text-right tabular-nums">Revenue</div>
        <div className="text-right tabular-nums">Expense</div>
        <div className="text-right tabular-nums">Profit</div>
        <div className="min-w-0">Margin</div>
        <div className="text-right">Health</div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-border/50">
        {rows.map((r) => (
          <div
            key={r.projectId}
            className={cn(
              "flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50/30 px-4 py-4 transition-colors duration-200 ease-out hover:bg-zinc-50/90 max-md:gap-3 md:border-0 md:bg-transparent md:px-0 dark:border-border/50 dark:bg-muted/10 md:dark:border-transparent md:dark:bg-transparent md:dark:hover:bg-muted/25",
              projectRowGridMd,
              "md:hover:bg-zinc-50/80"
            )}
          >
            <div className="min-w-0 md:contents">
              <div className="md:min-w-0">
                <Link
                  href={`/projects/${r.projectId}`}
                  className="inline-flex min-h-[44px] max-w-full items-center text-base font-semibold leading-snug text-foreground underline-offset-4 transition-colors duration-200 ease-out hover:underline md:min-h-0 md:block md:truncate md:text-sm"
                  title={r.name}
                >
                  <span className="line-clamp-4 break-words [overflow-wrap:anywhere] md:line-clamp-none md:[overflow-wrap:normal]">
                    {r.name}
                  </span>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm md:contents">
                <div className="text-muted-foreground md:text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wide md:hidden">
                    Revenue
                  </span>
                  <div
                    className="mt-0.5 max-w-full truncate text-right tabular-nums text-foreground md:mt-0 md:truncate md:text-sm whitespace-nowrap"
                    title={fmtUsdFull(r.revenue)}
                  >
                    {fmtUsdAdaptive(r.revenue)}
                  </div>
                </div>
                <div className="text-muted-foreground md:text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wide md:hidden">
                    Expense
                  </span>
                  <div
                    className="mt-0.5 max-w-full truncate text-right tabular-nums text-foreground md:mt-0 md:truncate md:text-sm whitespace-nowrap"
                    title={fmtUsdFull(r.expense)}
                  >
                    {fmtUsdAdaptive(r.expense)}
                  </div>
                </div>
                <div className="text-muted-foreground md:text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wide md:hidden">
                    Profit
                  </span>
                  <div
                    className={cn(
                      "mt-0.5 max-w-full truncate text-right tabular-nums font-semibold md:mt-0 md:truncate md:text-sm whitespace-nowrap",
                      r.profit > 0 && "text-emerald-700 dark:text-emerald-400",
                      r.profit < 0 && "text-red-600 dark:text-red-400",
                      r.profit === 0 && "font-medium text-muted-foreground"
                    )}
                    title={fmtUsdSignedFull(r.profit)}
                  >
                    {fmtUsdAdaptive(r.profit)}
                  </div>
                </div>
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                    Margin
                  </span>
                  <div className="mt-1 md:mt-0 md:py-0.5">
                    <ProfitMarginTrack row={r} />
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">
                    Health
                  </span>
                  <HealthStripe row={r} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function FinanceOwnerDashboardPage() {
  let data = EMPTY_OWNER_DASHBOARD;
  let dataLoadWarning: string | null = null;
  try {
    data = await getFinanceOwnerDashboard();
  } catch (e) {
    logServerPageDataError("financial/owner", e);
    dataLoadWarning = serverDataLoadWarning(e, "owner finance dashboard");
  }

  const reportingMonth = new Date();
  const monthLabel = reportingMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  type KpiKey = "neutral" | "expense" | "profit" | "pending" | "warning";

  const pendingSubCompact = `AP ${fmtUsdAdaptive(data.kpis.pendingPaymentsBreakdown.apOutstanding)} · Workers ${fmtUsdAdaptive(
    data.kpis.pendingPaymentsBreakdown.workerOwed
  )} · Reimb ${fmtUsdAdaptive(data.kpis.pendingPaymentsBreakdown.approvedReimbursementsUnpaid)}`;
  const pendingSubFull = `AP ${fmtUsdFull(data.kpis.pendingPaymentsBreakdown.apOutstanding)} · Workers ${fmtUsdFull(
    data.kpis.pendingPaymentsBreakdown.workerOwed
  )} · Approved reimb ${fmtUsdFull(data.kpis.pendingPaymentsBreakdown.approvedReimbursementsUnpaid)}`;

  const kpiItems: {
    label: string;
    value: number;
    icon: typeof CircleDollarSign;
    iconWrap: string;
    accent: KpiKey;
    emphasize?: true;
    sub?: string;
    subTitle?: string;
  }[] = [
    {
      label: "Cash collected",
      value: data.kpis.cashCollectedThisMonth,
      icon: CircleDollarSign,
      iconWrap: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      accent: "neutral",
    },
    {
      label: "Invoiced",
      value: data.kpis.invoicedThisMonth,
      icon: FileText,
      iconWrap: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      accent: "neutral",
    },
    {
      label: "Expense",
      value: data.kpis.expenseThisMonth,
      icon: Receipt,
      iconWrap: "bg-red-500/10 text-red-700 dark:text-red-400",
      accent: "expense",
    },
    {
      label: "Profit",
      value: data.kpis.profitThisMonth,
      emphasize: true,
      icon: data.kpis.profitThisMonth >= 0 ? TrendingUp : TrendingDown,
      iconWrap:
        data.kpis.profitThisMonth >= 0
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-red-500/12 text-red-700 dark:text-red-400",
      accent: "profit",
    },
    {
      label: "Unpaid invoices",
      value: data.kpis.unpaidInvoices,
      icon: FileWarning,
      iconWrap: "bg-amber-500/12 text-amber-800 dark:text-amber-400",
      accent: "warning",
    },
    {
      label: "Pending payments",
      value: data.kpis.pendingPayments,
      icon: Wallet,
      iconWrap: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
      accent: "pending",
      sub: pendingSubCompact,
      subTitle: pendingSubFull,
    },
  ];

  const accentInset = (a: KpiKey) => {
    if (a === "expense") return "shadow-[inset_0_0_0_1px_rgba(248,113,113,0.12)] dark:shadow-none";
    if (a === "profit")
      return data.kpis.profitThisMonth >= 0
        ? "shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)] dark:shadow-none"
        : "shadow-[inset_0_0_0_1px_rgba(248,113,113,0.22)] dark:shadow-none";
    if (a === "pending") return "shadow-[inset_0_0_0_1px_rgba(167,139,250,0.2)] dark:shadow-none";
    if (a === "warning") return "shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)] dark:shadow-none";
    return "";
  };

  const alertRows: {
    key: string;
    label: string;
    subtitle: string;
    detailTitle?: string;
    href: string;
    active: boolean;
    Icon: LucideIcon;
    tone: "rose" | "amber" | "slate" | "orange";
  }[] = [
    {
      key: "overdue",
      label: "Overdue invoices",
      subtitle:
        data.alerts.overdueInvoiceCount > 0
          ? `${fmtCount(data.alerts.overdueInvoiceCount)} open · ${fmtUsdAdaptive(data.alerts.overdueInvoiceAmount)}`
          : "You’re clear this period",
      detailTitle:
        data.alerts.overdueInvoiceCount > 0
          ? `${fmtCount(data.alerts.overdueInvoiceCount)} open · ${fmtUsdFull(data.alerts.overdueInvoiceAmount)}`
          : undefined,
      href: "/financial/ar",
      active: data.alerts.overdueInvoiceCount > 0,
      Icon: AlertCircle,
      tone: "rose",
    },
    {
      key: "workers",
      label: "Unpaid workers",
      subtitle:
        data.alerts.unpaidWorkersCount > 0
          ? `${fmtCount(data.alerts.unpaidWorkersCount)} open · ${fmtUsdAdaptive(data.alerts.unpaidWorkersAmount)}`
          : "No unpaid worker balances flagged",
      detailTitle:
        data.alerts.unpaidWorkersCount > 0
          ? `${fmtCount(data.alerts.unpaidWorkersCount)} open · ${fmtUsdFull(data.alerts.unpaidWorkersAmount)}`
          : undefined,
      href: "/labor/worker-balances",
      active: data.alerts.unpaidWorkersCount > 0,
      Icon: Users,
      tone: "amber",
    },
    {
      key: "receipts",
      label: "Missing receipts",
      subtitle:
        data.alerts.missingReceiptsCount > 0
          ? `${fmtCount(data.alerts.missingReceiptsCount)} in last 90 days (no receipt URL)`
          : "Nothing missing right now",
      detailTitle:
        data.alerts.missingReceiptsCount > 0
          ? `${fmtCount(data.alerts.missingReceiptsCount)} expenses in last 90 days (no receipt URL)`
          : undefined,
      href: "/financial/expenses",
      active: data.alerts.missingReceiptsCount > 0,
      Icon: Receipt,
      tone: "slate",
    },
    {
      key: "loss",
      label: "Projects in loss",
      subtitle:
        data.alerts.projectsInLossCount > 0
          ? `${fmtCount(data.alerts.projectsInLossCount)} with negative profit`
          : "No losing projects in scope",
      detailTitle:
        data.alerts.projectsInLossCount > 0
          ? `${fmtCount(data.alerts.projectsInLossCount)} projects with negative profit`
          : undefined,
      href: "/projects",
      active: data.alerts.projectsInLossCount > 0,
      Icon: TrendingDown,
      tone: "orange",
    },
  ];

  const anyAlertHot = alertRows.some((a) => a.active);

  const alertIconCircle = (tone: (typeof alertRows)[number]["tone"], active: boolean) => {
    const map = {
      rose: active
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
        : "bg-zinc-100 text-zinc-400 dark:bg-muted",
      amber: active
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-400"
        : "bg-zinc-100 text-zinc-400 dark:bg-muted",
      slate: active
        ? "bg-zinc-200/80 text-zinc-800 dark:text-zinc-300"
        : "bg-zinc-100 text-zinc-400 dark:bg-muted",
      orange: active
        ? "bg-orange-500/12 text-orange-800 dark:text-orange-400"
        : "bg-zinc-100 text-zinc-400 dark:bg-muted",
    };
    return cn(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out",
      map[tone]
    );
  };

  return (
    <PageLayout
      className={cn(pageBg, "print:bg-white")}
      divider={false}
      header={
        <PageHeader
          title="Finance dashboard"
          description={
            <>
              <span className="block text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400 sm:inline sm:text-base">
                Snapshot for <span className="font-medium text-foreground">{monthLabel}</span>.
              </span>{" "}
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground sm:mt-0 sm:inline">
                Profit = cash collected − expense (lines + labor). Pending includes AP + worker
                balances; reimbursements may overlap.
              </span>
            </>
          }
          actions={
            <>
              <Link
                href="/financial"
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
              >
                Financial
              </Link>
              <FinanceOwnerHeaderActions monthLabel={monthLabel} />
            </>
          }
        />
      }
    >
      <div className="flex flex-col gap-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] lg:gap-12 lg:pb-[max(3rem,env(safe-area-inset-bottom))] lg:pt-4 print:gap-6">
        {dataLoadWarning ? (
          <p
            className="rounded-2xl border border-amber-500/25 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/25 dark:text-amber-50"
            role="status"
          >
            {dataLoadWarning}
          </p>
        ) : null}

        {/* KPI — executive strip: 2 columns phone, no cramped overflow */}
        <section aria-label="Key metrics">
          <div className="grid grid-cols-2 gap-3 max-md:gap-y-4 md:grid-cols-3 xl:grid-cols-6 xl:gap-4">
            {kpiItems.map((k) => {
              const Icon = k.icon;
              const valueTone =
                k.accent === "expense"
                  ? "text-red-700 dark:text-red-400"
                  : k.accent === "profit"
                    ? data.kpis.profitThisMonth >= 0
                      ? "text-emerald-800 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                    : k.accent === "pending"
                      ? "text-violet-900 dark:text-violet-300"
                      : k.accent === "warning"
                        ? "text-amber-900 dark:text-amber-300"
                        : "text-zinc-900 dark:text-zinc-100";

              const pulse =
                k.accent === "expense"
                  ? { outer: "bg-red-400/30", inner: "bg-red-500/85" }
                  : k.accent === "profit"
                    ? data.kpis.profitThisMonth >= 0
                      ? { outer: "bg-emerald-400/40", inner: "bg-emerald-500/90" }
                      : { outer: "bg-red-400/35", inner: "bg-red-500/90" }
                    : k.accent === "pending"
                      ? { outer: "bg-violet-400/35", inner: "bg-violet-600/90" }
                      : k.accent === "warning"
                        ? { outer: "bg-amber-400/35", inner: "bg-amber-500/90" }
                        : { outer: "bg-zinc-300/50", inner: "bg-zinc-500/80" };

              return (
                <div
                  key={k.label}
                  className={cn(
                    "kpi-metric group flex min-h-0 flex-col px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5",
                    cardBase,
                    cardHover,
                    accentInset(k.accent)
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="kpi-metric-label font-normal leading-snug text-[13px] text-zinc-500 dark:text-zinc-400">
                      {k.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full p-2 ring-1 ring-black/[0.04] transition-transform duration-200 ease-out group-hover:scale-[1.03] dark:ring-white/10",
                        k.iconWrap
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <span
                    className={cn(
                      "kpi-metric-value mt-4 block max-w-full truncate text-[clamp(1.25rem,4.5vw,2rem)] font-semibold leading-none tracking-tight tabular-nums sm:mt-5 sm:text-[2rem]",
                      valueTone
                    )}
                    title={fmtUsdSignedFull(k.value)}
                  >
                    {fmtUsdAdaptive(k.value)}
                  </span>
                  <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-border/60">
                    <span className="relative flex h-2 w-2">
                      <span
                        className={cn(
                          "absolute inline-flex h-full w-full rounded-full opacity-75",
                          pulse.outer
                        )}
                      />
                      <span
                        className={cn("relative inline-flex h-2 w-2 rounded-full", pulse.inner)}
                      />
                    </span>
                    <span className="text-[11px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500">
                      {k.sub ? "Breakdown below" : "Month to date"}
                    </span>
                  </div>
                  {k.sub ? (
                    <span
                      className="mt-2 line-clamp-3 text-[10px] leading-snug text-muted-foreground"
                      title={k.subTitle ?? k.sub}
                    >
                      {k.sub}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Bento: primary chart + secondary rail */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start xl:gap-8">
          <div className={cn("min-w-0 xl:col-span-8", cardBase, "p-4 sm:p-8 lg:p-10")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Liquidity
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
                  Cash flow
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Payments received vs. expense lines + labor — trailing six months.
                </p>
              </div>
              <span className="rounded-full border border-zinc-200/90 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground dark:border-border dark:bg-muted/40">
                Last 6 months
              </span>
            </div>

            <div className="mt-8 sm:mt-10">
              <FinanceOwnerCashFlowChart points={data.cashFlow} />
            </div>

            {data.cashFlow.length > 0 ? (
              <div className="mt-10 border-t border-zinc-100 pt-8 dark:border-border/50">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Period detail
                </p>
                <div className="flex flex-col gap-1">
                  {data.cashFlow.map((row) => (
                    <div
                      key={row.label}
                      className="flex flex-col gap-2 rounded-xl px-3 py-3 text-sm transition-colors duration-200 ease-out hover:bg-zinc-50 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 dark:hover:bg-muted/20"
                    >
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {row.label}
                      </span>
                      <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-1 tabular-nums">
                        <span className="min-w-0 text-muted-foreground">
                          In{" "}
                          <span
                            className="inline-block font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400"
                            title={fmtUsdFull(row.income)}
                          >
                            {fmtUsdAdaptive(row.income)}
                          </span>
                        </span>
                        <span className="min-w-0 text-muted-foreground">
                          Out{" "}
                          <span
                            className="inline-block font-semibold whitespace-nowrap text-red-600 dark:text-red-400"
                            title={fmtUsdFull(row.expense)}
                          >
                            {fmtUsdAdaptive(row.expense)}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
            <div className={cn(cardBase, cardHover, "flex flex-col p-5 sm:p-6")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Attention
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Alerts
                  </h2>
                </div>
                <Link
                  href="/financial/ar"
                  className="inline-flex min-h-[44px] items-center text-xs font-semibold text-primary hover:underline sm:min-h-0"
                >
                  View all
                </Link>
              </div>
              <ul className="mt-6 flex flex-col gap-1">
                {alertRows.map((a) => {
                  const RowIcon = a.Icon;
                  return (
                    <li key={a.key}>
                      <Link
                        href={a.href}
                        title={a.detailTitle}
                        className={cn(
                          "group flex min-h-[44px] items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition-all duration-200 ease-out",
                          "hover:border-zinc-200 hover:bg-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:hover:border-border dark:hover:bg-muted/30"
                        )}
                      >
                        <span className={alertIconCircle(a.tone, a.active)}>
                          <RowIcon className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-foreground">
                            {a.label}
                          </p>
                          <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                            {a.subtitle}
                          </p>
                        </div>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {!anyAlertHot ? (
                <div className="mt-5 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-4 py-3 transition-colors duration-200 ease-out dark:border-emerald-900/40 dark:bg-emerald-950/25">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                    Inbox zero on alerts
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-emerald-800/90 dark:text-emerald-200/90">
                    Nothing here requires owner attention — overdue invoices, unpaid workers,
                    receipt gaps, and losing projects are all quiet for this snapshot.
                  </p>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                cardBase,
                cardHover,
                "p-4 transition-[box-shadow,border-color] duration-200 ease-out sm:p-5"
              )}
            >
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-border/60">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Outstanding
                  </p>
                  <h2 className="mt-1 text-base font-semibold tracking-tight">Pending payments</h2>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Composition of worker, reimb., and AP buckets — overlap possible vs. headline KPI.
              </p>
              <div className="mt-4">
                <FinanceOwnerPendingDonut
                  total={data.kpis.pendingPayments}
                  breakdown={data.kpis.pendingPaymentsBreakdown}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Projects — premium list */}
        <section className="space-y-10">
          <div>
            <SectionHeader label="Top projects" />
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              By profit (contract + approved CO vs. labor, expenses, sub bills).
            </p>
            <div className={cn("mt-6 min-w-0 md:overflow-x-auto", cardBase, "p-4 sm:p-8")}>
              <OwnerProjectList
                testId="owner-top-projects"
                rows={data.topProjects}
                emptyTitle="No projects ranked yet"
                emptyBody="When projects carry profit data for this workspace, your top performers will appear here automatically."
              />
            </div>
          </div>

          {data.underwaterProjects.length > 0 ? (
            <div>
              <SectionHeader label="In the red" />
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Other losing projects (worst first), when they are not already listed in the top
                five above.
              </p>
              <div className={cn("mt-6 min-w-0 md:overflow-x-auto", cardBase, "p-4 sm:p-8")}>
                <OwnerProjectList
                  testId="owner-underwater-projects"
                  rows={data.underwaterProjects}
                  emptyTitle="No underwater projects"
                  emptyBody="None."
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </PageLayout>
  );
}
