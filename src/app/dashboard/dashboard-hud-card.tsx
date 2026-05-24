import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HudTone = "copper" | "emerald" | "steel" | "alert";

const toneClass: Record<HudTone, string> = {
  copper: "dashboard-hud-card--copper",
  emerald: "dashboard-hud-card--emerald",
  steel: "dashboard-hud-card--steel",
  alert: "dashboard-hud-card--alert",
};

const sparkHeights = [8, 16, 21, 18, 13, 4, 10, 19, 24, 14, 11, 6, 16, 20, 17, 12];

export function DashboardHudCard({
  label,
  value,
  meta,
  tone = "copper",
  delay = 0,
  hasSignal = true,
  className,
}: {
  label: string;
  value: ReactNode;
  meta: ReactNode;
  tone?: HudTone;
  delay?: number;
  hasSignal?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "dashboard-hud-card group relative min-w-0 overflow-hidden rounded-xl px-4 py-4",
        toneClass[tone],
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="dashboard-hud-corner dashboard-hud-corner--tl" aria-hidden />
      <span className="dashboard-hud-corner dashboard-hud-corner--tr" aria-hidden />
      <p className="text-[10px] font-semibold uppercase leading-none tracking-normal text-[var(--hud-muted)]">
        {label}
      </p>
      <div className="mt-3 truncate text-[23px] font-semibold leading-none tracking-normal text-[var(--hud-text)] tabular-nums md:text-[28px]">
        {value}
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2rem] text-[12px] leading-snug text-[var(--hud-muted)]">
        {meta}
      </p>
      <div className="mt-4 flex h-6 items-end gap-1" aria-hidden>
        {sparkHeights.map((height, index) => (
          <span
            key={`${label}-${index}`}
            className={cn(
              "w-1 rounded-full bg-[var(--hud-spark-muted)]",
              hasSignal && index % 6 === 0 && "bg-[var(--hud-accent)]"
            )}
            style={{ height }}
          />
        ))}
      </div>
    </article>
  );
}
