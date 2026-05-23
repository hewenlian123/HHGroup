/** Static dashboard title row — renders immediately with the route shell (no data). */
import { formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPageHeader() {
  const chipDate = formatDate(new Date());

  return (
    <header
      data-neo-page-header="true"
      className="flex min-w-0 max-w-full shrink-0 flex-col gap-3 border-b border-white/10 pb-4 max-md:gap-3 md:flex-row md:items-center md:justify-between md:gap-4 md:pb-5"
    >
      <div className="min-w-0">
        <p className={cn(TYPO.sectionLabel, "text-[var(--neo-canvas-text-tertiary)]")}>
          HH · Command Center
        </p>
        <h1
          className={cn(
            TYPO.pageTitle,
            "text-[26px] leading-tight text-[var(--neo-canvas-text-primary)] md:text-[32px]"
          )}
        >
          {greeting()}
        </h1>
        <p
          className={cn(
            TYPO.pageSubtitle,
            "mt-1 line-clamp-4 text-pretty text-[var(--neo-canvas-text-secondary)] max-md:text-[14px]"
          )}
        >
          Risk, payables, and liquidity — not generic analytics.
        </p>
      </div>
      <span
        className={cn(
          TYPO.date,
          "inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center self-start rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] font-medium tracking-normal text-[var(--neo-canvas-text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur-[12px] max-md:w-full max-md:self-stretch md:h-9 md:w-auto md:min-h-0"
        )}
      >
        {chipDate}
      </span>
    </header>
  );
}
