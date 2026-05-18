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
    schemaDriftWarnings: string[];
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

type SystemQaStatus = "pass" | "warning" | "critical";

type SystemQaCheck = {
  id: string;
  name: string;
  status: SystemQaStatus;
  type: string;
  page?: string;
  message: string;
  recommendedAction?: string;
  diagnosticCode?: string;
};

type SystemQaSection = {
  id: string;
  name: string;
  status: SystemQaStatus;
  checks: SystemQaCheck[];
};

type SystemQaResult = {
  ok: boolean;
  checkedAt: string;
  mode: "production-safe" | "local-safe";
  summary: {
    status: SystemQaStatus;
    critical: number;
    warning: number;
    pass: number;
    total: number;
  };
  sections: SystemQaSection[];
};

type PartialSystemQaCheck = Partial<SystemQaCheck>;
type PartialSystemQaSection = Partial<Omit<SystemQaSection, "checks">> & {
  checks?: PartialSystemQaCheck[];
};
type PartialSystemQaResult = Partial<Omit<SystemQaResult, "summary" | "sections">> & {
  summary?: Partial<SystemQaResult["summary"]>;
  sections?: PartialSystemQaSection[];
};

const DEFAULT_QA_SUMMARY: SystemQaResult["summary"] = {
  status: "pass",
  critical: 0,
  warning: 0,
  pass: 0,
  total: 0,
};

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeQaStatus(value: unknown): SystemQaStatus {
  return value === "pass" || value === "warning" || value === "critical" ? value : "warning";
}

function normalizeQaResult(value: PartialSystemQaResult): SystemQaResult {
  const summary = value.summary ?? {};
  const critical = safeNumber(summary.critical);
  const warning = safeNumber(summary.warning);
  const pass = safeNumber(summary.pass);
  const total = safeNumber(summary.total);
  const status =
    summary.status === "pass" || summary.status === "warning" || summary.status === "critical"
      ? summary.status
      : critical > 0
        ? "critical"
        : warning > 0
          ? "warning"
          : "pass";

  return {
    ok: value.ok ?? false,
    checkedAt: safeString(value.checkedAt, new Date().toISOString()),
    mode: value.mode === "local-safe" ? "local-safe" : "production-safe",
    summary: {
      status,
      critical,
      warning,
      pass,
      total,
    },
    sections: Array.isArray(value.sections)
      ? value.sections.map((section, index) => ({
          id: safeString(section.id, `section-${index}`),
          name: safeString(section.name, "QA section"),
          status: normalizeQaStatus(section.status),
          checks: Array.isArray(section.checks)
            ? section.checks.map((check, checkIndex) => ({
                id: safeString(check.id, `check-${index}-${checkIndex}`),
                name: safeString(check.name, "QA check"),
                status: normalizeQaStatus(check.status),
                type: safeString(check.type, "system"),
                page: typeof check.page === "string" ? check.page : undefined,
                message: safeString(check.message, "No detail provided."),
                recommendedAction:
                  typeof check.recommendedAction === "string" ? check.recommendedAction : undefined,
                diagnosticCode:
                  typeof check.diagnosticCode === "string" ? check.diagnosticCode : undefined,
              }))
            : [],
        }))
      : [],
  };
}

function integrityCount(check?: { count?: unknown } | null): number {
  return safeNumber(check?.count);
}

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

