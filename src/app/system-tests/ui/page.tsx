"use client";

import * as React from "react";
import { NeoMobileCard, NeoPanel, NeoTable, StatusBadge } from "@/components/base";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";

type UiTestRow = {
  name: string;
  ok: boolean;
  error?: string;
};

const TEST_LABELS: Record<string, string> = {
  receipt_upload: "Receipt Upload Page",
  approve_receipt: "Approve Receipt",
  delete_receipt: "Delete Receipt",
  create_expense: "Create Expense",
  create_invoice: "Create Invoice",
  projects: "Projects",
  estimates: "Estimates",
  change_orders: "Change Orders",
  tasks: "Tasks",
  punch_list: "Punch List",
  schedule: "Schedule",
  site_photos: "Site Photos",
  inspection_log: "Inspection Log",
  material_catalog: "Material Selections",
  labor_receipts: "Labor Receipts",
};

function UiTestStatusBadge({ ok, running }: { ok: boolean | null; running: boolean }) {
  if (running) return <StatusBadge label="Running" variant="warning" />;
  if (ok === null) return <StatusBadge label="Not run" variant="muted" />;
  return <StatusBadge label={ok ? "Passed" : "Failed"} variant={ok ? "success" : "danger"} />;
}

function UiTestResults({ tests, running }: { tests: UiTestRow[]; running: boolean }) {
  const rows =
    running && tests.length === 0
      ? Object.keys(TEST_LABELS).map((name) => ({
          name,
          ok: null,
          running: true,
          error: undefined,
        }))
      : tests.map((row) => ({ ...row, running: false }));

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--hh-text-secondary)]">
        Click “Run UI Tests” to start.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2 md:hidden" data-testid="ui-system-test-cards">
        {rows.map((row) => (
          <NeoMobileCard key={row.name} data-testid="ui-system-test-card" className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium text-[var(--hh-text-primary)]">
                {TEST_LABELS[row.name] ?? row.name}
              </p>
              <UiTestStatusBadge ok={row.ok} running={row.running} />
            </div>
            {row.error ? (
              <p className="break-words text-xs text-[var(--hh-text-secondary)]">{row.error}</p>
            ) : null}
          </NeoMobileCard>
        ))}
      </div>
      <NeoTable className="hidden md:block" tableClassName="min-w-[560px]">
        <thead>
          <tr>
            <th className={tableRawThClass}>Test Name</th>
            <th className={tableRawThClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className={tableRawTdClass}>{TEST_LABELS[row.name] ?? row.name}</td>
              <td className={tableRawTdClass}>
                <div className="flex flex-wrap items-center gap-2">
                  <UiTestStatusBadge ok={row.ok} running={row.running} />
                  {row.error ? (
                    <span className="text-xs text-[var(--hh-text-secondary)]">— {row.error}</span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </NeoTable>
    </>
  );
}

export default function UiTestsPage() {
  const [tests, setTests] = React.useState<UiTestRow[]>([]);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState<number | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  const runTests = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    setTests([]);
    setElapsed(null);
    setUnavailable(false);
    const start = Date.now();
    try {
      const res = await fetch("/api/test/run-ui-tests", { method: "POST" });
      const data: { ok?: boolean; tests?: UiTestRow[]; error?: string } = await res.json();
      setElapsed(Date.now() - start);
      if (Array.isArray(data.tests)) setTests(data.tests);
      if (res.status === 503) {
        setUnavailable(true);
        setError(data.error ?? "Puppeteer not available in this environment.");
      } else if (!res.ok && data.error) {
        setError(data.error);
      }
    } catch (e) {
      setElapsed(Date.now() - start);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }, []);

  const passed = tests.filter((t) => t.ok).length;
  const failed = tests.filter((t) => !t.ok).length;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="UI System Tests"
        description="Browser-level smoke tests via Puppeteer. Requires the app to be running locally."
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] lg:min-h-0"
          onClick={runTests}
          disabled={running}
        >
          {running ? "Running…" : "Run UI Tests"}
        </Button>

        {elapsed != null && !running && (
          <span className="text-xs text-muted-foreground">
            Completed in {(elapsed / 1000).toFixed(1)}s
            {tests.length > 0 && (
              <>
                {" · "}
                <span className="text-[var(--hh-success)]">{passed} passed</span>
                {failed > 0 && (
                  <>
                    {" · "}
                    <span className="text-[var(--hh-danger)]">{failed} failed</span>
                  </>
                )}
              </>
            )}
          </span>
        )}
      </div>

      {/* Unavailable notice */}
      {unavailable && (
        <NeoPanel
          className="border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)]"
          bodyClassName="px-4 py-3 text-sm text-[var(--hh-text-primary)]"
        >
          <p className="font-medium">Puppeteer not available in this environment</p>
          <p className="mt-1 text-xs">
            UI tests require a local machine with Chrome. Run{" "}
            <code className="rounded-hh-compact bg-[var(--hh-l2-operational-surface)] px-1">
              npm run ui:test
            </code>{" "}
            from your terminal, or deploy to an environment that supports headless browsers.
          </p>
        </NeoPanel>
      )}

      {/* Generic error */}
      {error && !unavailable && <p className="text-sm text-[var(--hh-danger)]">{error}</p>}

      {/* Results table */}
      <UiTestResults tests={tests} running={running} />

      {/* How it works note */}
      <div className="border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          Tests run via{" "}
          <code className="rounded-hh-compact bg-[var(--hh-l2-operational-surface)] px-1 py-0.5">
            npm run ui:test
          </code>{" "}
          which launches a headless Chromium browser and navigates each page, checking that key UI
          elements render correctly. No test data is created or modified.
        </p>
      </div>
    </div>
  );
}
