import { KpiTile } from "@/components/base";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";

type ApBillsSummaryKpi = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
};

const dashboardKpiTileClass =
  "max-md:w-[min(100%,calc(100vw-2.5rem))] max-md:min-w-[min(100%,calc(100vw-2.5rem))] max-md:max-w-[calc(100vw-2.5rem)] max-md:min-h-[118px] max-md:snap-start max-md:snap-always";

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
      <KpiTile
        className={dashboardKpiTileClass}
        label="Overdue invoices"
        value={formatCurrency(overdueTotal)}
        meta={`${overdueInvoices.length} open`}
        tone={overdueTotal > 0.005 ? "negative" : "neutral"}
      />

      <KpiTile
        className={dashboardKpiTileClass}
        label="Unpaid bills (AP)"
        value={formatCurrency(apBillsSummary.totalOutstanding)}
        meta={
          <>
            <span className="block sm:inline">{apBillsSummary.overdueCount} overdue</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{formatCurrency(apBillsSummary.overdueAmount)}</span>
          </>
        }
      />

      <KpiTile
        className={dashboardKpiTileClass}
        label="Labor cost"
        value={formatCurrency(laborCostThisWeek)}
        meta="Current period"
        tone={laborCostThisWeek > 0.005 ? "negative" : "neutral"}
      />

      <KpiTile
        className={dashboardKpiTileClass}
        label="Negative margin"
        value={negativeMarginCount}
        meta="Projects below 0% margin"
        tone={negativeMarginCount > 0 ? "negative" : "positive"}
      />

      <KpiTile
        className={dashboardKpiTileClass}
        label="Risk signals"
        value={operationalRiskCount}
        meta="High / budget / labor / runway"
        tone={operationalRiskCount > 0 ? "warning" : "positive"}
      />

      <KpiTile
        className={dashboardKpiTileClass}
        label="Ledger window net"
        value={formatCurrency(ledgerNet)}
        meta="Recent transactions"
        tone={ledgerTone === "income" ? "positive" : "negative"}
      />
    </div>
  );
}
