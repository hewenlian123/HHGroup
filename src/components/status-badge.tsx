import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusMap: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    statusClassName?: string;
  }
> = {
  active: {
    label: "Active",
    variant: "outline",
    statusClassName: "bg-gray-100 text-gray-700 border-gray-200",
  },
  inactive: {
    label: "Inactive",
    variant: "outline",
    statusClassName: "bg-gray-50 text-gray-600 border-gray-200",
  },
  pending: {
    label: "Pending",
    variant: "outline",
    statusClassName: "bg-amber-50 text-amber-700 border-amber-200",
  },
  completed: {
    label: "Completed",
    variant: "outline",
    statusClassName: "bg-gray-100 text-gray-700 border-gray-200",
  },
  paid: {
    label: "Paid",
    variant: "outline",
    statusClassName: "bg-green-50 text-green-700 border-green-200",
  },
  Loss: {
    label: "Loss",
    variant: "outline",
    statusClassName: "bg-red-50 text-red-700 border-red-200",
  },
  "Over budget": {
    label: "Over budget",
    variant: "outline",
    statusClassName: "bg-red-50 text-red-700 border-red-200",
  },
  "At risk": {
    label: "At risk",
    variant: "outline",
    statusClassName: "bg-amber-50 text-amber-700 border-amber-200",
  },
  "On track": {
    label: "On track",
    variant: "outline",
    statusClassName: "bg-green-50 text-green-700 border-green-200",
  },
  "Negative Cash": {
    label: "Negative Cash",
    variant: "outline",
    statusClassName: "bg-red-50 text-red-700 border-red-200",
  },
  "Low Runway": {
    label: "Low Runway",
    variant: "outline",
    statusClassName: "bg-amber-50 text-amber-700 border-amber-200",
  },
  Healthy: {
    label: "Healthy",
    variant: "outline",
    statusClassName: "bg-green-50 text-green-700 border-green-200",
  },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusMap[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge
      variant={config.variant}
      className={cn(
        "text-xs font-medium px-2 py-0.5 rounded-full",
        config.statusClassName,
        className
      )}
    >
      {config.label}
    </Badge>
  );
}
