/** Static dashboard title row — renders immediately with the route shell (no data). */
import { formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function DashboardPageHeader() {
  const chipDate = formatDate(new Date());

  return (
    <header
      data-neo-page-header="true"
      className="dashboard-command-hero relative isolate flex min-w-0 max-w-full shrink-0 flex-col gap-3 overflow-hidden rounded-2xl border px-4 py-4 max-md:gap-3 md:flex-row md:items-end md:justify-between md:gap-4 md:px-5 md:py-5"
    >
      <div className="min-w-0">
        <p className={cn(TYPO.sectionLabel, "text-[var(--neo-canvas-text-tertiary)]")}>
          HH · Command Center
        </p>
        <h1
          className={cn(
            TYPO.pageTitle,
            "mt-1 text-[26px] leading-tight text-[var(--neo-canvas-text-primary)] md:text-[33px]"
          )}
        >
          Executive Command Center
        </h1>
        <p
          className={cn(
            TYPO.pageSubtitle,
            "mt-2 max-w-[760px] text-pretty text-[var(--neo-canvas-text-secondary)] max-md:text-[14px]"
          )}
        >
          Liquidity, margin, payables, risk, and next actions in one operating view.
        </p>
      </div>
      <span
        className={cn(
          TYPO.date,
          "inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center self-start rounded-full border border-white/[0.1] bg-white/[0.04] px-4 text-[13px] font-medium tracking-normal text-[var(--neo-canvas-text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.045)_inset,0_14px_30px_rgba(0,0,0,0.24)] backdrop-blur-[14px] transition-[background,border-color,box-shadow] duration-150 hover:border-[rgb(184_147_90_/_0.26)] hover:bg-white/[0.045] max-md:w-full max-md:self-stretch md:h-9 md:w-auto md:min-h-0"
        )}
      >
        {chipDate}
      </span>
    </header>
  );
}
