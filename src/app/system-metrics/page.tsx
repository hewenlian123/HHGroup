"use client";

import * as React from "react";
import { KpiTile, NeoPanel, PageHeader, PageLayout } from "@/components/base";

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
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageLayout
      header={
        <PageHeader title="System Metrics" description="Database row counts for core tables." />
      }
    >
      {error ? (
        <NeoPanel bodyClassName="px-4 py-3">
          <p className="text-hh-body font-medium text-[var(--hh-danger)]">{error}</p>
        </NeoPanel>
      ) : null}

      <NeoPanel
        eyebrow="System counts"
        title="Core table inventory"
        description="Live row counts for operational modules."
        bodyClassName="p-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_ITEMS.map(({ key, label }) => (
            <KpiTile
              key={key}
              label={label}
              value={
                loading ? (
                  <span className="block h-7 w-16 animate-pulse motion-reduce:animate-none rounded-hh-compact bg-[var(--hh-l2-operational-surface)]" />
                ) : (
                  <span>{(metrics?.[key] ?? 0).toLocaleString("en-US")}</span>
                )
              }
              meta="Rows tracked"
              className="min-h-[108px]"
            />
          ))}
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
