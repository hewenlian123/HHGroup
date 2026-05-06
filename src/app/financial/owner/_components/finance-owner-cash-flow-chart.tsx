import { Activity } from "lucide-react";
import type { FinanceOwnerCashFlowPoint } from "@/lib/finance-owner-dashboard";
import { fmtUsdAxis, fmtUsdFull } from "../_lib/format-owner-currency";

/** Lightweight SVG dual-series chart — Stripe / equities-inspired density. */
export function FinanceOwnerCashFlowChart({ points }: { points: FinanceOwnerCashFlowPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200/90 bg-zinc-50/40 px-5 py-14 text-center transition-colors duration-200 ease-out dark:border-border/60 dark:bg-muted/15 max-md:px-4 max-md:py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-muted">
          <Activity className="h-6 w-6 text-zinc-400 dark:text-zinc-500" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-semibold text-foreground">No cash movement yet</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          When payments and expenses land in this six-month window, your inflows and outflows will
          plot here.
        </p>
      </div>
    );
  }

  const w = 760;
  const h = 308;
  const pad = { t: 36, r: 24, b: 44, l: 56 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const maxVal = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));

  const xs = points.map(
    (_, i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  );

  const yAt = (v: number) => pad.t + ih - (v / maxVal) * ih;

  const incomePts = points.map((p, i) => `${xs[i]},${yAt(p.income)}`).join(" ");
  const expensePts = points.map((p, i) => `${xs[i]},${yAt(p.expense)}`).join(" ");

  const baseY = pad.t + ih;
  const incomeArea = [
    `M ${xs[0]} ${baseY}`,
    `L ${xs[0]} ${yAt(points[0].income)}`,
    ...points.slice(1).map((p, i) => `L ${xs[i + 1]} ${yAt(p.income)}`),
    `L ${xs[xs.length - 1]} ${baseY}`,
    "Z",
  ].join(" ");

  const expenseArea = [
    `M ${xs[0]} ${baseY}`,
    `L ${xs[0]} ${yAt(points[0].expense)}`,
    ...points.slice(1).map((p, i) => `L ${xs[i + 1]} ${yAt(p.expense)}`),
    `L ${xs[xs.length - 1]} ${baseY}`,
    "Z",
  ].join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: pad.t + ih - t * ih,
    label: fmtUsdAxis(t * maxVal),
    full: fmtUsdFull(t * maxVal),
  }));

  return (
    <div className="w-full min-w-0">
      <div className="relative w-full min-h-[232px] sm:min-h-[268px]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full min-h-[inherit] text-foreground"
          role="img"
          aria-label="Cash in and cash out over the last six months"
        >
          <defs>
            <linearGradient id="ownerCfIncomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ownerCfExpenseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t, ti) => (
            <g key={`tick-${ti}`} className="text-muted-foreground">
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={t.y}
                y2={t.y}
                stroke="currentColor"
                strokeOpacity={0.035}
                strokeWidth={1}
              />
              <title>{t.full}</title>
              <text
                x={pad.l - 10}
                y={t.y + 3}
                textAnchor="end"
                fill="currentColor"
                className="tabular-nums text-[10px] font-normal tracking-tight"
              >
                {t.label}
              </text>
            </g>
          ))}

          <path d={incomeArea} fill="url(#ownerCfIncomeFill)" />
          <path d={expenseArea} fill="url(#ownerCfExpenseFill)" />

          <polyline
            fill="none"
            stroke="rgb(16 163 127)"
            strokeWidth={1.35}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={incomePts}
          />
          <polyline
            fill="none"
            stroke="rgb(220 80 70)"
            strokeWidth={1.35}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={expensePts}
          />

          {points.map((p, i) => (
            <g key={p.label} className="text-muted-foreground">
              <title>{`${p.label}: In ${fmtUsdFull(p.income)}, Out ${fmtUsdFull(p.expense)}`}</title>
              <text
                x={xs[i]}
                y={h - 14}
                textAnchor="middle"
                fill="currentColor"
                className="text-[10px] font-medium tracking-tight"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-zinc-100 pt-5 text-[11px] font-medium tracking-wide text-muted-foreground dark:border-border/40">
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full bg-[rgb(16_163_127)]" />
          Cash in
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full bg-[rgb(220_80_70)]" />
          Cash out
        </span>
      </div>
    </div>
  );
}
