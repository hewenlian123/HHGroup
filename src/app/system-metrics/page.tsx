"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";

type Metrics = {
  projects: number;
  workers: number;
  labor_entries: number;
  reimbursements: number;
  expenses: number;
  invoices: number;
  worker_payments: number;
};

const METRIC_ITEMS: { key: keyof Metrics; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "workers", label: "Workers" },
  { key: "labor_entries", label: "Labor Entries" },
  { key: "reimbursements", label: "Reimbursements" },
  { key: "expenses", label: "Expenses" },
  { key: "invoices", label: "Invoices" },
  { key: "worker_payments", label: "Payments" },
];

export default function SystemMetricsPage() {
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/system-metrics")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setMetrics({
            projects: Number(data.projects) || 0,
            workers: Number(data.workers) || 0,
            labor_entries: Number(data.labor_entries) || 0,
            reimbursements: Number(data.reimbursements) || 0,
            expenses: Number(data.expenses) || 0,
            invoices: Number(data.invoices) || 0,
            worker_payments: Number(data.worker_payments) || 0,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Metrics"
        description="Database row counts for core tables."
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {METRIC_ITEMS.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-sm border border-border/60 px-4 py-4 w-full"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {metrics?.[key] ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
