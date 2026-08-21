import { type LucideIcon } from "lucide-react";

import { Kpi } from "@/components/ui/kpi";
import { OS } from "@/lib/typography";

/** Compatibility wrapper for the former KPI card name. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <Kpi
      label={label}
      value={value}
      emphasis={emphasis}
      className={className}
      icon={
        Icon ? (
          <div className={OS.iconWell}>
            <Icon className="h-4 w-4" />
          </div>
        ) : undefined
      }
    />
  );
}
