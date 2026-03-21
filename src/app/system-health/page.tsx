"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

const REFRESH_INTERVAL_MS = 30_000;

type GuardianCheck = {
  name: string;
  ok: boolean;
  error?: string;
};

type GuardianResult = {
  ok: boolean;
  checks: GuardianCheck[];
  checkedAt?: string;
};

type IntegrityCheck = { ok: boolean; count: number; ids?: string[] };

type DataIntegrityResult = {
  ok: boolean;
  orphanedTasks: IntegrityCheck;
  ghostTasks: IntegrityCheck;
  duplicateTasks: IntegrityCheck;
  overdueNotCompleted: { count: number };
  staleTestData: { tasks: IntegrityCheck; projects: IntegrityCheck };
  errors?: string[];
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

function StatusLabel({ ok }: { ok: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 ${
        ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      <StatusDot ok={ok} />
      {ok ? "OK" : "Failed"}
    </span>
  );
}

type CleanupCategory = "orphaned" | "ghost" | "duplicate" | "stale";

export default function SystemHealthPage() {
  const [result, setResult] = React.useState<GuardianResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [integrity, setIntegrity] = React.useState<DataIntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = React.useState(true);
  const [cleanupBusy, setCleanupBusy] = React.useState<CleanupCategory | null>(null);

  const fetchGuardian = React.useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/system/guardian", { cache: "no-store" });
      const data: GuardianResult = await res.json();
      setResult(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach guardian");
      setResult({ ok: false, checks: [] });
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  const fetchIntegrity = React.useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const res = await fetch("/api/system/integrity", { cache: "no-store" });
      const data: DataIntegrityResult = await res.json();
      setIntegrity(data);
    } catch {
      setIntegrity(null);
    } finally {
      setIntegrityLoading(false);
    }
  }, []);

  const runCleanup = React.useCallback(async (category: CleanupCategory) => {
    setCleanupBusy(category);
    try {
      const res = await fetch("/api/system/integrity/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (res.ok) {
        await fetchIntegrity();
        await fetchGuardian();
      }
    } finally {
      setCleanupBusy(null);
    }
  }, [fetchIntegrity, fetchGuardian]);

  // Initial load
  React.useEffect(() => {
    void fetchGuardian();
    void fetchIntegrity();
  }, [fetchGuardian, fetchIntegrity]);

  useOnAppSync(
    React.useCallback(() => {
      void fetchGuardian();
      void fetchIntegrity();
    }, [fetchGuardian, fetchIntegrity]),
    [fetchGuardian, fetchIntegrity]
  );

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const id = setInterval(() => {
      void fetchGuardian();
      void fetchIntegrity();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchGuardian, fetchIntegrity]);

  const anyFailed = result !== null && !result.ok;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="System Health"
        description="System Guardian verifies each critical module every 30 seconds."
        actions={
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            onClick={() => fetchGuardian(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Checking…" : "Refresh Now"}
          </Button>
        }
      />

      {/* Warning banner */}
      {anyFailed && !loading && (
        <div className="flex items-start gap-3 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
          <span className="text-base leading-none">⚠</span>
          <div>
            <p className="font-medium">System issue detected.</p>
            <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
              One or more modules are not responding correctly. Check the table below for details.
              Failures are recorded in{" "}
              <Link href="/system-logs" className="underline underline-offset-2">
                System Logs
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {/* Last refreshed + overall status */}
      {!loading && result && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2 font-medium">
            Overall:{" "}
            <StatusLabel ok={result.ok} />
          </span>
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Last checked{" "}
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              {" · "}auto-refreshes every 30 s
            </span>
          )}
        </div>
      )}

      {/* Checks table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Checking modules…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="table-responsive">
          <table className="w-full min-w-[360px] sm:min-w-0 border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-6 font-medium">Module</th>
                <th className="py-2 pr-6 font-medium">Status</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {!result?.checks?.length ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    <span className="block">Module status could not be loaded.</span>
                    <span className="block mt-1 text-xs">
                      Ensure <code className="rounded bg-muted px-1">/api/system/guardian</code> is available, then{" "}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-sm inline-flex"
                        onClick={() => fetchGuardian(true)}
                      >
                        Refresh Now
                      </Button>
                    </span>
                  </td>
                </tr>
              ) : (
                result?.checks.map((ch) => (
                  <tr key={ch.name} className="border-b border-border/30">
                    <td className="py-2.5 pr-6 font-medium">{ch.name}</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={ch.ok} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {ch.ok ? "—" : (ch.error ?? "Check failed")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Data Integrity */}
      <div className="border-t border-border/60 pt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Data Integrity</h2>
        {integrityLoading && !integrity ? (
          <p className="text-sm text-muted-foreground">Checking data integrity…</p>
        ) : integrity?.errors?.length ? (
          <p className="text-sm text-red-600 dark:text-red-400">{integrity.errors.join("; ")}</p>
        ) : (
          <div className="table-responsive">
            <table className="w-full min-w-[360px] sm:min-w-0 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-6 font-medium">Check</th>
                  <th className="py-2 pr-6 font-medium">Status</th>
                  <th className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-6 font-medium">Orphaned tasks</td>
                  <td className="py-2.5 pr-6">
                    <StatusLabel ok={!(integrity?.orphanedTasks.count ?? 0)} />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {(integrity?.orphanedTasks.count ?? 0) > 0 ? (
                      <>
                        <span>{(integrity?.orphanedTasks.count ?? 0)} task(s) with missing project</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-sm h-7"
                          onClick={() => runCleanup("orphaned")}
                          disabled={cleanupBusy !== null}
                        >
                          {cleanupBusy === "orphaned" ? "Cleaning…" : "Clean up"}
                        </Button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-6 font-medium">Ghost tasks</td>
                  <td className="py-2.5 pr-6">
                    <StatusLabel ok={!(integrity?.ghostTasks.count ?? 0)} />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {(integrity?.ghostTasks.count ?? 0) > 0 ? (
                      <>
                        <span>{(integrity?.ghostTasks.count ?? 0)} task(s) with no title</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-sm h-7"
                          onClick={() => runCleanup("ghost")}
                          disabled={cleanupBusy !== null}
                        >
                          {cleanupBusy === "ghost" ? "Cleaning…" : "Clean up"}
                        </Button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-6 font-medium">Duplicate tasks</td>
                  <td className="py-2.5 pr-6">
                    <StatusLabel ok={!(integrity?.duplicateTasks.count ?? 0)} />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {(integrity?.duplicateTasks.count ?? 0) > 0 ? (
                      <>
                        <span>{(integrity?.duplicateTasks.count ?? 0)} duplicate(s) in same project</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-sm h-7"
                          onClick={() => runCleanup("duplicate")}
                          disabled={cleanupBusy !== null}
                        >
                          {cleanupBusy === "duplicate" ? "Cleaning…" : "Clean up"}
                        </Button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-6 font-medium">Overdue not completed</td>
                  <td className="py-2.5 pr-6">
                    <StatusLabel ok={(integrity?.overdueNotCompleted.count ?? 0) === 0} />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">
                    {(integrity?.overdueNotCompleted.count ?? 0) > 0
                      ? `${integrity?.overdueNotCompleted.count} task(s) past due`
                      : "—"}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 pr-6 font-medium">Stale test data</td>
                  <td className="py-2.5 pr-6">
                    <StatusLabel
                      ok={
                        ((integrity?.staleTestData.tasks.count ?? 0) + (integrity?.staleTestData.projects.count ?? 0)) ===
                        0
                      }
                    />
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    {(integrity?.staleTestData.tasks.count ?? 0) + (integrity?.staleTestData.projects.count ?? 0) > 0 ? (
                      <>
                        <span>
                          {(integrity?.staleTestData.tasks.count ?? 0)} task(s),{" "}
                          {(integrity?.staleTestData.projects.count ?? 0)} project(s)
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-sm h-7"
                          onClick={() => runCleanup("stale")}
                          disabled={cleanupBusy !== null}
                        >
                          {cleanupBusy === "stale" ? "Cleaning…" : "Clean up"}
                        </Button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Link href="/dashboard">
        <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
