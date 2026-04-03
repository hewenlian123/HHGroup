import { cn } from "@/lib/utils";

/** Normalize API / DB status strings for lookup (case-insensitive, spaces). */
function normStatus(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const statusMap: Record<string, { label: string; pillClass: string }> = {
  active: { label: "Active", pillClass: "hh-pill-success" },
  pending: { label: "Pending", pillClass: "hh-pill-warning" },
  completed: { label: "Completed", pillClass: "hh-pill-success" },
  "on hold": { label: "On Hold", pillClass: "hh-pill-neutral" },
  inactive: { label: "Inactive", pillClass: "hh-pill-neutral" },
  paid: { label: "Paid", pillClass: "hh-pill-success" },
  loss: { label: "Loss", pillClass: "hh-pill-danger" },
  "over budget": { label: "Over budget", pillClass: "hh-pill-danger" },
  "at risk": { label: "At risk", pillClass: "hh-pill-warning" },
  "on track": { label: "On track", pillClass: "hh-pill-success" },
  "negative cash": { label: "Negative Cash", pillClass: "hh-pill-danger" },
  "low runway": { label: "Low Runway", pillClass: "hh-pill-warning" },
  healthy: { label: "Healthy", pillClass: "hh-pill-success" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const raw = status ?? "";
  const key = normStatus(raw);
  const config =
    statusMap[key] ??
    (raw.trim()
      ? { label: raw.trim(), pillClass: "hh-pill-neutral" as const }
      : { label: "—", pillClass: "hh-pill-neutral" as const });
  return <span className={cn(config.pillClass, className)}>{config.label}</span>;
}