function QaStatusLabel({ status }: { status: SystemQaStatus }) {
  const pass = status === "pass";
  const warning = status === "warning";
  return (
    <span
      className={`inline-flex items-center gap-2 ${
        pass
          ? "text-hh-profit-positive dark:text-hh-profit-positive"
          : warning
            ? "text-amber-700 dark:text-amber-300"
            : "text-red-600 dark:text-red-400"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          pass ? "bg-[#166534]" : warning ? "bg-amber-500" : "bg-red-500"
        }`}
      />
      {pass ? "Pass" : warning ? "Warning" : "Critical"}
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

function QaSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border/70 bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function SystemQaSectionTable({ section }: { section: SystemQaSection }) {
  return (
    <div className="border-t border-border/60 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{section.name}</h3>
        <QaStatusLabel status={section.status} />
      </div>
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Check
                </th>
                <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Status
                </th>
                <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Page / Type
                </th>
                <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {section.checks.map((check) => (
                <tr key={check.id} className={listTableRowStaticClassName}>
                  <td className="py-2.5 pr-6 font-medium">{check.name}</td>
                  <td className="py-2.5 pr-6">
                    <QaStatusLabel status={check.status} />
                  </td>
                  <td className="py-2.5 pr-6 text-xs text-muted-foreground">
                    {check.page ? (
                      <Link href={check.page} className="underline underline-offset-2">
                        {check.page}
                      </Link>
                    ) : (
                      check.type
                    )}
                  </td>
                  <td className="py-2.5 text-xs leading-5 text-muted-foreground">
                    <span className="block">{check.message}</span>
                    {check.recommendedAction ? (
                      <span className="block text-foreground/80">{check.recommendedAction}</span>
                    ) : null}
                    {check.diagnosticCode ? (
                      <code className="mt-1 inline-block rounded bg-muted px-1 py-0.5">
                        {check.diagnosticCode}
                      </code>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SystemQaPanel({
  qa,
  loading,
  error,
  onRun,
}: {
  qa: SystemQaResult | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const summary = qa?.summary ?? DEFAULT_QA_SUMMARY;
  const sections = Array.isArray(qa?.sections) ? qa.sections : [];

  return (
    <div className="rounded-sm border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">System QA</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Safe self-check for page availability, auth/RLS blockers, destructive GET protection,
            financial data guardrails, preview readiness, and mobile route coverage. It never runs
            seed, wipe, migration, delete, cleanup, restore, or payment submission actions.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
          onClick={onRun}
          disabled={loading}
        >
          {loading ? "Running QA…" : "Run System QA"}
        </Button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : loading && !qa ? (
        <p className="mt-4 text-sm text-muted-foreground">Running safe QA checks…</p>
      ) : qa ? (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              Overall: <QaStatusLabel status={summary.status} />
            </span>
            <span className="text-xs text-muted-foreground">
              Mode: {qa.mode === "production-safe" ? "Production safe" : "Local safe"} · Checked{" "}
              {new Date(qa.checkedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QaSummaryCard label="Critical" value={summary.critical} />
            <QaSummaryCard label="Warnings" value={summary.warning} />
            <QaSummaryCard label="Passed" value={summary.pass} />
            <QaSummaryCard label="Total checks" value={summary.total} />
          </div>
          {sections.map((section) => (
            <SystemQaSectionTable key={section.id} section={section} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Run System QA to scan the app safely.</p>
      )}
    </div>
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
  const [qa, setQa] = React.useState<SystemQaResult | null>(null);
  const [qaLoading, setQaLoading] = React.useState(false);
  const [qaError, setQaError] = React.useState<string | null>(null);

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

  const fetchSystemQa = React.useCallback(async () => {
    setQaLoading(true);
    setQaError(null);
    try {
      const res = await fetch("/api/system/qa-check", { cache: "no-store" });
      const data = (await res.json()) as PartialSystemQaResult | { message?: string };
      if (!res.ok) {
        throw new Error("message" in data && data.message ? data.message : "System QA failed.");
      }
      setQa(normalizeQaResult(data as PartialSystemQaResult));
    } catch (e) {
      setQaError(e instanceof Error ? e.message : "Failed to run System QA");
      setQa(null);
    } finally {
      setQaLoading(false);
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

  React.useEffect(() => {
    void fetchSystemQa();
  }, [fetchSystemQa]);

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

  const guardianFailed = result !== null && !result.ok;
  const healthWarning = health?.status === "warning";
  const overallStatus: HealthCheckStatus = guardianFailed
    ? "fail"
    : healthWarning
      ? "warning"
      : "ok";
  const summary = health?.summary;
  const apBillNames = new Set(summary?.apBills.map((check) => check.name) ?? []);
  const optionalWithoutAp =
    summary?.optionalTables.filter((check) => !apBillNames.has(check.name)) ?? undefined;
  const orphanedTaskCount = integrityCount(integrity?.orphanedTasks);
  const ghostTaskCount = integrityCount(integrity?.ghostTasks);
  const duplicateTaskCount = integrityCount(integrity?.duplicateTasks);
  const overdueNotCompletedCount = integrityCount(integrity?.overdueNotCompleted);
  const staleTaskCount = integrityCount(integrity?.staleTestData?.tasks);
  const staleProjectCount = integrityCount(integrity?.staleTestData?.projects);
  const staleTestDataCount = staleTaskCount + staleProjectCount;

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
      {guardianFailed && !loading ? (
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
      ) : healthWarning && !loading ? (
        <div className="flex items-start gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
          <span className="text-base leading-none">⚠</span>
          <div>
            <p className="font-medium">System warnings need review.</p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Core app checks are responding, but one or more health warnings need owner review.
              Optional modules are listed separately from critical failures.
            </p>
          </div>
        </div>
      ) : null}

      {/* Last refreshed + overall status */}
      {!loading && result && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2 font-medium">
            Overall: <HealthStatusLabel status={overallStatus} />
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

        {summary?.schemaDriftWarnings?.length ? (
          <div className="rounded-sm border border-border/70 bg-card px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Schema drift warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
              {summary.schemaDriftWarnings.map((warning) => (
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

      <SystemQaPanel
        qa={qa}
        loading={qaLoading}
        error={qaError}
        onRun={() => void fetchSystemQa()}
      />

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
                      <StatusLabel ok={orphanedTaskCount === 0} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {orphanedTaskCount > 0 ? (
                        <>
                          <span>{orphanedTaskCount} task(s) with missing project</span>
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
                      <StatusLabel ok={ghostTaskCount === 0} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {ghostTaskCount > 0 ? (
                        <>
                          <span>{ghostTaskCount} task(s) with no title</span>
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
                      <StatusLabel ok={duplicateTaskCount === 0} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {duplicateTaskCount > 0 ? (
                        <>
                          <span>{duplicateTaskCount} duplicate(s) in same project</span>
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
                      <StatusLabel ok={overdueNotCompletedCount === 0} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {overdueNotCompletedCount > 0
                        ? `${overdueNotCompletedCount} task(s) past due`
                        : "—"}
                    </td>
                  </tr>
                  <tr className={listTableRowStaticClassName}>
                    <td className="py-2.5 pr-6 font-medium">Stale test data</td>
                    <td className="py-2.5 pr-6">
                      <StatusLabel ok={staleTestDataCount === 0} />
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {staleTestDataCount > 0 ? (
                        <>
                          <span>
                            {staleTaskCount} task(s), {staleProjectCount} project(s)
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
