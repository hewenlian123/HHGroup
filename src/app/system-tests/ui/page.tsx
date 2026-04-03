"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

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
  material_catalog: "Material Catalog",
  labor_receipts: "Labor Receipts",
};

function StatusDot({ ok, running }: { ok: boolean | null; running: boolean }) {
  if (running)
    return <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />;
  if (ok === null) return <span className="inline-block h-2 w-2 rounded-full bg-border" />;
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-[#166534]" : "bg-red-500"}`} />
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
          className="min-h-[44px] sm:min-h-0"
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
                <span className="text-hh-profit-positive dark:text-hh-profit-positive">
                  {passed} passed
                </span>
                {failed > 0 && (
                  <>
                    {" · "}
                    <span className="text-red-600 dark:text-red-400">{failed} failed</span>
                  </>
                )}
              </>
            )}
          </span>
        )}
      </div>

      {/* Unavailable notice */}
      {unavailable && (
        <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
          <p className="font-medium">Puppeteer not available in this environment</p>
          <p className="mt-1 text-xs">
            UI tests require a local machine with Chrome. Run{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">npm run ui:test</code>{" "}
            from your terminal, or deploy to an environment that supports headless browsers.
          </p>
        </div>
      )}

      {/* Generic error */}
      {error && !unavailable && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Results table */}
      <div className="table-responsive">
        <table className="w-full min-w-[360px] sm:min-w-0 border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-6 font-medium">Test Name</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tests.length === 0 && !running ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                  Click &ldquo;Run UI Tests&rdquo; to start.
                </td>
              </tr>
            ) : (
              <>
                {/* If tests are running and no rows yet, show placeholders */}
                {running && tests.length === 0
                  ? Object.keys(TEST_LABELS).map((name) => (
                      <tr key={name} className="border-b border-border/30">
                        <td className="py-2.5 pr-6 font-medium text-muted-foreground">
                          {TEST_LABELS[name] ?? name}
                        </td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <StatusDot ok={null} running />
                            Running…
                          </span>
                        </td>
                      </tr>
                    ))
                  : tests.map((row) => (
                      <tr key={row.name} className="border-b border-border/30">
                        <td className="py-2.5 pr-6 font-medium">
                          {TEST_LABELS[row.name] ?? row.name}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`flex items-center gap-2 ${
                              row.ok
                                ? "text-hh-profit-positive dark:text-hh-profit-positive"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            <StatusDot ok={row.ok} running={false} />
                            {row.ok ? "Passed" : "Failed"}
                            {!row.ok && row.error && (
                              <span
                                className="ml-2 max-w-[420px] truncate text-xs text-muted-foreground"
                                title={row.error}
                              >
                                — {row.error}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* How it works note */}
      <div className="border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          Tests run via <code className="rounded bg-muted px-1 py-0.5">npm run ui:test</code> which
          launches a headless Chromium browser and navigates each page, checking that key UI
          elements render correctly. No test data is created or modified.
        </p>
      </div>
    </div>
  );
}
