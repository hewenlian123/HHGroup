"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

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

type HealthCheckStatus = "ok" | "warning" | "fail";

type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  message?: string;
  code?: string;
};

type SystemHealthResult = {
  status: "ok" | "warning";
  checkedAt?: string;
  environment?: {
    nodeEnv?: string;
    vercelEnv?: string | null;
    commit?: string | null;
  };
  summary?: {
    app: HealthCheck;
    supabase: HealthCheck;
    requiredTables: HealthCheck[];
    optionalTables: HealthCheck[];
    storageBuckets: HealthCheck[];
    companyProfile: HealthCheck;
    pin: HealthCheck;
    apBills: HealthCheck[];
    projectFinancialSnapshot: HealthCheck;
    warnings: string[];
    checkedAt: string;
  };
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
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-[#166534]" : "bg-red-500"}`} />
  );
}

function StatusLabel({ ok }: { ok: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 ${
        ok
          ? "text-hh-profit-positive dark:text-hh-profit-positive"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      <StatusDot ok={ok} />
      {ok ? "OK" : "Failed"}
    </span>
  );
}

function HealthStatusLabel({ status }: { status: HealthCheckStatus }) {
  const ok = status === "ok";
  const warning = status === "warning";
  return (
    <span
      className={`flex items-center gap-2 ${
        ok
          ? "text-hh-profit-positive dark:text-hh-profit-positive"
          : warning
            ? "text-amber-700 dark:text-amber-300"
            : "text-red-600 dark:text-red-400"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          ok ? "bg-[#166534]" : warning ? "bg-amber-500" : "bg-red-500"
        }`}
      />
      {ok ? "OK" : warning ? "Warning" : "Failed"}
    </span>
  );
}

function HealthCard({ title, check }: { title: string; check?: HealthCheck }) {
  return (
    <div className="rounded-sm border border-border/70 bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{check?.name ?? "Not checked"}</p>
        </div>
        {check ? (
          <HealthStatusLabel status={check.status} />
        ) : (
          <span className="text-xs text-muted-foreground">Loading</span>
        )}
      </div>
      {check?.message && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.message}</p>
      )}
    </div>
  );
}

