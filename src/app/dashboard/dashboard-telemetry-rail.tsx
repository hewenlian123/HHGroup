import { cn } from "@/lib/utils";

type RailTone = "copper" | "emerald" | "alert";

const railToneClass: Record<RailTone, string> = {
  copper: "dashboard-telemetry-rail--copper",
  emerald: "dashboard-telemetry-rail--emerald",
  alert: "dashboard-telemetry-rail--alert",
};

export function DashboardTelemetryRail({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    progress: number;
    tone: RailTone;
  }>;
}) {
  return (
    <section className="dashboard-telemetry-shell relative min-w-0 rounded-xl p-4 md:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[var(--hud-muted)]">
        Live telemetry
      </p>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 2xl:grid-cols-3">
        {items.map((item, index) => {
          const progress = Math.max(2, Math.min(100, Math.round(item.progress)));
          return (
            <div
              key={item.label}
              className={cn(
                "dashboard-telemetry-rail min-w-0 rounded-lg px-4 py-3",
                railToneClass[item.tone]
              )}
              style={{ animationDelay: `${index * 130}ms` }}
            >
              <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-wrap text-[11px] font-semibold uppercase leading-tight tracking-normal text-[var(--hud-muted)]">
                    {item.label}
                  </p>
                  <p className="mt-2 whitespace-nowrap text-[22px] font-semibold leading-none tracking-normal text-[var(--hud-text)] tabular-nums">
                    {item.value}
                  </p>
                </div>
                <div className="relative h-1.5 w-[44%] min-w-[7rem] overflow-hidden rounded-full bg-[var(--hud-track)]">
                  <div
                    className="dashboard-telemetry-fill h-full rounded-full bg-[var(--hud-accent)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
