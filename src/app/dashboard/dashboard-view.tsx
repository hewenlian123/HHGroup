import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/base";
import { Button } from "@/components/ui/button";
import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";
import { TYPO, OS } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { fmtPct, getHealthStatus } from "./dashboard-shared";

type ApBillsSummary = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
  paidThisMonthAmount: number;
};

type SubcontractDetail = {
  id: string;
  subcontractor_id: string;
  project_id: string;
  subcontractor_name: string;
  project_name: string;
};

type OutstandingSubcontract = SubcontractDetail & { balance: number };

type ProjectHealthRow = {
  id: string;
  name: string;
  revenue: number;
  budget: number;
  actual: number;
  profit: number;
  marginPct: number;
};

type KpiItem = {
  key: string;
  label: string;
  value: string;
  icon?: LucideIcon;
};

type UpcomingTask = { id: string; title: string; meta: string; due: string };

export interface DashboardViewProps {
  stats: Awaited<ReturnType<typeof import("@/lib/data").getDashboardStats>>;
  transactions: RecentTransaction[];
  riskOverview: ProjectRiskOverview;
  projects: Awaited<ReturnType<typeof import("@/lib/data").getProjectsDashboard>>;
  subcontractsDetails: SubcontractDetail[];
  billsSummary: { subcontract_id: string; amount: number; status: string }[];
  paymentsSummary: { subcontract_id: string; amount: number }[];
  apBillsSummary: ApBillsSummary;
  laborCostThisWeek: number;
  expensesThisMonth: number;
  overdueInvoices: OverdueInvoiceRow[];
  riskByProjectId: Map<string, "HIGH" | "MEDIUM" | "LOW">;
  outstandingSubcontracts: OutstandingSubcontract[];
  projectHealthRows: ProjectHealthRow[];
  kpis: KpiItem[];
  upcomingTasks: UpcomingTask[];
  recentActivity: RecentTransaction[];
  budgetUsagePct: number;
  profitPositive: boolean;
  /** Set when primary dashboard queries failed (e.g. Supabase misconfiguration). */
  dataLoadWarning?: string | null;
}

const shell =
  "rounded-sm border border-slate-900/[0.045] bg-white/[0.78] shadow-[0_1px_0_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[6px] transition-[box-shadow] duration-300 ease-out hover:shadow-[0_1px_0_rgba(15,23,42,0.035),0_4px_16px_rgba(15,23,42,0.045)] dark:border-border/50 dark:bg-zinc-950/30 dark:shadow-[0_1px_0_rgba(0,0,0,0.14)] dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_6px_22px_rgba(0,0,0,0.12)]";

const dividerLine = "border-slate-900/[0.04] dark:border-border/45";

const linkGhost =
  "touch-manipulation inline-flex min-h-[44px] items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-[#081225] transition-colors hover:text-emerald-700 active:bg-slate-100/80 md:min-h-0 md:active:bg-transparent dark:text-zinc-100 dark:hover:text-emerald-400 dark:active:bg-zinc-800/50 md:dark:active:bg-transparent";

function RiskChip({ risk }: { risk: "HIGH" | "MEDIUM" | "LOW" }) {
  const cfg =
    risk === "HIGH"
      ? { label: "High", dot: "bg-rose-500/65 ring-1 ring-rose-500/20" }
      : risk === "MEDIUM"
        ? { label: "Medium", dot: "bg-amber-500/55 ring-1 ring-amber-500/15" }
        : { label: "Low", dot: "bg-emerald-500/45 ring-1 ring-emerald-500/15" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 tabular-nums dark:text-zinc-500">
      <span className={cn("h-1 w-1 shrink-0 rounded-full", cfg.dot)} aria-hidden />
      {cfg.label}
    </span>
  );
}

