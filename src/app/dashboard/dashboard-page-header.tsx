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
    <header className="flex min-w-0 max-w-full shrink-0 flex-col gap-3 border-b border-slate-900/[0.04] pb-4 max-md:gap-3 md:flex-row md:items-center md:justify-between md:gap-4 md:pb-5 dark:border-border/45">
      <div className="min-w-0">
        <p className={TYPO.sectionLabel}>HH · Command Center</p>
        <h1 className={cn(TYPO.pageTitle, "text-[26px] leading-tight md:text-[32px]")}>
          {greeting()}
        </h1>
        <p className={cn(TYPO.pageSubtitle, "mt-1 text-pretty line-clamp-4 max-md:text-[14px]")}>
          Risk, payables, and liquidity — not generic analytics.
        </p>
      </div>
      <span
        className={cn(
          TYPO.date,
          "inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center self-start rounded-full border border-slate-900/[0.06] bg-white/[0.78] px-4 text-[13px] font-medium tracking-tight text-[#081225] shadow-[0_1px_0_rgba(15,23,42,0.03),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[8px] max-md:w-full max-md:self-stretch md:h-9 md:w-auto md:min-h-0 dark:border-border/50 dark:bg-zinc-950/35 dark:text-zinc-50 dark:shadow-[0_1px_0_rgba(0,0,0,0.15)]"
        )}
      >
        {chipDate}
      </span>
    </header>
  );
}
