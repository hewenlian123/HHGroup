"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

/** Shape returned by /api/test/run-all */
type TestRow = {
  test: string;
  status: "passed" | "warning" | "failed";
  executionTimeMs: number;
  message: string;
};

/** Shape returned by /api/test/run-all-tests */
type RunAllGroup = {
  name: string;
  ok: boolean;
  executionTimeMs: number;
  error?: string;
  details?: unknown;
};

const WORKFLOW_OPTIONS: { id: string; label: string }[] = [
  { id: "labor_workflow", label: "Labor Workflow" },
  { id: "reimbursement_workflow", label: "Reimbursement Workflow" },
  { id: "worker_invoice_workflow", label: "Worker Invoice Workflow" },
  { id: "expense_workflow", label: "Expense Workflow" },
  { id: "invoice_payment_workflow", label: "Invoice Payment Workflow" },
];

const FULL_SYSTEM_OPTIONS: { id: string; label: string }[] = [
  { id: "workers_crud", label: "Worker CRUD" },
  { id: "projects_crud", label: "Project CRUD" },
  { id: "receipts_crud", label: "Receipt CRUD" },
  { id: "receipt_actions_workflow", label: "Receipt Actions" },
  { id: "reimbursements_workflow", label: "Reimbursement Workflow" },
  { id: "expenses_crud", label: "Expense CRUD" },
  { id: "invoice_payment_workflow", label: "Invoice Payment" },
  { id: "labor_workflow", label: "Labor & Payment" },
];

function StatusBadge({ status }: { status: TestRow["status"] }) {
  if (status === "passed")
    return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">● Passed</span>;
  if (status === "warning")
    return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">● Warning</span>;
  return <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">● Failed</span>;
}

