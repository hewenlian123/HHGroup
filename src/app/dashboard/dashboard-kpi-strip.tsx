import { formatCurrency } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";

type ApBillsSummaryKpi = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
};

const kpiCard =
  "relative flex min-h-[108px] flex-col overflow-hidden rounded-sm border border-slate-900/[0.045] bg-white/[0.72] px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[10px] transition-[box-shadow,transform] duration-300 ease-out dark:border-border/50 dark:bg-zinc-950/32 dark:shadow-[0_1px_0_rgba(0,0,0,0.18)] max-md:min-h-[118px] md:px-3.5 md:py-3.5";

/** Decorative ambient line only — not a data series. */
function KpiAmbientSparkline() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[12px] w-full text-zinc-400/55 dark:text-zinc-500/45"
      viewBox="0 0 120 12"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 9 Q 18 3 36 7.5 T 72 6.5 T 108 5 T 120 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.55"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

const kpiValueMutedEmerald = "text-emerald-800/[0.92] dark:text-emerald-400/78";
const kpiValueMutedRose = "text-rose-600/[0.9] dark:text-rose-400/78";
const kpiValueMutedLedgerPos = "text-emerald-800/[0.9] dark:text-emerald-400/75";
const kpiValueMutedLedgerNeg = "text-rose-600/[0.9] dark:text-rose-400/78";

/** Command-center KPIs: collections, payables, labor, margin stress, risk flags, ledger pulse. */
export function DashboardKpiStrip({
  overdueInvoices,
  apBillsSummary,
  laborCostThisWeek,
  negativeMarginCount,
  operationalRiskCount,
  ledgerNet,
}: {
  overdueInvoices: OverdueInvoiceRow[];
  apBillsSummary: ApBillsSummaryKpi;
  laborCostThisWeek: number;
  negativeMarginCount: number;
  operationalRiskCount: number;
  ledgerNet: number;
}) {
  const overdueTotal = overdueInvoices.reduce((s, i) => s + (i.balanceDue ?? 0), 0);
  const ledgerTone = ledgerNet >= 0 ? ("income" as const) : ("expense" as const);

  return (
    <div
      data-dashboard-kpi-strip
      className={cn(
        "min-w-0 max-w-full",
        "max-md:-mx-1 max-md:px-1",
        "max-md:flex max-md:snap-x max-md:snap-mandatory max-md:gap-3 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:pb-2 max-md:pt-1",
        "max-md:[-webkit-overflow-scrolling:touch] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden",
        "touch-auto overscroll-x-contain",
        "md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-6"
      )}
    >
      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Overdue invoices</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]",
            overdueTotal > 0.005 ? kpiValueMutedRose : undefined
          )}
        >
          {formatCurrency(overdueTotal)}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal tabular-nums text-zinc-500/90 dark:text-zinc-400/85"
          )}
        >
          {overdueInvoices.length} open
        </p>
      </div>

      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Unpaid bills (AP)</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]"
          )}
        >
          {formatCurrency(apBillsSummary.totalOutstanding)}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal tabular-nums text-zinc-500/90 dark:text-zinc-400/85 max-md:text-[11px] max-md:leading-snug"
          )}
        >
          <span className="block sm:inline">{apBillsSummary.overdueCount} overdue</span>
          <span className="hidden sm:inline"> · </span>
          <span className="block sm:inline">{formatCurrency(apBillsSummary.overdueAmount)}</span>
        </p>
      </div>

      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Labor cost</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]",
            laborCostThisWeek > 0.005 ? kpiValueMutedRose : undefined
          )}
        >
          {formatCurrency(laborCostThisWeek)}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal tabular-nums text-zinc-500/90 dark:text-zinc-400/85"
          )}
        >
          Current period
        </p>
      </div>

      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Negative margin</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]",
            negativeMarginCount > 0 ? kpiValueMutedRose : kpiValueMutedEmerald
          )}
        >
          {negativeMarginCount}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal text-zinc-500/90 dark:text-zinc-400/85"
          )}
        >
          Projects below 0% margin
        </p>
      </div>

      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Risk signals</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]",
            operationalRiskCount > 0
              ? "text-amber-800/[0.92] dark:text-amber-400/72"
              : kpiValueMutedEmerald
          )}
        >
          {operationalRiskCount}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal text-zinc-500/90 dark:text-zinc-400/85"
          )}
        >
          High / budget / labor / runway
        </p>
      </div>

      <div
        className={cn(
          kpiCard,
          "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:snap-start max-md:snap-always",
          "hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)] motion-safe:hover:-translate-y-px dark:hover:shadow-[0_1px_0_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.14)]"
        )}
      >
        <KpiAmbientSparkline />
        <p className={TYPO.kpiLabel}>Ledger window net</p>
        <p
          className={cn(
            TYPO.kpiValue,
            "mt-2 break-words text-[17px] tabular-nums tracking-[-0.02em] md:text-[18px]",
            ledgerTone === "income" && kpiValueMutedLedgerPos,
            ledgerTone === "expense" && kpiValueMutedLedgerNeg
          )}
        >
          {formatCurrency(ledgerNet)}
        </p>
        <p
          className={cn(
            TYPO.kpiSubtitle,
            "mt-auto pt-1 text-[12px] font-normal text-zinc-500/90 dark:text-zinc-400/85"
          )}
        >
          Recent transactions
        </p>
      </div>
    </div>
  );
}
