"use client";

import * as React from "react";
import type {
  ProjectFinancialSnapshot,
  ProjectFinancialSnapshotDiagnostics,
  ProjectFinancialWarning,
} from "@/lib/financial/project-financial-snapshot";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

type OldCanonicalProfit = {
  actualCost?: number | null;
};

type OldProjectCostDashboard = {
  spentTotal?: number | null;
};

type ProjectFinancialSnapshotComparisonView = {
  oldCanonicalProfit: OldCanonicalProfit | null;
  oldProjectCostDashboard: OldProjectCostDashboard | null;
  newSnapshot: ProjectFinancialSnapshot;
  warnings?: ProjectFinancialWarning[];
  diagnostics?: ProjectFinancialSnapshotDiagnostics;
};

type SnapshotComparisonResponse =
  | { ok: true; comparison: ProjectFinancialSnapshotComparisonView }
  | { ok: false; message?: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; comparison: ProjectFinancialSnapshotComparisonView };

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return moneyFormatter.format(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function ComparisonMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className={cn(OS.card, "px-3 py-2")}>
      <p className={cn(TYPO.kpiLabel, "text-[10px]")}>{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-[13px] font-semibold tabular-nums text-[var(--neo-text-primary)]",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-rose-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ProjectFinancialSnapshotComparisonPanel({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadComparison() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/projects/${projectId}/financial-snapshot`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as SnapshotComparisonResponse | null;
        if (!response.ok || !body?.ok) {
          throw new Error("Financial snapshot comparison unavailable.");
        }
        setState({ status: "ready", comparison: body.comparison });
      } catch {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: "Financial snapshot comparison unavailable.",
        });
      }
    }

    void loadComparison();

    return () => controller.abort();
  }, [projectId]);

  let body: React.ReactNode;

  if (state.status === "loading") {
    body = <p className="mt-3 text-sm text-[var(--neo-text-secondary)]">Loading comparison…</p>;
  } else if (state.status === "error") {
    body = (
      <p className="mt-3 rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.12)] px-3 py-2 text-sm font-medium text-[var(--neo-gold-soft)]">
        {state.message || "Financial snapshot comparison unavailable."}
      </p>
    );
  } else {
    const comparison = state.comparison;
    const currentUiActualCost = comparison.oldProjectCostDashboard?.spentTotal ?? null;
    const oldCanonicalActualCost = comparison.oldCanonicalProfit?.actualCost ?? null;
    const snapshot = comparison.newSnapshot;
    const difference =
      currentUiActualCost == null ? null : roundMoney(snapshot.actualCost - currentUiActualCost);
    const warnings = comparison.warnings ?? snapshot.warnings ?? [];
    const diagnostics = comparison.diagnostics ?? snapshot.diagnostics ?? null;

    body = (
      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ComparisonMetric
            label="Current UI actual cost"
            value={formatMoney(currentUiActualCost)}
          />
          <ComparisonMetric
            label="Old canonical actual cost"
            value={formatMoney(oldCanonicalActualCost)}
          />
          <ComparisonMetric
            label="New snapshot actual cost"
            value={formatMoney(snapshot.actualCost)}
          />
          <ComparisonMetric
            label="Difference"
            value={formatMoney(difference)}
            tone={difference != null && difference < 0 ? "positive" : "negative"}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ComparisonMetric
            label="New snapshot laborCost"
            value={formatMoney(snapshot.laborCost)}
          />
          <ComparisonMetric
            label="New snapshot expenseCost"
            value={formatMoney(snapshot.expenseCost)}
          />
          <ComparisonMetric
            label="New snapshot reimbursementCost"
            value={formatMoney(snapshot.reimbursementCost)}
          />
          <ComparisonMetric
            label="New snapshot billedAmount"
            value={formatMoney(snapshot.billedAmount)}
          />
          <ComparisonMetric
            label="New snapshot paidAmount"
            value={formatMoney(snapshot.paidAmount)}
          />
          <ComparisonMetric label="New snapshot openAR" value={formatMoney(snapshot.openAR)} />
        </div>

        {diagnostics &&
        (diagnostics.pendingExpenseCost > 0 ||
          diagnostics.pendingReimbursementCost > 0 ||
          diagnostics.committedReimbursementCost > 0) ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ComparisonMetric
              label="Pending expense review"
              value={`${formatMoney(diagnostics.pendingExpenseCost)} · ${diagnostics.pendingExpenseCount}`}
            />
            <ComparisonMetric
              label="Pending reimbursement review"
              value={`${formatMoney(diagnostics.pendingReimbursementCost)} · ${diagnostics.pendingReimbursementCount}`}
            />
            <ComparisonMetric
              label="Committed reimbursements"
              value={`${formatMoney(diagnostics.committedReimbursementCost)} · ${diagnostics.committedReimbursementCount}`}
            />
          </div>
        ) : null}

        {diagnostics ? (
          <p className="text-xs text-[var(--neo-text-secondary)]">
            Diagnostics: expense lines {diagnostics.expenseLinesLoaded}, header fallbacks{" "}
            {diagnostics.expenseHeaderFallbackCount}, approved change orders{" "}
            {diagnostics.approvedChangeOrdersCount}, reimbursement dedupes{" "}
            {diagnostics.reimbursementDedupedCount}, pending review costs{" "}
            {formatMoney(diagnostics.pendingExpenseCost + diagnostics.pendingReimbursementCost)}
          </p>
        ) : null}

        <div>
          <p className={cn(TYPO.kpiLabel, "text-[10px]")}>Warnings</p>
          {warnings.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--neo-text-secondary)]">No comparison warnings.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-[var(--neo-text-secondary)]">
              {warnings.slice(0, 6).map((warning, index) => (
                <li key={`${warning.code}-${index}`}>
                  <span className="font-medium text-[var(--neo-text-primary)]">{warning.code}</span>
                  : {warning.message}
                </li>
              ))}
              {warnings.length > 6 ? (
                <li>{warnings.length - 6} additional warning(s) hidden.</li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <details
      open
      className="rounded-xl border border-dashed border-[var(--neo-border-strong)] bg-[var(--neo-surface-muted)] p-3 text-sm text-[var(--neo-text-primary)]"
    >
      <summary className="cursor-pointer list-none">
        <span className="font-medium text-[var(--neo-text-primary)]">
          Financial Snapshot Comparison
        </span>
        <span className="ml-2 rounded-full border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
          Internal comparison only
        </span>
      </summary>
      {body}
    </details>
  );
}
