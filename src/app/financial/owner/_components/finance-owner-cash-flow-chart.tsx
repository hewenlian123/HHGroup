import type { FinanceOwnerCashFlowPoint } from "@/lib/finance-owner-dashboard";

function fmtCompactUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** Lightweight SVG dual-series chart — Stripe / equities-inspired density. */
export function FinanceOwnerCashFlowChart({ points }: { points: FinanceOwnerCashFlowPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No cash flow data for this window.
      </p>
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
    label: fmtCompactUsd(t * maxVal),
  }));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto min-h-[260px] w-full max-w-full text-foreground"
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

        {ticks.map((t) => (
          <g key={t.label} className="text-muted-foreground">
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={0.035}
              strokeWidth={1}
            />
            <text
              x={pad.l - 10}
              y={t.y + 3}
              textAnchor="end"
              fill="currentColor"
              className="text-[10px] font-normal tracking-tight"
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
          <g key={p.label}>
            <g className="text-muted-foreground">
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
          </g>
        ))}
      </svg>
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