function DashSection({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  emphasize,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Larger title + padding when this block is the primary story (e.g. cash flow first). */
  emphasize?: boolean;
}) {
  return (
    <section className={cn(shell, "flex min-w-0 max-w-full flex-col overflow-hidden", className)}>
      <div
        className={cn(
          "flex flex-col gap-2 border-b px-3 max-md:gap-3 sm:px-4 md:flex-row md:items-start md:justify-between",
          dividerLine,
          emphasize ? "py-3.5 md:px-5 md:py-4" : "py-3"
        )}
      >
        <div className="min-w-0">
          {eyebrow ? <p className={TYPO.sectionLabel}>{eyebrow}</p> : null}
          <h2
            className={cn(
              TYPO.primaryName,
              emphasize ? "text-[16px] md:text-[19px]" : "text-[15px] md:text-[17px]"
            )}
          >
            {title}
          </h2>
          {description ? (
            <p
              className={cn(
                TYPO.mutedText,
                "mt-0.5 line-clamp-3 text-[12px] leading-snug md:line-clamp-none md:text-[13px] md:leading-relaxed",
                emphasize && "md:max-w-2xl"
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="min-w-0 shrink-0 pt-0.5 max-md:w-full max-md:pt-1 md:w-auto [&>a]:max-md:flex [&>a]:max-md:w-full [&>a]:max-md:justify-center">
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TaskDueChip({ due }: { due: string }) {
  const isToday = /today/i.test(due);
  const isThisWeek = /this week|week/i.test(due) && !isToday;
  const tone = isToday ? "danger" : isThisWeek ? "warning" : "neutral";
  const dot =
    tone === "danger"
      ? "bg-rose-500"
      : tone === "warning"
        ? "bg-amber-500"
        : "bg-slate-400 dark:bg-zinc-500";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-slate-900/[0.05] bg-white/75 px-2 py-1 text-[11px] font-medium tabular-nums dark:border-border/45 dark:bg-zinc-900/25",
        tone === "danger" &&
          "border-rose-200/80 text-rose-700 dark:border-rose-900/50 dark:text-rose-400",
        tone === "warning" &&
          "border-amber-200/80 text-amber-800 dark:border-amber-900/40 dark:text-amber-400",
        tone === "neutral" && "text-zinc-600 dark:text-zinc-400"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {due}
    </span>
  );
}

function ActivityTypeChip({ type }: { type: RecentTransaction["type"] }) {
  const label =
    type === "invoice"
      ? "Invoice"
      : type === "bill"
        ? "Bill"
        : type === "expense"
          ? "Expense"
          : "Labor";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-slate-900/[0.05] bg-transparent px-2 py-0.5 text-[10px] font-medium capitalize tracking-tight text-zinc-500 dark:border-border/40 dark:text-zinc-500">
      <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-400/80 dark:bg-zinc-500" aria-hidden />
      {label}
    </span>
  );
}

type CashPressurePoint = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
};

/** Buckets same `transactions` window by calendar day for chart only (no API change). */
function buildCashPressureSeries(transactions: RecentTransaction[]): CashPressurePoint[] {
  const slice = transactions.slice(0, 24);
  const byDay = new Map<string, { inflow: number; outflow: number }>();
  for (const t of slice) {
    const day = (t.date ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const cur = byDay.get(day) ?? { inflow: 0, outflow: 0 };
    if (t.amount >= 0) cur.inflow += t.amount;
    else cur.outflow += Math.abs(t.amount);
    byDay.set(day, cur);
  }
  let rows: CashPressurePoint[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, v]) => ({
      key: dayKey,
      label: formatDate(dayKey + "T12:00:00", "compact"),
      inflow: v.inflow,
      outflow: v.outflow,
    }));
  if (rows.length === 0) {
    rows = slice.slice(0, 10).map((t) => ({
      key: t.id,
      label: formatDate(t.date, "compact"),
      inflow: t.amount >= 0 ? t.amount : 0,
      outflow: t.amount < 0 ? Math.abs(t.amount) : 0,
    }));
  } else {
    rows = rows.slice(-10);
  }
  return rows;
}

function CashPressureTimelineChart({ series }: { series: CashPressurePoint[] }) {
  const n = series.length;
  const nets = series.map((s) => s.inflow - s.outflow);
  const maxStack = Math.max(1e-6, ...series.map((s) => Math.max(s.inflow, s.outflow)));
  const lowActivity = n <= 2 || maxStack < 150;
  const barScale = lowActivity ? 0.38 : 0.88;
  const barOpacity = lowActivity ? 0.42 : 0.82;
  const inflowOpacity = barOpacity;
  const outflowOpacity = lowActivity ? barOpacity * 0.92 : barOpacity * 0.88;

  const W = 420;
  const H = 160;
  const padL = 8;
  const padR = 8;
  const padB = 28;
  const netTop = 10;
  const netH = 32;
  const barTop = netTop + netH + 8;
  const barBottom = H - padB;
  const barH = Math.max(22, barBottom - barTop);
  const plotW = W - padL - padR;
  const slot = n > 0 ? plotW / n : plotW;
  const pairGap = slot * 0.17;
  const bw = Math.min(7, slot * 0.13);

  const netMin = Math.min(0, ...nets);
  const netMax = Math.max(0, ...nets);
  const netSpan = Math.max(1e-6, netMax - netMin);

  const barPoints = series.map((s, i) => {
    const cx = padL + slot * i + slot / 2;
    const hi = (s.inflow / maxStack) * barH * barScale;
    const ho = (s.outflow / maxStack) * barH * barScale;
    const y0 = barBottom;
    return { cx, hi, ho, y0, inflow: s.inflow, outflow: s.outflow };
  });

  const netPoints = series.map((_, i) => {
    const cx = padL + slot * i + slot / 2;
    const nv = nets[i] ?? 0;
    const ny = netTop + netH - ((nv - netMin) / netSpan) * netH;
    return { cx, ny };
  });

  const netPath =
    netPoints.length > 1
      ? netPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx.toFixed(1)} ${p.ny.toFixed(1)}`)
          .join(" ")
      : "";

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-slate-900/[0.05] bg-white/[0.4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 dark:border-border/40 dark:bg-transparent dark:text-zinc-500">
          <span
            className="h-1 w-1 shrink-0 rounded-full bg-emerald-600/45 dark:bg-emerald-400/35"
            aria-hidden
          />
          Inflow
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-slate-900/[0.05] bg-white/[0.4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500 dark:border-border/40 dark:bg-transparent dark:text-zinc-500">
          <span
            className="h-1 w-1 shrink-0 rounded-full bg-rose-600/40 dark:bg-rose-400/35"
            aria-hidden
          />
          Outflow
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-slate-900/[0.05] bg-white/[0.4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400 dark:border-border/35 dark:bg-transparent dark:text-zinc-500">
          <span
            className="h-1 w-1 shrink-0 rounded-full bg-zinc-400/70 dark:bg-zinc-500/70"
            aria-hidden
          />
          Net
        </span>
      </div>
      {n === 0 ? (
        <p className={cn(TYPO.mutedText, "py-10 text-center text-[13px]")}>No transactions yet.</p>
      ) : (
        <div className="min-w-0 space-y-2 border-t border-slate-900/[0.04] pt-3 dark:border-border/45">
          <p
            className={cn(
              TYPO.mutedText,
              "text-[12px] leading-snug tracking-tight text-zinc-500/90 md:text-[13px] dark:text-zinc-400/85"
            )}
          >
            Cash inflow vs operating pressure.
          </p>
          {lowActivity ? (
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Low activity in this window — muted scale.
            </p>
          ) : null}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[152px] w-full max-w-full md:h-[160px]"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Cash pressure timeline: inflow and outflow by period"
          >
            <defs>
              <linearGradient id="hhDashInflowGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="rgb(5 150 105)" stopOpacity="0.58" />
              </linearGradient>
              <linearGradient id="hhDashOutflowGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(251 113 133)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="rgb(225 29 72)" stopOpacity="0.52" />
              </linearGradient>
              <filter id="hhDashBarGlow" x="-28%" y="-28%" width="156%" height="156%">
                <feGaussianBlur stdDeviation="0.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {netPath ? (
              <path
                d={netPath}
                fill="none"
                stroke="currentColor"
                className="text-zinc-400 dark:text-zinc-500"
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={lowActivity ? 0.36 : 0.55}
              />
            ) : null}
            {netPoints.map((p, i) => (
              <circle
                key={`net-${series[i]?.key ?? i}`}
                cx={p.cx}
                cy={p.ny}
                r={lowActivity ? 1.5 : 2}
                className="fill-zinc-400 dark:fill-zinc-500"
                opacity={lowActivity ? 0.35 : 0.58}
              />
            ))}

            {barPoints.map((b, i) => {
              const xi = b.cx - bw - pairGap / 2;
              const xo = b.cx + pairGap / 2;
              const yi = b.y0 - b.hi;
              const yo = b.y0 - b.ho;
              return (
                <g key={series[i]?.key ?? i} filter="url(#hhDashBarGlow)">
                  <rect
                    x={xi}
                    y={yi}
                    width={bw}
                    height={Math.max(1, b.hi)}
                    rx={2}
                    fill="url(#hhDashInflowGrad)"
                    opacity={inflowOpacity}
                  />
                  <rect
                    x={xo}
                    y={yo}
                    width={bw}
                    height={Math.max(1, b.ho)}
                    rx={2}
                    fill="url(#hhDashOutflowGrad)"
                    opacity={outflowOpacity}
                  />
                </g>
              );
            })}

            {series.map((s, i) => {
              const cx = padL + slot * i + slot / 2;
              const ty = H - 5;
              return (
                <text
                  key={`lbl-${s.key}`}
                  x={cx}
                  y={ty}
                  textAnchor="middle"
                  className="fill-zinc-400 text-[10px] font-medium tabular-nums tracking-[0.06em] dark:fill-zinc-500"
                  style={{ fontFamily: "ui-sans-serif, system-ui" }}
                >
                  {s.label}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

export function DashboardView(props: DashboardViewProps): React.ReactNode {
  const {
    stats,
    apBillsSummary,
    laborCostThisWeek,
    expensesThisMonth,
    overdueInvoices,
    transactions,
    riskByProjectId,
    outstandingSubcontracts,
    projectHealthRows,
    kpis,
    upcomingTasks,
    recentActivity,
    budgetUsagePct,
    profitPositive,
    dataLoadWarning,
  } = props;

  const cashSlice = transactions.slice(0, 24);
  let cashIn = 0;
  let cashOut = 0;
  for (const t of cashSlice) {
    if (t.amount >= 0) cashIn += t.amount;
    else cashOut += Math.abs(t.amount);
  }
  const cashNet = cashIn - cashOut;

  const cashPressureSeries = buildCashPressureSeries(transactions);

  const overduePreview = overdueInvoices.slice(0, 8);
  const subcontractOutstandingTotal = outstandingSubcontracts.reduce((s, r) => s + r.balance, 0);
  const negativeMarginRows = [...projectHealthRows]
    .filter((p) => p.marginPct < 0)
    .sort((a, b) => a.marginPct - b.marginPct);
  const projectRowsSnapshot = projectHealthRows.slice(0, 8);
  const operatingPressure = apBillsSummary.overdueAmount + laborCostThisWeek;

  return (
    <>
      {dataLoadWarning ? (
        <p
          className="rounded-sm border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

      <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Priority queue: collections → payroll → margin stress */}
        <DashSection
          className="lg:col-span-4"
          eyebrow="Collections"
          title="Overdue invoices"
          description="Past-due AR requiring action."
          action={
            <Link href="/financial/invoices" className={linkGhost}>
              AR desk
            </Link>
          }
        >
          <div className="md:hidden">
            {overduePreview.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                </span>
                <p className={TYPO.mutedText}>No overdue invoices.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
                {overduePreview.map((row) => (
                  <Link
                    key={row.id}
                    href={`/financial/invoices/${row.id}`}
                    className="flex min-h-[52px] items-center gap-3 px-3 py-3 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn(TYPO.primaryName, "truncate text-[14px]")}>
                        {row.projectName || row.projectId || "—"}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                        {row.clientName} · <span className="tabular-nums">{row.daysOverdue}d</span>
                      </p>
                    </div>
                    <span
                      className={cn(TYPO.amount, "shrink-0 truncate text-[13px]", OS.dangerAmount)}
                    >
                      {formatCurrency(row.balanceDue)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.04] dark:border-border/45">
                    <th className={cn(TYPO.tableHeader, "py-2 pl-4 pr-2 text-left")}>Project</th>
                    <th className={cn(TYPO.tableHeader, "py-2 pl-2 pr-4 text-right tabular-nums")}>
                      Due
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overduePreview.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-[13px] text-zinc-500">
                        No overdue invoices.
                      </td>
                    </tr>
                  ) : (
                    overduePreview.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-900/[0.04] dark:border-border/45"
                      >
                        <td className="py-2 pl-4 pr-2">
                          <Link
                            href={`/financial/invoices/${row.id}`}
                            className={cn(TYPO.primaryName, "hover:underline")}
                          >
                            {row.projectName || row.projectId || "—"}
                          </Link>
                        </td>
                        <td
                          className={cn(
                            TYPO.amount,
                            "py-2 pl-2 pr-4 text-right text-[13px]",
                            OS.dangerAmount
                          )}
                        >
                          {formatCurrency(row.balanceDue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DashSection>

        <DashSection
          className="lg:col-span-4"
          eyebrow="Labor"
          title="Labor cost"
          description="Current labor cost context from the existing dashboard feed."
          action={
            <Link href="/labor" className={linkGhost}>
              Labor OS
            </Link>
          }
        >
          <div className="px-3 py-4 sm:px-4">
            <div className="rounded-sm border border-slate-900/[0.045] bg-white/[0.58] px-3 py-3 dark:border-border/45 dark:bg-zinc-950/28">
              <p className={TYPO.kpiLabel}>Labor cost</p>
              <p className={cn(TYPO.kpiValue, "mt-2 text-[20px]", OS.dangerAmount)}>
                {formatCurrency(laborCostThisWeek)}
              </p>
              <p className={cn(TYPO.mutedText, "mt-2 text-[12px]")}>
                Shown from the same period used by the dashboard KPI.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-900/[0.04] pt-3 dark:border-border/45">
              <span className={cn(TYPO.mutedText, "text-[12px]")}>Expenses this month</span>
              <span className={cn(TYPO.amount, "text-[13px]", OS.dangerAmount)}>
                {formatCurrency(expensesThisMonth)}
              </span>
            </div>
          </div>
        </DashSection>

        <DashSection
          className="lg:col-span-4"
          eyebrow="Margin"
          title="Negative margin projects"
          description="Canonical margin below 0% — fix pricing or cost."
          action={
            <Link href="/projects" className={linkGhost}>
              Projects
            </Link>
          }
        >
          <div className="md:hidden">
            {negativeMarginRows.length === 0 ? (
              <p className={cn(TYPO.mutedText, "px-4 py-10 text-center text-[13px]")}>
                No negative-margin jobs.
              </p>
            ) : (
              <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
                {negativeMarginRows.slice(0, 6).map((p) => {
                  const risk = riskByProjectId.get(p.id) ?? "LOW";
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex min-h-[52px] items-center gap-3 px-3 py-3 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn(TYPO.primaryName, "truncate text-[14px]")}>{p.name}</p>
                        <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                          <RiskChip risk={risk} />
                        </p>
                      </div>
                      <span
                        className={cn(
                          TYPO.amount,
                          "shrink-0 tabular-nums text-[14px]",
                          OS.dangerAmount
                        )}
                      >
                        {fmtPct(p.marginPct)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.04] dark:border-border/45">
                    <th className={cn(TYPO.tableHeader, "py-2.5 pl-4 pr-2 text-left")}>Project</th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Margin
                    </th>
                    <th className={cn(TYPO.tableHeader, "py-2.5 pl-2 pr-4 text-left")}>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {negativeMarginRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[13px] text-zinc-500">
                        No negative-margin jobs.
                      </td>
                    </tr>
                  ) : (
                    negativeMarginRows.slice(0, 8).map((p) => {
                      const risk = riskByProjectId.get(p.id) ?? "LOW";
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-slate-900/[0.04] dark:border-border/45"
                        >
                          <td className="py-2 pl-4 pr-2">
                            <Link
                              href={`/projects/${p.id}`}
                              className={cn(TYPO.primaryName, "hover:underline")}
                            >
                              {p.name}
                            </Link>
                          </td>
                          <td
                            className={cn(
                              TYPO.amount,
                              "px-2 py-2 text-right text-[13px]",
                              OS.dangerAmount
                            )}
                          >
                            {fmtPct(p.marginPct)}
                          </td>
                          <td className="py-2 pl-2 pr-4">
                            <RiskChip risk={risk} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DashSection>

        {/* Cash flow first — full-width hero below KPIs */}
        <DashSection
          emphasize
          className="lg:col-span-12 ring-1 ring-[#081225]/[0.035] dark:ring-border/45"
          eyebrow="Cash position"
          title="Cash Flow Overview"
          description="Liquidity pulse vs operating pressure: use this with overdue AR, AP, and labor cost context."
          action={
            <Link href="/financial/invoices" className={linkGhost}>
              View ledger
            </Link>
          }
        >
          <div className="flex flex-col gap-4 px-3 py-4 max-md:gap-4 md:px-5 md:py-5 lg:flex-row lg:items-stretch lg:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-4 max-md:gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
                <div className="rounded-sm border border-slate-900/[0.045] bg-white/[0.65] px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-[8px] dark:border-border/45 dark:bg-zinc-950/28 sm:px-3.5 sm:py-3.5">
                  <p className={TYPO.kpiLabel}>Inflows</p>
                  <p
                    className={cn(
                      TYPO.kpiValue,
                      "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] sm:text-[18px] md:text-[19px] text-emerald-800/[0.88] dark:text-emerald-400/72"
                    )}
                  >
                    {formatCurrency(cashIn)}
                  </p>
                  <p
                    className={cn(
                      TYPO.kpiSubtitle,
                      "mt-1 text-[12px] font-normal text-zinc-500/88 dark:text-zinc-400/82"
                    )}
                  >
                    Recent credits
                  </p>
                </div>
                <div className="rounded-sm border border-slate-900/[0.045] bg-white/[0.65] px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-[8px] dark:border-border/45 dark:bg-zinc-950/28 sm:px-3.5 sm:py-3.5">
                  <p className={TYPO.kpiLabel}>Outflows</p>
                  <p
                    className={cn(
                      TYPO.kpiValue,
                      "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] sm:text-[18px] md:text-[19px] text-rose-600/[0.88] dark:text-rose-400/72"
                    )}
                  >
                    {formatCurrency(cashOut)}
                  </p>
                  <p
                    className={cn(
                      TYPO.kpiSubtitle,
                      "mt-1 text-[12px] font-normal text-zinc-500/88 dark:text-zinc-400/82"
                    )}
                  >
                    Recent debits
                  </p>
                </div>
                <div className="rounded-sm border border-slate-900/[0.045] bg-white/[0.65] px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-[8px] dark:border-border/45 dark:bg-zinc-950/28 sm:px-3.5 sm:py-3.5">
                  <p className={TYPO.kpiLabel}>Net (sample)</p>
                  <p
                    className={cn(
                      TYPO.kpiValue,
                      "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] sm:text-[18px] md:text-[19px]",
                      cashNet >= 0
                        ? "text-emerald-800/[0.88] dark:text-emerald-400/72"
                        : "text-rose-600/[0.88] dark:text-rose-400/72"
                    )}
                  >
                    {formatCurrency(cashNet)}
                  </p>
                  <p
                    className={cn(
                      TYPO.kpiSubtitle,
                      "mt-1 tabular-nums text-[12px] font-normal text-zinc-500/88 dark:text-zinc-400/82"
                    )}
                  >
                    {cashSlice.length} tx window
                  </p>
                </div>
              </div>

              <div className="min-h-[168px] max-md:min-h-[180px] md:min-h-[200px] lg:min-h-0 lg:flex-1">
                <p className={TYPO.sectionLabel}>Cash Pressure Timeline</p>
                <div className="mt-2">
                  <CashPressureTimelineChart series={cashPressureSeries} />
                </div>
              </div>
            </div>

            <div className="flex w-full min-w-0 shrink-0 flex-col justify-center gap-0 border-t border-slate-900/[0.04] px-0 pt-4 dark:border-border/45 max-md:pb-1 lg:w-60 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 xl:w-64">
              <p className={TYPO.sectionLabel}>Exposure stack</p>

              <div className="mt-3 border-b border-slate-900/[0.04] pb-3 dark:border-border/45">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                      Operating pressure
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Overdue bills + current labor cost context.
                    </p>
                  </div>
                  <span
                    className={cn(
                      TYPO.amount,
                      "shrink-0 break-words text-right text-[14px] tabular-nums sm:text-[15px] leading-none",
                      operatingPressure > 0.005
                        ? OS.dangerAmount
                        : "text-zinc-800 dark:text-zinc-200"
                    )}
                  >
                    {formatCurrency(operatingPressure)}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Cost context
              </p>
              <div className="mt-2 space-y-2.5">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className={cn(TYPO.mutedText, "min-w-0 shrink text-[12px]")}>
                    Labor (period)
                  </span>
                  <span
                    className={cn(
                      TYPO.amount,
                      "max-w-[55%] shrink-0 break-words text-right text-[12px] tabular-nums sm:text-[13px] text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    {formatCurrency(laborCostThisWeek)}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className={cn(TYPO.mutedText, "min-w-0 shrink text-[12px]")}>
                    Expenses (month)
                  </span>
                  <span
                    className={cn(
                      TYPO.amount,
                      "max-w-[55%] shrink-0 break-words text-right text-[12px] tabular-nums sm:text-[13px] text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    {formatCurrency(expensesThisMonth)}
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-900/[0.04] pt-3 dark:border-border/45">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                    Subcontract IOU
                  </span>
                  <span
                    className={cn(
                      TYPO.amount,
                      "max-w-[55%] shrink-0 break-words text-right text-[13px] tabular-nums sm:text-[14px]"
                    )}
                  >
                    {formatCurrency(subcontractOutstandingTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DashSection>

        {/* Financial + bills — secondary band under cash */}
        <DashSection
          className="lg:col-span-6"
          eyebrow="Portfolio"
          title="Financial Summary"
          description="Budget and earnings posture."
        >
          <div className="px-3 py-3 sm:px-4">
            <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
              {kpis.map((k) => (
                <div
                  key={k.key}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {k.icon ? (
                      <k.icon className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                    ) : null}
                    <span className="truncate">{k.label}</span>
                  </span>
                  <span className={cn(TYPO.amount, "shrink-0 truncate text-[14px]")}>
                    {k.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3 border-t border-slate-900/[0.04] pt-4 dark:border-border/45">
              <div className="flex items-center justify-between gap-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                <span>Budget usage</span>
                <span className={cn(TYPO.amount, "text-[14px]")}>{budgetUsagePct.toFixed(0)}%</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-slate-200/65 ring-1 ring-inset ring-slate-900/[0.04] dark:bg-zinc-800/75 dark:ring-white/[0.04]">
                <div
                  className="h-full rounded-full bg-zinc-800/80 transition-[width] duration-500 ease-out dark:bg-zinc-300/55"
                  style={{ width: `${Math.min(100, budgetUsagePct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">Total spent</span>
                <span className={cn(TYPO.amount, "truncate text-[14px]")}>
                  {formatCurrency(stats.totalSpent)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                <span>Total profit</span>
                <span
                  className={cn(
                    TYPO.amount,
                    "truncate text-[14px]",
                    !profitPositive ? OS.dangerAmount : OS.emeraldAccent
                  )}
                >
                  {formatCurrency(stats.totalProfit)}
                </span>
              </div>
            </div>
          </div>
        </DashSection>

        <DashSection
          className="lg:col-span-6"
          eyebrow="Payables"
          title="Bills Due"
          description="Outstanding, overdue, and due this week."
          action={
            <Link href="/bills" className={linkGhost}>
              View all
            </Link>
          }
        >
          <div className="space-y-0 px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/[0.04] py-3 dark:border-border/45">
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Outstanding</span>
              <span className={cn(TYPO.amount, "text-[14px]")}>
                {formatCurrency(apBillsSummary.totalOutstanding)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/[0.04] py-3 dark:border-border/45">
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Overdue</span>
              <span
                className={cn(
                  TYPO.amount,
                  "text-end text-[14px]",
                  apBillsSummary.overdueCount > 0 || apBillsSummary.overdueAmount > 0.005
                    ? OS.dangerAmount
                    : OS.neutralAmount
                )}
              >
                <span className="tabular-nums">{apBillsSummary.overdueCount}</span>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="tabular-nums">{formatCurrency(apBillsSummary.overdueAmount)}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Due this week</span>
              <span className={cn(TYPO.amount, "text-end text-[14px]")}>
                <span className="tabular-nums">{apBillsSummary.dueThisWeekCount}</span>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="tabular-nums">
                  {formatCurrency(apBillsSummary.dueThisWeekAmount)}
                </span>
              </span>
            </div>
            <div className="hidden border-t border-slate-900/[0.04] pt-3 dark:border-border/45 md:block">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full border-[#081225]/15 hover:bg-slate-50 dark:border-border"
              >
                <Link href="/bills/new">New bill</Link>
              </Button>
            </div>
          </div>
        </DashSection>

        {/* Recent Activity */}
        <DashSection
          className="lg:col-span-12"
          eyebrow="Reference"
          title="Recent ledger activity"
          description="Last few lines — full history stays in Financial."
          action={
            <Link href="/financial/invoices" className={linkGhost}>
              View all
            </Link>
          }
        >
          <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12">
                <p className={TYPO.mutedText}>No activity.</p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-4 min-h-[44px] w-full max-w-xs md:min-h-9"
                >
                  <Link href="/financial/invoices">View invoices</Link>
                </Button>
              </div>
            ) : (
              recentActivity.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="group flex min-h-[52px] items-center gap-3 px-3 py-2.5 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                >
                  <div
                    className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-slate-900/[0.04] bg-white/40 text-zinc-400/65 dark:border-border/35 dark:bg-zinc-900/35 dark:text-zinc-500/80 md:flex"
                    aria-hidden
                  >
                    <svg
                      width={13}
                      height={13}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className={cn(TYPO.primaryName, "truncate text-[14px] tracking-tight")}>
                        {tx.projectName}
                      </span>
                      <ActivityTypeChip type={tx.type} />
                    </div>
                    <p className="mt-0.5 truncate text-[13px] leading-snug text-zinc-500/85 dark:text-zinc-400/75">
                      {tx.description}
                    </p>
                  </div>
                  <div className="flex w-[6.5rem] shrink-0 flex-col items-end justify-center gap-0.5 tabular-nums sm:w-[7rem]">
                    <div className="text-[10px] font-normal uppercase tracking-[0.1em] text-zinc-400/75 dark:text-zinc-500/80">
                      {formatDate(tx.date, "compact")}
                    </div>
                    <div
                      className={cn(
                        TYPO.amount,
                        "text-[14px] font-semibold tracking-tight",
                        tx.amount < 0
                          ? "text-rose-600/[0.9] dark:text-rose-400/78"
                          : "text-emerald-800/[0.9] dark:text-emerald-400/75"
                      )}
                    >
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashSection>

        {/* Recent Projects */}
        <DashSection
          className="lg:col-span-8"
          eyebrow="Delivery"
          title="Project snapshot"
          description="Highest-signal portfolio rows (trimmed)."
          action={
            <Link href="/projects" className={linkGhost}>
              View all
            </Link>
          }
        >
          <div className="md:hidden">
            {projectRowsSnapshot.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12">
                <p className={TYPO.mutedText}>No projects yet.</p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-4 min-h-[44px] w-full max-w-xs md:min-h-9"
                >
                  <Link href="/projects/new">New project</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
                {projectRowsSnapshot.map((p) => {
                  const status = getHealthStatus(p.marginPct);
                  const risk = riskByProjectId.get(p.id) ?? "LOW";
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex min-h-[52px] items-center gap-3 px-3 py-3 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn(TYPO.primaryName, "truncate text-[14px]")}>{p.name}</p>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-zinc-500 tabular-nums dark:text-zinc-400">
                          <span>{fmtPct(p.marginPct)} margin</span>
                          <span className="text-zinc-300 dark:text-zinc-600">·</span>
                          <RiskChip risk={risk} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={cn(
                            TYPO.amount,
                            "max-w-[44vw] truncate text-[14px] font-semibold tracking-tight",
                            p.profit >= 0
                              ? "text-emerald-800/[0.88] dark:text-emerald-400/72"
                              : "text-rose-600/[0.88] dark:text-rose-400/72"
                          )}
                        >
                          {formatCurrency(p.profit)}
                        </span>
                        <StatusBadge label={status.label} variant={status.variant} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.04] dark:border-border/45">
                    <th className={cn(TYPO.tableHeader, "py-2.5 pl-4 pr-2 text-left")}>Project</th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Revenue
                    </th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Cost
                    </th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Profit
                    </th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Margin
                    </th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-left")}>Risk</th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-right tabular-nums")}>
                      Progress
                    </th>
                    <th className={cn(TYPO.tableHeader, "py-2.5 pl-2 pr-4 text-left")}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {projectRowsSnapshot.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[13px] text-zinc-500">
                        No projects yet.
                      </td>
                    </tr>
                  ) : (
                    projectRowsSnapshot.map((p) => {
                      const status = getHealthStatus(p.marginPct);
                      const risk = riskByProjectId.get(p.id) ?? "LOW";
                      const progressPct = p.budget > 0 ? (p.actual / p.budget) * 100 : 0;
                      const over = progressPct > 100;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-slate-900/[0.04] transition-colors duration-300 ease-out hover:bg-slate-50/65 dark:border-border/45 dark:hover:bg-zinc-900/20"
                        >
                          <td className="py-2.5 pl-4 pr-2">
                            <Link
                              href={`/projects/${p.id}`}
                              className={cn(TYPO.primaryName, "block truncate hover:underline")}
                            >
                              {p.name}
                            </Link>
                            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                              {risk === "HIGH" ? "At risk" : "Active"}
                            </p>
                          </td>
                          <td className={cn(TYPO.amount, "px-2 py-2.5 text-right text-[13px]")}>
                            {formatCurrency(p.revenue)}
                          </td>
                          <td className={cn(TYPO.amount, "px-2 py-2.5 text-right text-[13px]")}>
                            {formatCurrency(p.actual)}
                          </td>
                          <td
                            className={cn(
                              TYPO.amount,
                              "px-2 py-2.5 text-right text-[13px]",
                              p.profit >= 0
                                ? "text-emerald-800/[0.88] dark:text-emerald-400/72"
                                : "text-rose-600/[0.88] dark:text-rose-400/72"
                            )}
                          >
                            {formatCurrency(p.profit)}
                          </td>
                          <td className={cn(TYPO.amount, "px-2 py-2.5 text-right text-[13px]")}>
                            {fmtPct(p.marginPct)}
                          </td>
                          <td className="px-2 py-2.5">
                            <RiskChip risk={risk} />
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={cn(
                                  "text-[11px] tabular-nums",
                                  over ? OS.dangerAmount : "text-zinc-500 dark:text-zinc-400"
                                )}
                              >
                                {Number.isFinite(progressPct) ? fmtPct(progressPct) : "—"}
                              </span>
                              <div className="h-[3px] w-[6.5rem] overflow-hidden rounded-full bg-slate-200/55 ring-1 ring-inset ring-slate-900/[0.04] dark:bg-zinc-800/70 dark:ring-white/[0.04]">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-500 ease-out",
                                    over ? "bg-rose-500/75" : "bg-zinc-700/85 dark:bg-zinc-300/65"
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pl-2 pr-4">
                            <StatusBadge label={status.label} variant={status.variant} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DashSection>

        {/* Upcoming Tasks */}
        <DashSection
          className="lg:col-span-4"
          eyebrow="Priorities"
          title="Upcoming Tasks"
          description="Operational follow-ups from risk signals."
        >
          <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
            {upcomingTasks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className={TYPO.mutedText}>All clear — no operational follow-ups.</p>
              </div>
            ) : (
              upcomingTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex min-h-[52px] items-start justify-between gap-3 px-3 py-3 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/90"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className={cn(TYPO.primaryName, "text-[14px]")}>{t.title}</p>
                      <p className="mt-0.5 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                        {t.meta}
                      </p>
                    </div>
                  </div>
                  <TaskDueChip due={t.due} />
                </div>
              ))
            )}
          </div>
        </DashSection>

        {/* Outstanding Subcontracts */}
        <DashSection
          className="lg:col-span-12"
          eyebrow="Commitments"
          title="Outstanding Subcontracts"
          description={`${formatCurrency(subcontractOutstandingTotal)} open across ${outstandingSubcontracts.length} subcontract lines with balance.`}
          action={
            <Link href="/subcontractors" className={linkGhost}>
              View all
            </Link>
          }
        >
          <div className="md:hidden">
            {outstandingSubcontracts.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12">
                <p className={TYPO.mutedText}>No outstanding balances.</p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-4 min-h-[44px] w-full max-w-xs md:min-h-9"
                >
                  <Link href="/subcontractors">View subcontractors</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-900/[0.04] dark:divide-border/45">
                {outstandingSubcontracts.map((r) => (
                  <Link
                    key={r.id}
                    href={`/projects/${r.project_id}/subcontracts`}
                    className="flex min-h-[52px] items-center gap-3 px-3 py-3 sm:px-4 transition-colors duration-300 ease-out hover:bg-slate-50/60 dark:hover:bg-zinc-900/22"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn(TYPO.primaryName, "truncate text-[14px]")}>
                        {r.subcontractor_name}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                        {r.project_name}
                      </p>
                    </div>
                    <span className={cn(TYPO.amount, "shrink-0 text-[14px]", OS.dangerAmount)}>
                      {formatCurrency(r.balance)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-900/[0.04] dark:border-border/45">
                    <th className={cn(TYPO.tableHeader, "py-2.5 pl-4 pr-2 text-left")}>
                      Subcontractor
                    </th>
                    <th className={cn(TYPO.tableHeader, "px-2 py-2.5 text-left")}>Project</th>
                    <th
                      className={cn(TYPO.tableHeader, "py-2.5 pl-2 pr-4 text-right tabular-nums")}
                    >
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingSubcontracts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[13px] text-zinc-500">
                        No outstanding balances.
                      </td>
                    </tr>
                  ) : (
                    outstandingSubcontracts.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-900/[0.04] transition-colors duration-300 ease-out hover:bg-slate-50/65 dark:border-border/45 dark:hover:bg-zinc-900/20"
                      >
                        <td className={cn(TYPO.primaryName, "py-2.5 pl-4 pr-2 text-[13px]")}>
                          {r.subcontractor_name}
                        </td>
                        <td className="px-2 py-2.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                          <Link
                            href={`/projects/${r.project_id}/subcontracts`}
                            className="hover:underline"
                          >
                            {r.project_name}
                          </Link>
                        </td>
                        <td
                          className={cn(
                            TYPO.amount,
                            "py-2.5 pl-2 pr-4 text-right text-[13px]",
                            OS.dangerAmount
                          )}
                        >
                          {formatCurrency(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DashSection>
      </div>
    </>
  );
}