function HealthTable({ title, checks }: { title: string; checks?: HealthCheck[] }) {
  return (
    <div className="border-t border-border/60 pt-5">
      <h2 className="mb-3 text-sm font-medium text-foreground">{title}</h2>
      {!checks ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : (
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll">
            <table className="w-full min-w-[360px] text-sm sm:min-w-0">
              <thead>
                <tr className="text-left">
                  <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Check
                  </th>
                  <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Status
                  </th>
                  <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      No checks configured.
                    </td>
                  </tr>
                ) : (
                  checks.map((check) => (
                    <tr key={check.name} className={listTableRowStaticClassName}>
                      <td className="py-2.5 pr-6 font-medium">{check.name}</td>
                      <td className="py-2.5 pr-6">
                        <HealthStatusLabel status={check.status} />
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {check.message ?? check.code ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type CleanupCategory = "orphaned" | "ghost" | "duplicate" | "stale";

export default function SystemHealthPage() {
  const [health, setHealth] = React.useState<SystemHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = React.useState(true);
  const [result, setResult] = React.useState<GuardianResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [integrity, setIntegrity] = React.useState<DataIntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = React.useState(true);
  const [cleanupBusy, setCleanupBusy] = React.useState<CleanupCategory | null>(null);

  const fetchSystemHealth = React.useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/system-health", { cache: "no-store" });
      const data: SystemHealthResult = await res.json();
      setHealth(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach System Health");
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

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

  const runCleanup = React.useCallback(
    async (category: CleanupCategory) => {
      const confirmation = window.prompt("Type CLEAN UP to confirm this integrity cleanup.");
      if (confirmation !== "CLEAN UP") return;
      setCleanupBusy(category);
      try {
        const res = await fetch("/api/system/integrity/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, confirmation }),
        });
        if (res.ok) {
          await fetchIntegrity();
          await fetchGuardian();
        }
      } finally {
        setCleanupBusy(null);
      }
    },
    [fetchIntegrity, fetchGuardian]
  );

  const refreshAll = React.useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        await Promise.all([fetchSystemHealth(), fetchGuardian(), fetchIntegrity()]);
      } finally {
        if (isManual) setRefreshing(false);
      }
    },
    [fetchGuardian, fetchIntegrity, fetchSystemHealth]
  );

  // Initial load
  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useOnAppSync(
    React.useCallback(() => {
      void refreshAll();
    }, [refreshAll]),
    [refreshAll]
  );

  // Auto-refresh every 30 seconds
  React.useEffect(() => {
    const id = setInterval(() => {
      void refreshAll();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  const anyFailed = (result !== null && !result.ok) || health?.status === "warning";
  const summary = health?.summary;
  const apBillNames = new Set(summary?.apBills.map((check) => check.name) ?? []);
  const optionalWithoutAp =
    summary?.optionalTables.filter((check) => !apBillNames.has(check.name)) ?? undefined;

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
            onClick={() => refreshAll(true)}
            disabled={loading || healthLoading || refreshing}
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
            Overall: <StatusLabel ok={result.ok && health?.status !== "warning"} />
          </span>
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Last checked{" "}
              {lastRefreshed.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              {" · "}auto-refreshes every 30 s
            </span>
          )}
        </div>
      )}

      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HealthCard title="App status" check={summary?.app} />
          <HealthCard title="Supabase connection" check={summary?.supabase} />
          <HealthCard title="Company profile status" check={summary?.companyProfile} />
          <HealthCard title="PIN status" check={summary?.pin} />
          <HealthCard
            title="Project financial snapshot"
            check={summary?.projectFinancialSnapshot}
          />
          <div className="rounded-sm border border-border/70 bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Last checked
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {health?.checkedAt
                ? new Date(health.checkedAt).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "Checking…"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Environment: {health?.environment?.vercelEnv ?? health?.environment?.nodeEnv ?? "—"}
              {health?.environment?.commit ? ` · ${health.environment.commit}` : ""}
            </p>
          </div>
        </div>

        {summary?.warnings?.length ? (
          <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="font-medium">Recent warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
              {summary.warnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <HealthTable title="Required tables" checks={summary?.requiredTables} />
        <HealthTable title="Optional tables" checks={optionalWithoutAp} />
        <HealthTable title="Storage buckets" checks={summary?.storageBuckets} />
        <HealthTable title="AP bills schema status" checks={summary?.apBills} />
      </div>

      {/* Checks table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Checking modules…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="airtable-table-wrap airtable-table-wrap--ruled">
          <div className="airtable-table-scroll">
            <table className="w-full min-w-[360px] text-sm sm:min-w-0">
              <thead>
                <tr className="text-left">
                  <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Module
                  </th>
                  <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Status
                  </th>
                  <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {!result?.checks?.length ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      <span className="block">Module status could not be loaded.</span>
                      <span className="block mt-1 text-xs">
                        Ensure <code className="rounded bg-muted px-1">/api/system/guardian</code>{" "}
                        is available, then{" "}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-sm inline-flex"
                          onClick={() => refreshAll(true)}
                        >
                          Refresh Now
                        </Button>
                      </span>
                    </td>
                  </tr>
                ) : (
                  result?.checks.map((ch) => (
                    <tr key={ch.name} className={listTableRowStaticClassName}>
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
          <div className="airtable-table-wrap airtable-table-wrap--ruled">
            <div className="airtable-table-scroll">
              <table className="w-full min-w-[360px] text-sm sm:min-w-0">
                <thead>
                  <tr className="text-left">
                    <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Check
                    </th>
                    <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Status
                    </th>
                    <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={listTableRowStaticClassName}>
                    <td className="py-2.5 pr-6 font-medium">Orphaned tasks</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={!(integrity?.orphanedTasks.count ?? 0)} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {(integrity?.orphanedTasks.count ?? 0) > 0 ? (
                        <>
                          <span>
                            {integrity?.orphanedTasks.count ?? 0} task(s) with missing project
                          </span>
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
                  <tr className={listTableRowStaticClassName}>
                    <td className="py-2.5 pr-6 font-medium">Ghost tasks</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={!(integrity?.ghostTasks.count ?? 0)} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {(integrity?.ghostTasks.count ?? 0) > 0 ? (
                        <>
                          <span>{integrity?.ghostTasks.count ?? 0} task(s) with no title</span>
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
                  <tr className={listTableRowStaticClassName}>
                    <td className="py-2.5 pr-6 font-medium">Duplicate tasks</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={!(integrity?.duplicateTasks.count ?? 0)} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {(integrity?.duplicateTasks.count ?? 0) > 0 ? (
                        <>
                          <span>
                            {integrity?.duplicateTasks.count ?? 0} duplicate(s) in same project
                          </span>
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
                  <tr className={listTableRowStaticClassName}>
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
                  <tr className={listTableRowStaticClassName}>
                    <td className="py-2.5 pr-6 font-medium">Stale test data</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel
                        ok={
                          (integrity?.staleTestData.tasks.count ?? 0) +
                            (integrity?.staleTestData.projects.count ?? 0) ===
                          0
                        }
                      />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {(integrity?.staleTestData.tasks.count ?? 0) +
                        (integrity?.staleTestData.projects.count ?? 0) >
                      0 ? (
                        <>
                          <span>
                            {integrity?.staleTestData.tasks.count ?? 0} task(s),{" "}
                            {integrity?.staleTestData.projects.count ?? 0} project(s)
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
