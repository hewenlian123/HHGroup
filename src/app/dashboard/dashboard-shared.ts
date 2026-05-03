import { cn } from "@/lib/utils";

export function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

export function getHealthStatus(marginPct: number): {
  label: string;
  variant: "success" | "warning" | "danger" | "muted";
} {
  if (marginPct > 25) return { label: "Excellent", variant: "success" };
  if (marginPct >= 15) return { label: "Good", variant: "success" };
  if (marginPct >= 5) return { label: "Warning", variant: "warning" };
  return { label: "Risk", variant: "danger" };
}

export const dashboardSectionShell = cn(
  "max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:border-b max-md:border-border/50 max-md:bg-transparent max-md:pb-3 max-md:shadow-none",
  "md:overflow-hidden md:rounded-xl md:border md:border-gray-100 md:bg-white md:pb-0 md:shadow-sm dark:md:border-border dark:md:bg-card md:dark:shadow-none"
);
