import Link from "next/link";
import { Wallet } from "lucide-react";
import { fmtUsdAdaptive, fmtUsdFull } from "../_lib/format-owner-currency";

type Breakdown = {
  apOutstanding: number;
  workerOwed: number;
  approvedReimbursementsUnpaid: number;
};

/**
 * Compact donut + finance-style breakdown — display only; totals follow KPI.
 */
export function FinanceOwnerPendingDonut({
  total,
  breakdown,
}: {
  total: number;
  breakdown: Breakdown;
}) {
  const { apOutstanding, workerOwed, approvedReimbursementsUnpaid } = breakdown;
  const parts = [
    { key: "workers", label: "Workers", short: "Workers", value: workerOwed, color: "#a855f7" },
    {
      key: "reimb",
      label: "Approved reimb",
      short: "Reimb.",
      value: approvedReimbursementsUnpaid,
      color: "#3b82f6",
    },
    { key: "ap", label: "AP outstanding", short: "AP", value: apOutstanding, color: "#f97316" },
  ];
  const sumParts = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const denom = sumParts > 0 ? sumParts : 1;

  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const rOut = 58;
  const rIn = 40;

  let angle = -Math.PI / 2;
  const arcs: { d: string; color: string; key: string }[] = [];

  for (const p of parts) {
    const v = Math.max(0, p.value);
    const frac = v / denom;
    const sweep = frac * Math.PI * 2;
    const x1 = cx + rOut * Math.cos(angle);
    const y1 = cy + rOut * Math.sin(angle);
    const x2 = cx + rOut * Math.cos(angle + sweep);
    const y2 = cy + rOut * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d =
      sweep > 0.001
        ? `M ${cx + rIn * Math.cos(angle)} ${cy + rIn * Math.sin(angle)} L ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${cx + rIn * Math.cos(angle + sweep)} ${cy + rIn * Math.sin(angle + sweep)} A ${rIn} ${rIn} 0 ${large} 0 ${cx + rIn * Math.cos(angle)} ${cy + rIn * Math.sin(angle)} Z`
        : "";
    if (d) arcs.push({ d, color: p.color, key: p.key });
    angle += sweep;
  }

  const zeroTotal = Math.abs(total) < 0.005 && sumParts < 0.005;

  if (zeroTotal) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-4 py-10 text-center transition-colors duration-200 ease-out dark:border-border/60 dark:bg-muted/15 max-md:py-12">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 dark:bg-muted">
          <Wallet className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">Nothing pending</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Outstanding AP and worker balances will aggregate here when they&apos;re non-zero.
        </p>
        <Link
          href="/labor/worker-balances"
          className="mt-5 inline-flex min-h-[44px] items-center text-[11px] font-semibold text-primary hover:underline"
        >
          View balances
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative mx-auto shrink-0 sm:mx-0">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[112px] w-[112px]" aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={(rOut + rIn) / 2}
            fill="none"
            stroke="currentColor"
            className="text-zinc-200 dark:text-border/50"
            strokeWidth={rOut - rIn}
          />
          {arcs.map((a) => (
            <path key={a.key} d={a.d} fill={a.color} opacity={0.88} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            Total
          </p>
          <p
            className="mt-1 max-w-[92px] truncate text-sm font-semibold tracking-tight text-foreground tabular-nums"
            title={fmtUsdFull(total)}
          >
            {fmtUsdAdaptive(total)}
          </p>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {parts.map((p) => {
          const pct = sumParts > 0 ? Math.round((Math.max(0, p.value) / sumParts) * 100) : 0;
          return (
            <div
              key={p.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100/90 bg-zinc-50/50 px-3 py-2 transition-colors duration-200 ease-out hover:bg-zinc-100/60 dark:border-border/40 dark:bg-muted/20 dark:hover:bg-muted/35"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-medium text-foreground">{p.short}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{p.label}</p>
                </div>
              </div>
              <div className="shrink-0 text-right leading-tight">
                <p className="text-xs font-semibold tabular-nums" title={fmtUsdFull(p.value)}>
                  {fmtUsdAdaptive(p.value)}
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{pct}%</p>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end pt-1">
          <Link
            href="/labor/worker-balances"
            className="inline-flex min-h-[44px] items-center text-[11px] font-semibold text-primary hover:underline sm:min-h-0"
          >
            View details
          </Link>
        </div>
      </div>
    </div>
  );
}
