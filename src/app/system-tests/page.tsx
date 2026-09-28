"use client";

import * as React from "react";
import { NeoMobileCard, NeoTable, StatusBadge } from "@/components/base";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";

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

function TestStatusBadge({ status }: { status: TestRow["status"] }) {
  const config = {
    passed: { label: "Passed", variant: "success" as const },
    warning: { label: "Warning", variant: "warning" as const },
    failed: { label: "Failed", variant: "danger" as const },
  }[status];

  return <StatusBadge {...config} />;
}

function ResultsTable({ tests, running }: { tests: TestRow[]; running: boolean }) {
  if (running && tests.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Running tests…</p>;
  }

  if (tests.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Click a button to run tests.</p>;
  }

  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="system-test-result-cards">
        {tests.map((row, index) => (
          <NeoMobileCard
            key={`${row.test}-${index}`}
            data-testid="system-test-result-card"
            className="space-y-3 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium text-[var(--hh-text-primary)]">{row.test}</p>
              <TestStatusBadge status={row.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-hh-table-cell">
              <dt className="text-[var(--hh-text-secondary)]">Time</dt>
              <dd className="text-right tabular-nums text-[var(--hh-text-primary)]">
                {row.executionTimeMs} ms
              </dd>
              <dt className="text-[var(--hh-text-secondary)]">Message</dt>
              <dd className="break-words text-right text-[var(--hh-text-primary)]">
                {row.message || "—"}
              </dd>
            </dl>
          </NeoMobileCard>
        ))}
      </div>
      <NeoTable className="hidden md:block" tableClassName="min-w-[680px]">
        <thead>
          <tr>
            <th className={tableRawThClass}>Test</th>
            <th className={tableRawThClass}>Status</th>
            <th className={tableRawThClass}>Time</th>
            <th className={tableRawThClass}>Message</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((row, i) => (
            <tr key={`${row.test}-${i}`}>
              <td className={tableRawTdClass}>{row.test}</td>
              <td className={tableRawTdClass}>
                <TestStatusBadge status={row.status} />
              </td>
              <td className={`${tableRawTdClass} tabular-nums`}>{row.executionTimeMs} ms</td>
              <td
                className={`${tableRawTdClass} max-w-[320px] truncate`}
                title={row.message || undefined}
              >
                {row.message || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </NeoTable>
    </>
  );
}

function RunAllResults({ groups }: { groups: RunAllGroup[] }) {
  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="system-test-result-cards">
        {groups.map((group) => (
          <NeoMobileCard
            key={group.name}
            data-testid="system-test-result-card"
            className="space-y-3 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium text-[var(--hh-text-primary)]">{group.name}</p>
              <StatusBadge
                label={group.ok ? "Passed" : "Failed"}
                variant={group.ok ? "success" : "danger"}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-hh-table-cell">
              <dt className="text-[var(--hh-text-secondary)]">Time</dt>
              <dd className="text-right tabular-nums text-[var(--hh-text-primary)]">
                {group.executionTimeMs} ms
              </dd>
              <dt className="text-[var(--hh-text-secondary)]">Message</dt>
              <dd className="break-words text-right text-[var(--hh-text-primary)]">
                {group.error ?? "—"}
              </dd>
            </dl>
          </NeoMobileCard>
        ))}
      </div>
      <NeoTable className="hidden md:block" tableClassName="min-w-[680px]">
        <thead>
          <tr>
            <th className={tableRawThClass}>Test</th>
            <th className={tableRawThClass}>Status</th>
            <th className={tableRawThClass}>Time</th>
            <th className={tableRawThClass}>Message</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.name}>
              <td className={tableRawTdClass}>{group.name}</td>
              <td className={tableRawTdClass}>
                <StatusBadge
                  label={group.ok ? "Passed" : "Failed"}
                  variant={group.ok ? "success" : "danger"}
                />
              </td>
              <td className={`${tableRawTdClass} tabular-nums`}>{group.executionTimeMs} ms</td>
              <td
                className={`${tableRawTdClass} max-w-[320px] truncate`}
                title={group.error ?? undefined}
              >
                {group.error ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </NeoTable>
    </>
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
      const { tests, totalExecutionTimeMs, error } = await callRunAll(only ? { only } : {});
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
            className="min-h-[44px] lg:min-h-0"
            onClick={runAllTests}
            disabled={anyRunning}
          >
            {runAllRunning ? "Running…" : "Run All Tests"}
          </Button>
        </div>
        {runAllError && <p className="text-sm text-[var(--hh-danger)]">{runAllError}</p>}
        {runAllTotalTime != null && !runAllRunning && (
          <p className="text-xs text-muted-foreground">
            Completed in {(runAllTotalTime / 1000).toFixed(1)}s
          </p>
        )}
        {runAllGroups.length > 0 ? <RunAllResults groups={runAllGroups} /> : null}
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
            className="min-h-[44px] lg:min-h-0"
            onClick={() => runWorkflowTests()}
            disabled={anyRunning}
          >
            {workflowRunning ? "Running…" : "Run All"}
          </Button>
          {WORKFLOW_OPTIONS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant="outline"
              className="btn-outline-ghost min-h-[44px] lg:min-h-0 text-xs"
              onClick={() => runWorkflowTests(id)}
              disabled={anyRunning}
            >
              {label}
            </Button>
          ))}
        </div>
        {workflowError && <p className="text-sm text-[var(--hh-danger)]">{workflowError}</p>}
        {workflowTime != null && (
          <p className="text-xs text-muted-foreground">Completed in {workflowTime} ms</p>
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
          &quot;Workflow Test&quot; and cleaned up automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] lg:min-h-0"
            onClick={() => runFullSystemTests()}
            disabled={anyRunning}
          >
            {systemRunning ? "Running…" : "Run Full System Test"}
          </Button>
          {FULL_SYSTEM_OPTIONS.map(({ id, label }) => (
            <Button
              key={id}
              size="sm"
              variant="outline"
              className="btn-outline-ghost min-h-[44px] lg:min-h-0 text-xs"
              onClick={() => runFullSystemTests(id)}
              disabled={anyRunning}
            >
              {label}
            </Button>
          ))}
        </div>
        {systemError && <p className="text-sm text-[var(--hh-danger)]">{systemError}</p>}
        {systemTime != null && (
          <p className="text-xs text-muted-foreground">Completed in {systemTime} ms</p>
        )}
        <ResultsTable tests={systemTests} running={systemRunning} />
      </div>
    </div>
  );
}
