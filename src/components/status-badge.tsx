import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; statusClassName?: string }> = {
  active: { label: "Active", variant: "outline", statusClassName: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70" },
  inactive: { label: "Inactive", variant: "outline", statusClassName: "bg-zinc-100 text-zinc-700 border-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700" },
  pending: { label: "Pending", variant: "outline", statusClassName: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/70" },
  completed: { label: "Completed", variant: "outline", statusClassName: "bg-zinc-100 text-zinc-700 border-zinc-200/70 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700" },
  paid: { label: "Paid", variant: "outline", statusClassName: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70" },
  Loss: { label: "Loss", variant: "outline", statusClassName: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/70" },
  "Over budget": { label: "Over budget", variant: "outline", statusClassName: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/70" },
  "At risk": { label: "At risk", variant: "outline", statusClassName: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/70" },
  "On track": { label: "On track", variant: "outline", statusClassName: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70" },
  "Negative Cash": { label: "Negative Cash", variant: "outline", statusClassName: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/70" },
  "Low Runway": { label: "Low Runway", variant: "outline", statusClassName: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/70" },
  "Healthy": { label: "Healthy", variant: "outline", statusClassName: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const config = statusMap[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={config.variant} className={cn("text-[11px] font-medium", config.statusClassName, className)}>
      {config.label}
    </Badge>
  );
}
