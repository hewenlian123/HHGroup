import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  icon?: LucideIcon;
  emphasis?: boolean;
};

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.key}
            className={cn(
              "min-h-[116px] p-4 transition-colors duration-150 hover:bg-muted/20",
              item.emphasis && "border-zinc-300/70"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {item.label}
                </p>
                <p
                  className={cn(
                    "mt-2 text-3xl font-semibold leading-tight tabular-nums",
                    item.emphasis && "text-[32px]"
                  )}
                >
                  {item.value}
                </p>
              </div>
              {Icon ? (
                <div className="rounded-full border border-zinc-200/70 bg-zinc-100/70 p-2 dark:border-zinc-700 dark:bg-zinc-900/70">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}
    </section>
  );
}
