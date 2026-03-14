"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

type TestRow = {
  test: string;
  status: "passed" | "warning" | "failed";
  executionTimeMs: number;
  message: string;
};

const TEST_OPTIONS: { id: string; label: string }[] = [
  { id: "labor_workflow", label: "Run Labor Workflow" },
  { id: "reimbursement_workflow", label: "Run Reimbursement Workflow" },
  { id: "worker_invoice_workflow", label: "Run Worker Invoice Workflow" },
  { id: "expense_workflow", label: "Run Expense Workflow" },
  { id: "invoice_payment_workflow", label: "Run Invoice Payment Workflow" },
];

function statusDisplay(status: TestRow["status"]) {
  switch (status) {
    case "passed":
      return <span className="text-emerald-600 dark:text-emerald-400">✅ Passed</span>;
    case "warning":
      return <span className="text-amber-600 dark:text-amber-400">⚠ Warning</span>;
    case "failed":
      return <span className="text-red-600 dark:text-red-400">❌ Failed</span>;
    default:
      return status;
  }
}

export default function SystemTestsPage() {
  const [tests, setTests] = React.useState<TestRow[]>([]);
  const [totalExecutionTimeMs, setTotalExecutionTimeMs] = React.useState<number | null>(null);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runTests = React.useCallback(async (only?: string) => {
    setRunning(true);
    setError(null);
    setTests([]);
    setTotalExecutionTimeMs(null);
    try {
      const res = await fetch("/api/test/run-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(only ? { only } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.tests)) {
        setTests(data.tests);
      }
      if (typeof data.totalExecutionTimeMs === "number") {
        setTotalExecutionTimeMs(data.totalExecutionTimeMs);
      }
      if (!res.ok) {
        setError(data.message ?? "Request failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Tests"
        description="Run automated workflow tests and view results."
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-4">
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          onClick={() => runTests()}
          disabled={running}
        >
          {running ? "Running…" : "Run All Tests"}
        </Button>
        {TEST_OPTIONS.map(({ id, label }) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0"
            onClick={() => runTests(id)}
            disabled={running}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {totalExecutionTimeMs != null && (
        <p className="text-xs text-muted-foreground">
          Total execution time: {totalExecutionTimeMs} ms
        </p>
      )}

      <div className="table-responsive border-b border-border/60">
        <table className="w-full text-sm min-w-[400px] sm:min-w-0">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Test</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Execution Time</th>
              <th className="py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 && !running ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  Click a button to run tests.
                </td>
              </tr>
            ) : (
              tests.map((row, i) => (
                <tr key={`${row.test}-${i}`} className="border-b border-border/30">
                  <td className="py-2 pr-4 font-medium">{row.test}</td>
                  <td className="py-2 pr-4">{statusDisplay(row.status)}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.executionTimeMs} ms</td>
                  <td className="py-2 text-muted-foreground max-w-[320px] truncate" title={row.message}>
                    {row.message || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
