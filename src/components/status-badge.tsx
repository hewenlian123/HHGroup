import {
  StatusBadge as NeoStatusBadge,
  type StatusBadgeVariant,
} from "@/components/base/status-badge";

/** Normalize API / DB status strings for lookup (case-insensitive, spaces). */
function normStatus(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const statusMap: Record<string, { label: string; variant: StatusBadgeVariant }> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  "on hold": { label: "On Hold", variant: "muted" },
  inactive: { label: "Inactive", variant: "muted" },
  paid: { label: "Paid", variant: "success" },
  loss: { label: "Loss", variant: "danger" },
  "over budget": { label: "Over budget", variant: "danger" },
  "at risk": { label: "At risk", variant: "warning" },
  "on track": { label: "On track", variant: "success" },
  "negative cash": { label: "Negative Cash", variant: "danger" },
  "low runway": { label: "Low Runway", variant: "warning" },
  healthy: { label: "Healthy", variant: "success" },
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
      ? { label: raw.trim(), variant: "default" as const }
      : { label: "—", variant: "muted" as const });
  return <NeoStatusBadge label={config.label} variant={config.variant} className={className} />;
}
