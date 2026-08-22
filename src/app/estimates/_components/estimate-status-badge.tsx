import { cn } from "@/lib/utils";

export type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

const statusStyles: Record<EstimateStatus, string> = {
  Draft:
    "inline-flex items-center rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-2 py-0.5 text-hh-status text-[var(--hh-text-secondary)]",
  Sent: "hh-pill-warning inline-flex items-center rounded-hh-compact px-2 py-0.5 text-hh-status",
  Approved: "hh-pill-success text-hh-status",
  Rejected: "hh-pill-danger text-hh-status",
  Converted:
    "hh-pill-success inline-flex items-center rounded-hh-compact px-2 py-0.5 text-hh-status",
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
