import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    <Card className={cn("min-h-[100px] p-[22px]", emphasis && "border-foreground/15", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold leading-tight tabular-nums text-foreground",
              emphasis && "text-3xl"
            )}
          >
            {value}
          </p>
        </div>
        {Icon ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
