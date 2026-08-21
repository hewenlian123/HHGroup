import { type LucideIcon } from "lucide-react";

import { Kpi } from "@/components/ui/kpi";
import { OS } from "@/lib/typography";

export type KpiItem = {
  key: string;
  label: string;
  value: string;
  icon?: LucideIcon;
  emphasis?: boolean;
};

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <section className="grid gap-hh-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Kpi
            key={item.key}
            label={item.label}
            value={item.value}
            emphasis={item.emphasis}
            icon={
              Icon ? (
                <div className={OS.iconWell}>
                  <Icon className="h-4 w-4" />
                </div>
              ) : undefined
            }
          />
        );
      })}
    </section>
  );
}
