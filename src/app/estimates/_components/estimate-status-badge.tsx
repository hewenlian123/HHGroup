import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

const statusStyles: Record<EstimateStatus, string> = {
  Draft:
    "border-transparent bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sent:
    "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  Approved:
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  Rejected:
    "border-transparent bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  Converted:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
};

export function EstimateStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const s = status as EstimateStatus;
  const style = statusStyles[s] ?? statusStyles.Draft;
  const text = label ?? (status === "Converted" ? "Converted to Project" : status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] font-medium border-transparent",
        style,
        className
      )}
    >
      {text}
    </Badge>
  );
}