function ResultsTable({ tests, running }: { tests: TestRow[]; running: boolean }) {
  if (running && tests.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">Running tests…</p>
    );
  }

  if (tests.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">Click a button to run tests.</p>
    );
  }

  return (
    <div className="table-responsive">
      <table className="w-full text-sm min-w-[480px] sm:min-w-0 border-collapse">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
            <th className="py-2 pr-4 font-medium">Test</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Time</th>
            <th className="py-2 font-medium">Message</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((row, i) => (
            <tr key={`${row.test}-${i}`} className="border-b border-border/30">
              <td className="py-2 pr-4 font-medium">{row.test}</td>
              <td className="py-2 pr-4">
                <StatusBadge status={row.status} />
              </td>
              <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                {row.executionTimeMs} ms
              </td>
              <td
                className="py-2 text-muted-foreground max-w-[320px] truncate"
                title={row.message || undefined}
              >
                {row.message || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function callRunAll(body: Record<string, unknown>): Promise<{
  tests: TestRow[];
  totalExecutionTimeMs: number | null;
  error: string | null;
}> {
  const res = await fetch("/api/test/run-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: { tests?: unknown; totalExecutionTimeMs?: unknown; message?: string } =
    await res.json();
  const tests = Array.isArray(data.tests) ? (data.tests as TestRow[]) : [];
  const totalExecutionTimeMs =
    typeof data.totalExecutionTimeMs === "number" ? data.totalExecutionTimeMs : null;
  const error = !res.ok ? (data.message ?? "Request failed") : null;
  return { tests, totalExecutionTimeMs, error };
}

export default function SystemTestsPage() {
  const [workflowTests, setWorkflowTests] = React.useState<TestRow[]>([]);
  const [workflowTime, setWorkflowTime] = React.useState<number | null>(null);
  const [workflowRunning, setWorkflowRunning] = React.useState(false);
  const [workflowError, setWorkflowError] = React.useState<string | null>(null);

  const [systemTests, setSystemTests] = React.useState<TestRow[]>([]);
  const [systemTime, setSystemTime] = React.useState<number | null>(null);
  const [systemRunning, setSystemRunning] = React.useState(false);
  const [systemError, setSystemError] = React.useState<string | null>(null);

  const [runAllGroups, setRunAllGroups] = React.useState<RunAllGroup[]>([]);
  const [runAllTotalTime, setRunAllTotalTime] = React.useState<number | null>(null);
  const [runAllRunning, setRunAllRunning] = React.useState(false);
  const [runAllError, setRunAllError] = React.useState<string | null>(null);

  const runWorkflowTests = React.useCallback(async (only?: string) => {
    setWorkflowRunning(true);
    setWorkflowError(null);
    setWorkflowTests([]);
    setWorkflowTime(null);
    try {
      const { tests, totalExecutionTimeMs, error } = await callRunAll(
        only ? { only } : {}
      );
      setWorkflowTests(tests);
      setWorkflowTime(totalExecutionTimeMs);
      if (error) setWorkflowError(error);
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setWorkflowRunning(false);
    }
  }, []);

  const runFullSystemTests = React.useCallback(async (only?: string) => {
    setSystemRunning(true);
    setSystemError(null);
    setSystemTests([]);
    setSystemTime(null);
    try {
      const { tests, totalExecutionTimeMs, error } = await callRunAll(
        only ? { suite: "full", only } : { suite: "full" }
      );
      setSystemTests(tests);
      setSystemTime(totalExecutionTimeMs);
      if (error) setSystemError(error);
    } catch (e) {
      setSystemError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSystemRunning(false);
    }
  }, []);

  const runAllTests = React.useCallback(async () => {
    setRunAllRunning(true);
    setRunAllError(null);
    setRunAllGroups([]);
    setRunAllTotalTime(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/test/run-all-tests", { method: "POST" });
      const data: { ok?: boolean; groups?: RunAllGroup[] } = await res.json().catch(() => ({}));
      setRunAllTotalTime(Date.now() - start);
      if (Array.isArray(data.groups)) setRunAllGroups(data.groups);
      if (!res.ok) setRunAllError("One or more test groups failed.");
    } catch (e) {
      setRunAllTotalTime(Date.now() - start);
      setRunAllError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunAllRunning(false);
    }
  }, []);

  const anyRunning = workflowRunning || systemRunning || runAllRunning;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Tests"
        description="Run automated workflow tests and view results."
      />

      {/* ── Run All Tests ── */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Unified run
        </p>
        <p className="text-xs text-muted-foreground -mt-1">
          Runs System Tests, UI Tests, API Health Check, and Database Schema Check sequentially.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="min-h-[44px] sm:min-h-0"
            onClick={runAllTests}
            disabled={anyRunning}
          >
            {runAllRunning ? "Running…" : "Run All Tests"}
          </Button>
        </div>
        {runAllError && (
          <p className="text-sm text-red-600 dark:text-red-400">{runAllError}</p>
        )}
        {runAllTotalTime != null && !runAllRunning && (
          <p className="text-xs text-muted-foreground">
            Completed in {(runAllTotalTime / 1000).toFixed(1)}s
          </p>
        )}
        {runAllGroups.length > 0 && (
          <div className="table-responsive">
            <table className="w-full text-sm min-w-[480px] sm:min-w-0 border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 pr-4 font-medium">Test</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {runAllGroups.map((row) => (
                  <tr key={row.name} className="border-b border-border/30">
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          row.ok
                            ? "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                            : "inline-flex items-center gap-1 text-red-600 dark:text-red-400"
                        }
                      >
                        ● {row.ok ? "Passed" : "Failed"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {row.executionTimeMs} ms
                    </td>
                    <td
                      className="py-2 text-muted-foreground max-w-[320px] truncate"
                      title={row.error ?? undefined}
                    >
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-border/60" />

      {/* ── Financial Workflow Tests ── */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Financial Workflow Tests
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0"
            onClick={() => runWorkflowTests()}
            disabled={anyRunning}
          >
            {workflowRunning ? "Running…" : "Run All"}
          </Button>
          {WORKFLOW_OPTIONS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant="ghost"
              className="min-h-[44px] sm:min-h-0 text-xs"
              onClick={() => runWorkflowTests(id)}
              disabled={anyRunning}
            >
              {label}
            </Button>
          ))}
        </div>
        {workflowError && (
          <p className="text-sm text-red-600 dark:text-red-400">{workflowError}</p>
        )}
        {workflowTime != null && (
          <p className="text-xs text-muted-foreground">
            Completed in {workflowTime} ms
          </p>
        )}
        <ResultsTable tests={workflowTests} running={workflowRunning} />
      </div>

      <div className="border-t border-border/60" />

      {/* ── Full System Tests ── */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Full System Test — CRUD &amp; Workflows
        </p>
        <p className="text-xs text-muted-foreground -mt-1">
          Creates, verifies, and deletes real rows in each table. All test data is tagged
          "Workflow Test" and cleaned up automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0"
            onClick={() => runFullSystemTests()}
            disabled={anyRunning}
          >
            {systemRunning ? "Running…" : "Run Full System Test"}
          </Button>
          {FULL_SYSTEM_OPTIONS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant="ghost"
              className="min-h-[44px] sm:min-h-0 text-xs"
              onClick={() => runFullSystemTests(id)}
              disabled={anyRunning}
            >
              {label}
            </Button>
          ))}
        </div>
        {systemError && (
          <p className="text-sm text-red-600 dark:text-red-400">{systemError}</p>
        )}
        {systemTime != null && (
          <p className="text-xs text-muted-foreground">
            Completed in {systemTime} ms
          </p>
        )}
        <ResultsTable tests={systemTests} running={systemRunning} />
      </div>
    </div>
  );
}
