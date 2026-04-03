import { cn } from "@/lib/utils";

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

const statusStyles: Record<EstimateStatus, string> = {
  Draft:
    "inline-flex items-center rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#6B7280] dark:bg-muted dark:text-muted-foreground",
  Sent: "inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  Approved: "hh-pill-success text-[11px]",
  Rejected: "hh-pill-danger text-[11px]",
  Converted:
    "inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
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

  return <span className={cn(style, className)}>{text}</span>;
}
