import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { OS, TYPO } from "@/lib/typography";

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
    <Card className={cn("min-h-[108px] p-5", emphasis && "border-emerald-500/20", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={TYPO.kpiLabel}>{label}</p>
          <p className={cn("mt-2 text-2xl leading-tight", TYPO.kpiValue, emphasis && "text-3xl")}>
            {value}
          </p>
        </div>
        {Icon ? (
          <div className={OS.iconWell}>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
