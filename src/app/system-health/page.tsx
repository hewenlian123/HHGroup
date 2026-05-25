"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  GitCommit,
  Globe2,
  Info,
  KeyRound,
  Layers3,
  RefreshCw,
  Route as RouteIcon,
  Server,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";

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
type IssueCategory = "actionRequired" | "optionalModule" | "dataCleanup" | "informational";

type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  message?: string;
  code?: string;
  category?: IssueCategory;
  href?: string;
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
  category?: IssueCategory;
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

type DataQualitySeverity = "info" | "warning" | "critical";
type DataQualityStatus = "ok" | "warning" | "critical";

type DataQualityIssue = {
  severity: DataQualitySeverity;
  module: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  issueCode: string;
  message: string;
  currentValue?: string | number | null;
  expectedValue?: string | number | null;
  recommendedAction: string;
  link?: string;
};

type DataQualityModuleSummary = {
  module: string;
  label: string;
  checked: number;
  critical: number;
  warning: number;
  info: number;
  status: DataQualityStatus;
};

type DataQualityResult = {
  ok: boolean;
  checkedAt: string;
  summary: {
    status: DataQualityStatus;
    critical: number;
    warning: number;
    info: number;
    totalIssues: number;
    returnedIssues: number;
    projectsChecked: number;
    expensesChecked: number;
    invoicesChecked: number;
    estimatesChecked: number;
    laborChecked: number;
    reimbursementsChecked: number;
    companyProfileChecked: number;
  };
  modules: DataQualityModuleSummary[];
  issues: DataQualityIssue[];
};

type IntegrityScanStatus = "pass" | "warning" | "fail";
type IntegrityScanSeverity = "info" | "low" | "medium" | "high" | "critical";

type IntegrityScanIssue = {
  severity: IntegrityScanSeverity;
  category:
    | "test_marker"
    | "orphan_relation"
    | "dependency_risk"
    | "financial_mismatch"
    | "production_safety";
  table: string;
  id: string;
  message: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  autoFixAvailable: false;
};

type IntegrityScanSection = {
  id: string;
  title: string;
  status: IntegrityScanStatus;
  issues: IntegrityScanIssue[];
};

type IntegrityScanResult = {
  status: IntegrityScanStatus;
  generatedAt: string;
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  sections: IntegrityScanSection[];
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
                category:
                  check.category === "actionRequired" ||
                  check.category === "optionalModule" ||
                  check.category === "dataCleanup" ||
                  check.category === "informational"
                    ? check.category
                    : undefined,
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

function qaStatusToHealthStatus(status?: SystemQaStatus): HealthCheckStatus {
  if (status === "critical") return "fail";
  if (status === "warning") return "warning";
  return "ok";
}

function healthStatusLabel(status: HealthCheckStatus, options?: { executive?: boolean }): string {
  if (status === "ok") return options?.executive ? "Healthy" : "OK";
  if (status === "warning") return "Warning";
  return options?.executive ? "Critical" : "Failed";
}

type StatusPillVariant = "default" | "calm" | "hero";

function statusToneClasses(
  status: HealthCheckStatus,
  variant: StatusPillVariant = "default"
): {
  pill: string;
  dot: string;
  text: string;
  border: string;
  glow: string;
} {
  if (status === "fail") {
    return {
      pill:
        variant === "calm"
          ? "border-red-400/28 bg-red-500/[0.08] text-red-200"
          : "border-red-400/38 bg-red-500/[0.10] text-red-200",
      dot: "bg-red-300",
      text: "text-red-200",
      border: "border-red-400/28",
      glow: "shadow-[0_16px_34px_rgba(0,0,0,0.20)]",
    };
  }
  if (status === "warning") {
    return {
      pill:
        variant === "calm"
          ? "border-[rgb(198_165_106_/_0.32)] bg-[rgb(198_165_106_/_0.08)] text-[#F4E6C5]"
          : "border-[rgb(198_165_106_/_0.42)] bg-[rgb(198_165_106_/_0.11)] text-[#F4E6C5]",
      dot: "bg-[#C6A56A]",
      text: "text-amber-100",
      border: "border-[rgb(198_165_106_/_0.30)]",
      glow: "shadow-[0_16px_34px_rgba(0,0,0,0.20)]",
    };
  }
  return {
    pill:
      variant === "calm"
        ? "border-emerald-300/16 bg-emerald-300/[0.045] text-emerald-100/72"
        : "border-emerald-300/30 bg-emerald-400/[0.085] text-emerald-100",
    dot: variant === "calm" ? "bg-emerald-300/60" : "bg-emerald-300",
    text: "text-emerald-100",
    border: "border-emerald-300/22",
    glow: "shadow-[0_16px_34px_rgba(0,0,0,0.18)]",
  };
}

function StatusPill({
  status,
  label,
  compact = false,
  variant = "default",
}: {
  status: HealthCheckStatus;
  label?: string;
  compact?: boolean;
  variant?: StatusPillVariant;
}) {
  const tone = statusToneClasses(status, variant);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border font-medium ${tone.pill} ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1.5 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {label ?? healthStatusLabel(status)}
    </span>
  );
}

function QaStatusLabel({ status }: { status: SystemQaStatus }) {
  return (
    <StatusPill
      status={qaStatusToHealthStatus(status)}
      label={status === "pass" ? "Pass" : status === "warning" ? "Warning" : "Critical"}
      compact
      variant={status === "pass" ? "calm" : "default"}
    />
  );
}

function HealthStatusLabel({ status }: { status: HealthCheckStatus }) {
  return <StatusPill status={status} compact variant={status === "ok" ? "calm" : "default"} />;
}

function QaSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">{value}</p>
    </div>
  );
}

function DataQualityStatusLabel({ status }: { status: DataQualityStatus }) {
  return (
    <HealthStatusLabel
      status={status === "ok" ? "ok" : status === "warning" ? "warning" : "fail"}
    />
  );
}

function dataQualityStatusToHealthStatus(
  status: DataQualityStatus | DataQualitySeverity
): HealthCheckStatus | "info" {
  if (status === "critical") return "fail";
  if (status === "warning") return "warning";
  if (status === "info") return "info";
  return "ok";
}

function dataQualityPriority(status: DataQualityStatus | DataQualitySeverity): number {
  if (status === "critical") return 0;
  if (status === "warning") return 1;
  if (status === "info") return 2;
  return 3;
}

function integrityScanStatusToHealthStatus(status?: IntegrityScanStatus): HealthCheckStatus {
  if (status === "fail") return "fail";
  if (status === "warning") return "warning";
  return "ok";
}

function integrityScanSeverityToRowStatus(severity: IntegrityScanSeverity): DetailRowStatus {
  if (severity === "critical" || severity === "high") return "fail";
  if (severity === "medium" || severity === "low") return "warning";
  return "info";
}

function formatEvidenceSummary(evidence: Record<string, unknown>): string {
  const entries = Object.entries(evidence).slice(0, 3);
  if (entries.length === 0) return "No evidence details.";
  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} item(s)`;
      if (value && typeof value === "object")
        return `${key}: ${JSON.stringify(value).slice(0, 120)}`;
      return `${key}: ${String(value)}`;
    })
    .join(" · ");
}

function integrityScanRows(scan?: IntegrityScanResult | null): HealthDetailRowData[] | undefined {
  if (!scan) return undefined;
  return scan.sections
    .flatMap((section) =>
      section.issues.map((issue) => ({
        id: `${section.id}:${issue.table}:${issue.id}:${issue.category}`,
        name: `${issue.table} / ${issue.id}`,
        status: integrityScanSeverityToRowStatus(issue.severity),
        message: `${issue.message} ${issue.recommendedAction}`,
        code: issue.category,
        meta: `${section.title} · ${formatEvidenceSummary(issue.evidence)}`,
      }))
    )
    .slice(0, 10);
}

function DataQualityPanel({
  dataQuality,
  loading,
  error,
  onRun,
}: {
  dataQuality: DataQualityResult | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const summary = dataQuality?.summary;
  const modules = dataQuality?.modules ?? [];
  const issues = dataQuality?.issues ?? [];
  const sortedModules = [...modules].sort(
    (a, b) => dataQualityPriority(a.status) - dataQualityPriority(b.status)
  );
  const sortedIssues = [...issues].sort(
    (a, b) => dataQualityPriority(a.severity) - dataQualityPriority(b.severity)
  );

  return (
    <div className="guardian-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Supabase Data / Number Check</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Read-only checks for obvious amount, contract, invoice, expense, labor, reimbursement,
            and company profile data problems. It never updates records or runs migrations.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
          onClick={onRun}
          disabled={loading}
        >
          {loading ? "Checking…" : "Run Number Check"}
        </Button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : loading && !dataQuality ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking Supabase data safely…</p>
      ) : dataQuality && summary ? (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-2 font-medium">
              Overall: <DataQualityStatusLabel status={summary.status} />
            </span>
            <span className="text-xs text-muted-foreground">
              Checked{" "}
              {new Date(dataQuality.checkedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QaSummaryCard label="Critical" value={summary.critical} />
            <QaSummaryCard label="Warnings" value={summary.warning} />
            <QaSummaryCard label="Info" value={summary.info} />
            <QaSummaryCard label="Issues found" value={summary.totalIssues} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <QaSummaryCard label="Projects checked" value={summary.projectsChecked} />
            <QaSummaryCard label="Expenses checked" value={summary.expensesChecked} />
            <QaSummaryCard label="Invoices checked" value={summary.invoicesChecked} />
            <QaSummaryCard label="Estimates checked" value={summary.estimatesChecked} />
            <QaSummaryCard label="Labor checked" value={summary.laborChecked} />
            <QaSummaryCard label="Reimbursements checked" value={summary.reimbursementsChecked} />
          </div>

          <div className="airtable-table-wrap airtable-table-wrap--ruled">
            <div className="airtable-table-scroll">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Module
                    </th>
                    <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Status
                    </th>
                    <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Checked
                    </th>
                    <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Issues
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModules.map((module) => {
                    const rowStatus = dataQualityStatusToHealthStatus(module.status);
                    const tone = detailRowTone(rowStatus);
                    return (
                      <tr
                        key={module.module}
                        className={`guardian-command-row border-b transition duration-150 ${tone.row} last:border-0`}
                      >
                        <td
                          className={`border-l-2 py-2.5 pl-3 pr-6 font-medium ${tone.accent} ${tone.title}`}
                        >
                          {module.label}
                        </td>
                        <td className="py-2.5 pr-6">
                          <DataQualityStatusLabel status={module.status} />
                        </td>
                        <td className={`py-2.5 pr-6 text-xs ${tone.detail}`}>{module.checked}</td>
                        <td className={`py-2.5 text-xs ${tone.detail}`}>
                          {module.critical} critical · {module.warning} warning · {module.info} info
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-border/60 pt-5">
            <h3 className="mb-3 text-sm font-medium text-foreground">Top issues</h3>
            <div className="airtable-table-wrap airtable-table-wrap--ruled">
              <div className="airtable-table-scroll">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Issue
                      </th>
                      <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Severity
                      </th>
                      <th className="h-8 px-3 py-0 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Current / Expected
                      </th>
                      <th className="h-8 px-3 py-0 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Recommended action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          No data quality issues found.
                        </td>
                      </tr>
                    ) : (
                      sortedIssues.map((issue) => {
                        const rowStatus = dataQualityStatusToHealthStatus(issue.severity);
                        const tone = detailRowTone(rowStatus);
                        return (
                          <tr
                            key={`${issue.issueCode}:${issue.entityId ?? issue.entityName ?? issue.module}`}
                            className={`guardian-command-row border-b transition duration-150 ${tone.row} last:border-0`}
                          >
                            <td className={`border-l-2 py-2.5 pl-3 pr-6 ${tone.accent}`}>
                              <span className={`block font-medium ${tone.title}`}>
                                {issue.link ? (
                                  <Link
                                    href={issue.link}
                                    className="no-underline underline-offset-4 hover:underline"
                                  >
                                    {issue.entityName ?? issue.issueCode}
                                  </Link>
                                ) : (
                                  (issue.entityName ?? issue.issueCode)
                                )}
                              </span>
                              <span className={`block text-xs ${tone.detail}`}>
                                {issue.message}
                              </span>
                              <span className="mt-1 inline-flex">
                                <CodeBadge value={issue.issueCode} status={rowStatus} />
                              </span>
                            </td>
                            <td className="py-2.5 pr-6 text-xs capitalize">
                              <DetailStatusPill status={rowStatus} />
                            </td>
                            <td className={`py-2.5 pr-6 text-xs ${tone.detail}`}>
                              <span className="block">
                                Current:{" "}
                                {issue.currentValue == null ? "n/a" : String(issue.currentValue)}
                              </span>
                              <span className="block">
                                Expected:{" "}
                                {issue.expectedValue == null ? "n/a" : String(issue.expectedValue)}
                              </span>
                            </td>
                            <td className={`py-2.5 text-xs ${tone.detail}`}>
                              {issue.recommendedAction}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Run the number check to inspect Supabase data safely.
        </p>
      )}
    </div>
  );
}

function qaCheckPresentationStatus(check: SystemQaCheck): DetailRowStatus {
  if (check.category === "optionalModule" || check.category === "informational") return "info";
  return qaStatusToHealthStatus(check.status);
}

function sortedQaChecks(checks: SystemQaCheck[]): SystemQaCheck[] {
  return [...checks].sort((a, b) => {
    const byStatus =
      healthStatusPriority(qaCheckPresentationStatus(a)) -
      healthStatusPriority(qaCheckPresentationStatus(b));
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name);
  });
}

function SystemQaSectionTable({ section }: { section: SystemQaSection }) {
  const checks = sortedQaChecks(section.checks);
  const passCount = section.checks.filter((check) => check.status === "pass").length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{section.name}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {passCount} / {section.checks.length} checks passed
          </p>
        </div>
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
              {checks.map((check) => {
                const rowStatus = qaCheckPresentationStatus(check);
                const tone = detailRowTone(rowStatus);
                return (
                  <tr
                    key={check.id}
                    className={`guardian-command-row border-b transition duration-150 ${tone.row} last:border-0`}
                  >
                    <td
                      className={`border-l-2 py-2.5 pl-3 pr-6 font-medium ${tone.accent} ${tone.title}`}
                    >
                      {check.name}
                    </td>
                    <td className="py-2.5 pr-6">
                      <DetailStatusPill status={rowStatus} />
                    </td>
                    <td className={`py-2.5 pr-6 text-xs ${tone.detail}`}>
                      {check.page ? (
                        <CodePath value={check.page} href={check.page} />
                      ) : (
                        <CodeBadge value={check.type} status={rowStatus} />
                      )}
                    </td>
                    <td className={`py-2.5 text-xs leading-5 ${tone.detail}`}>
                      <span className="block">{check.message}</span>
                      {check.recommendedAction ? (
                        <span className="mt-1 block text-slate-200/75">
                          {check.recommendedAction}
                        </span>
                      ) : null}
                      {check.diagnosticCode ? (
                        <span className="mt-1 inline-flex">
                          <CodeBadge value={check.diagnosticCode} status={rowStatus} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
    <div className="guardian-panel p-4 sm:p-5">
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

function isOptionalModuleCheck(check?: HealthCheck | null): boolean {
  return check?.category === "optionalModule" || check?.code === "optional_module_disabled";
}

function isInformationalCheck(check?: HealthCheck | null): boolean {
  return check?.category === "informational";
}

function isActionableHealthCheck(check?: HealthCheck | null): boolean {
  return Boolean(
    check && check.status !== "ok" && !isOptionalModuleCheck(check) && !isInformationalCheck(check)
  );
}

function uniqueHealthChecks(checks: HealthCheck[]): HealthCheck[] {
  const seen = new Set<string>();
  const unique: HealthCheck[] = [];
  for (const check of checks) {
    const key = `${check.name}:${check.code ?? ""}:${check.message ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(check);
  }
  return unique;
}

type DetailRowStatus = HealthCheckStatus | "info";

type HealthDetailRowData = {
  id: string;
  name: string;
  status: DetailRowStatus;
  message?: string;
  code?: string;
  href?: string;
  meta?: string;
  action?: React.ReactNode;
};

type ActiveIssue = {
  id: string;
  title: string;
  status: "fail" | "warning";
  message: string;
  href?: string;
  meta?: string;
};

function healthStatusPriority(status: DetailRowStatus): number {
  if (status === "fail") return 0;
  if (status === "warning") return 1;
  if (status === "info") return 2;
  return 3;
}

function sortedDetailRows(rows: HealthDetailRowData[]): HealthDetailRowData[] {
  return [...rows].sort((a, b) => {
    const byStatus = healthStatusPriority(a.status) - healthStatusPriority(b.status);
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name);
  });
}

function worstHealthStatus(checks: HealthCheck[], fallback: HealthCheckStatus = "ok") {
  if (checks.length === 0) return fallback;
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning" && isActionableHealthCheck(check))) {
    return "warning";
  }
  return "ok";
}

function countOk(checks: HealthCheck[]): { ok: number; total: number } {
  return {
    ok: checks.filter((check) => check.status === "ok").length,
    total: checks.length,
  };
}

function formatCount(count?: { ok: number; total: number } | null): string | undefined {
  if (!count || count.total === 0) return undefined;
  return `${count.ok} / ${count.total} OK`;
}

function formatBlockedRouteCount(
  section?: SystemQaSection | null,
  fallbackLabel = "routes blocked"
): string | undefined {
  if (!section || section.checks.length === 0) return undefined;
  const pass = section.checks.filter((check) => check.status === "pass").length;
  return `${pass} / ${section.checks.length} ${fallbackLabel}`;
}

function shortCommit(commit?: string | null): string {
  return commit ? commit.slice(0, 7) : "n/a";
}

function formatCheckedAt(value?: string | Date | null): string {
  if (!value) return "Checking...";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Checking...";
  return date.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function checkToDetailRow(check: HealthCheck, fallbackId?: string): HealthDetailRowData {
  return {
    id: fallbackId ?? `${check.name}:${check.code ?? ""}:${check.message ?? ""}`,
    name: check.name,
    status: isOptionalModuleCheck(check) || isInformationalCheck(check) ? "info" : check.status,
    message: check.message,
    code: check.code,
    href: check.href,
    meta: isOptionalModuleCheck(check) ? "Optional module" : undefined,
  };
}

function qaCheckToDetailRow(check: SystemQaCheck, sectionId: string): HealthDetailRowData {
  return {
    id: `${sectionId}:${check.id}`,
    name: check.name,
    status:
      check.category === "optionalModule" || check.category === "informational"
        ? "info"
        : qaStatusToHealthStatus(check.status),
    message: check.message,
    code: check.diagnosticCode,
    href: check.page,
    meta: check.type,
  };
}

function isCodePathValue(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.includes("_") ||
    value.startsWith("GET ") ||
    /^[a-z0-9./:-]+$/.test(value)
  );
}

function isDiagnosticCode(value: string): boolean {
  return /^[a-z0-9_:-]+$/i.test(value) && !value.includes(" ");
}

function CodeBadge({ value, status = "info" }: { value: string; status?: DetailRowStatus }) {
  const tone =
    status === "fail"
      ? "border-red-300/25 bg-red-400/[0.09] text-red-100"
      : status === "warning"
        ? "border-amber-300/25 bg-amber-300/[0.1] text-amber-100"
        : status === "ok"
          ? "border-emerald-300/14 bg-emerald-300/[0.045] text-emerald-100/70"
          : "border-[rgb(198_165_106_/_0.20)] bg-[rgb(198_165_106_/_0.07)] text-slate-200/78";

  return (
    <code
      className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4 ${tone}`}
    >
      <span className="truncate">{value}</span>
    </code>
  );
}

function CodePath({ value, href }: { value: string; href?: string }) {
  const className =
    "inline-flex max-w-full items-center rounded-md border border-[rgb(198_165_106_/_0.16)] bg-white/[0.045] px-2 py-1 font-mono text-[11px] leading-4 text-slate-200/78 no-underline transition hover:border-[rgb(198_165_106_/_0.34)] hover:bg-[rgb(198_165_106_/_0.08)] hover:text-slate-50";
  const content = <span className="break-all">{value}</span>;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <span className={className}>{content}</span>;
}

function detailRowTone(status: DetailRowStatus): {
  row: string;
  accent: string;
  title: string;
  detail: string;
} {
  if (status === "fail") {
    return {
      row: "border-red-300/14 bg-red-500/[0.025] hover:bg-red-400/[0.055] hover:shadow-[inset_0_0_0_1px_rgba(248,113,113,0.12)]",
      accent: "border-red-300/55",
      title: "text-red-50",
      detail: "text-red-100/78",
    };
  }
  if (status === "warning") {
    return {
      row: "border-amber-300/14 bg-amber-400/[0.025] hover:bg-amber-300/[0.055] hover:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]",
      accent: "border-amber-300/60",
      title: "text-amber-50",
      detail: "text-amber-100/80",
    };
  }
  if (status === "info") {
    return {
      row: "border-[rgb(198_165_106_/_0.10)] hover:bg-[rgb(198_165_106_/_0.045)]",
      accent: "border-[rgb(198_165_106_/_0.26)]",
      title: "text-slate-100/90",
      detail: "text-slate-300/82",
    };
  }
  return {
    row: "border-white/[0.045] hover:bg-white/[0.035]",
    accent: "border-transparent",
    title: "text-slate-200",
    detail: "text-slate-400",
  };
}

function DetailStatusPill({ status }: { status: DetailRowStatus }) {
  if (status === "info") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgb(198_165_106_/_0.20)] bg-[rgb(198_165_106_/_0.07)] px-1.5 py-0.5 text-[10px] font-medium text-slate-200/76">
        <span className="h-1.5 w-1.5 rounded-full bg-[#C6A56A]/70" />
        Info
      </span>
    );
  }
  return <StatusPill status={status} compact variant={status === "ok" ? "calm" : "default"} />;
}

function GuardianScanLine() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
      <span className="guardian-scan-line block h-px w-1/2 bg-gradient-to-r from-transparent via-[#C6A56A]/55 to-transparent" />
    </div>
  );
}

function GuardianRefreshLine({ status }: { status: HealthCheckStatus }) {
  const tone =
    status === "fail"
      ? "from-red-400 via-red-200 to-red-400"
      : status === "warning"
        ? "from-[#C6A56A] via-[#F4E6C5] to-[#C6A56A]"
        : "from-emerald-300 via-[#C6A56A] to-emerald-300";

  return (
    <div className="guardian-refresh-line absolute inset-x-5 bottom-4 h-px overflow-hidden rounded-full bg-white/10">
      <span className={`block h-full bg-gradient-to-r ${tone}`} />
    </div>
  );
}

function StatusOrb({ status }: { status: HealthCheckStatus }) {
  const score = status === "ok" ? "100" : status === "warning" ? "72" : "28";
  const ring =
    status === "fail"
      ? "from-red-400 via-red-300 to-zinc-800"
      : status === "warning"
        ? "from-[#C6A56A] via-[#F4E6C5] to-zinc-900"
        : "from-emerald-300 via-[#C6A56A] to-zinc-900";

  return (
    <div
      className={`relative grid h-28 w-28 shrink-0 place-items-center rounded-full bg-gradient-to-br ${ring} p-px shadow-[0_18px_40px_rgba(0,0,0,0.32)] sm:h-32 sm:w-32`}
      aria-hidden="true"
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-white/10 bg-[#0B0D12]">
        <div className="text-center">
          <p className="text-3xl font-semibold tabular-nums text-slate-50">{score}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#C6A56A]/75">
            health
          </p>
        </div>
      </div>
    </div>
  );
}

function HealthHero({
  overallStatus,
  checkedAt,
  cadenceSeconds,
  environment,
  onRefresh,
  disabled,
  refreshing,
}: {
  overallStatus: HealthCheckStatus;
  checkedAt?: string | Date | null;
  cadenceSeconds: number;
  environment?: SystemHealthResult["environment"];
  onRefresh: () => void;
  disabled: boolean;
  refreshing: boolean;
}) {
  const tone = statusToneClasses(overallStatus);
  const environmentLabel = environment?.vercelEnv ?? environment?.nodeEnv ?? "local";

  return (
    <section className={`guardian-hero relative overflow-hidden rounded-2xl border ${tone.border}`}>
      <GuardianScanLine />
      <div className="relative z-10 grid gap-5 p-4 pb-10 sm:p-5 sm:pb-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-6 lg:pb-11">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-[rgb(198_165_106_/_0.24)] bg-[rgb(198_165_106_/_0.08)] px-3 text-xs font-medium uppercase tracking-[0.08em] text-[#F4E6C5]">
              <Activity className="h-3.5 w-3.5" />
              Command Center
            </span>
            <StatusPill
              status={overallStatus}
              label={healthStatusLabel(overallStatus, { executive: true })}
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-50 sm:text-4xl">
            System Guardian
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Production health, data reachability, route availability, and safety guards.
          </p>

          <div className="mt-5 grid gap-2 text-xs text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
            <div className="guardian-hero-metric">
              <span className="text-slate-400/85">Overall Status</span>
              <span className={tone.text}>
                {healthStatusLabel(overallStatus, { executive: true })}
              </span>
            </div>
            <div className="guardian-hero-metric">
              <span className="text-slate-400/85">Last Checked</span>
              <span>{formatCheckedAt(checkedAt)}</span>
            </div>
            <div className="guardian-hero-metric">
              <span className="text-slate-400/85">Auto Refresh</span>
              <span>{cadenceSeconds}s cadence</span>
            </div>
            <div className="guardian-hero-metric">
              <span className="text-slate-400/85">Environment</span>
              <span className="truncate">{environmentLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col">
          <StatusOrb status={overallStatus} />
          <div className="grid min-w-[12rem] gap-2">
            <div className="guardian-hero-metric">
              <span className="inline-flex items-center gap-1.5 text-slate-400/85">
                <GitCommit className="h-3.5 w-3.5" />
                Commit
              </span>
              <code className="font-mono text-xs text-[#F4E6C5]">
                {shortCommit(environment?.commit)}
              </code>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] border-[rgb(198_165_106_/_0.28)] bg-[rgb(198_165_106_/_0.08)] text-slate-50 hover:border-[rgb(198_165_106_/_0.46)] hover:bg-[rgb(198_165_106_/_0.12)]"
              onClick={onRefresh}
              disabled={disabled}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Checking..." : "Refresh Now"}
            </Button>
          </div>
        </div>
      </div>
      <GuardianRefreshLine status={overallStatus} />
    </section>
  );
}

function HealthSummaryCard({
  title,
  status,
  summary,
  count,
  icon: Icon,
}: {
  title: string;
  status: HealthCheckStatus;
  summary: string;
  count?: string;
  icon: LucideIcon;
}) {
  const tone = statusToneClasses(status);
  return (
    <div
      className={`group rounded-xl border border-white/10 bg-white/[0.035] p-4 transition duration-200 hover:border-[rgb(198_165_106_/_0.26)] hover:bg-white/[0.045] ${tone.glow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(198_165_106_/_0.18)] bg-[rgb(198_165_106_/_0.08)] text-[#F4E6C5]">
          <Icon className="h-4 w-4" />
        </div>
        <StatusPill status={status} compact />
      </div>
      <div className="mt-4 min-w-0">
        <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">{summary}</p>
        {count ? <p className="mt-3 font-mono text-xs text-[#F4E6C5]/80">{count}</p> : null}
      </div>
    </div>
  );
}

function ActiveIssuesPanel({
  issues,
  optionalModules,
}: {
  issues: ActiveIssue[];
  optionalModules: HealthCheck[];
}) {
  const critical = issues.filter((issue) => issue.status === "fail");
  const warnings = issues.filter((issue) => issue.status === "warning");

  return (
    <section className="guardian-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-50">Active Issues</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Critical alerts surface first; optional modules stay informational.
          </p>
        </div>
        <StatusPill
          status={critical.length ? "fail" : warnings.length ? "warning" : "ok"}
          label={critical.length ? "Critical" : warnings.length ? "Warning" : "Clear"}
        />
      </div>

      {issues.length === 0 ? (
        <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/8 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
            <div>
              <p className="text-sm font-medium text-emerald-50">No active issues</p>
              <p className="mt-1 text-xs leading-5 text-emerald-100/75">
                Guardian found no blocking problems in production.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {[...critical, ...warnings].map((issue) => {
            const tone = statusToneClasses(issue.status);
            const metaIsCode = issue.meta ? isDiagnosticCode(issue.meta) : false;
            return (
              <div
                key={issue.id}
                className={`relative overflow-hidden rounded-xl border ${tone.border} bg-white/[0.035] p-3 transition duration-150 hover:bg-white/[0.05] ${tone.glow}`}
              >
                <span
                  className={`absolute inset-y-3 left-0 w-px ${
                    issue.status === "fail" ? "bg-red-300/65" : "bg-amber-300/65"
                  }`}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-50">
                      {issue.href ? (
                        <Link
                          href={issue.href}
                          className="no-underline underline-offset-4 hover:underline"
                        >
                          {issue.title}
                        </Link>
                      ) : (
                        issue.title
                      )}
                    </p>
                    <p
                      className={`mt-1 text-xs leading-5 ${
                        issue.status === "fail" ? "text-red-100/78" : "text-amber-100/82"
                      }`}
                    >
                      {issue.message}
                    </p>
                    {issue.meta ? (
                      <div className="mt-2">
                        {metaIsCode ? (
                          <CodeBadge value={issue.meta} status={issue.status} />
                        ) : (
                          <span className="inline-flex rounded-md border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] text-slate-300/75">
                            {issue.meta}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <StatusPill status={issue.status} compact />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {optionalModules.length ? (
        <div className="mt-4 rounded-xl border border-[rgb(198_165_106_/_0.16)] bg-[rgb(198_165_106_/_0.07)] p-3 text-xs leading-5 text-slate-200/80">
          <span className="font-medium text-slate-50">Informational modules:</span>{" "}
          {optionalModules.map((check) => check.name).join(", ")}
        </div>
      ) : null}
    </section>
  );
}

function HealthDetailRow({ row }: { row: HealthDetailRowData }) {
  const tone = detailRowTone(row.status);
  const showCodePath = isCodePathValue(row.name);

  return (
    <tr
      className={`guardian-command-row border-b transition duration-150 ${tone.row} last:border-0`}
    >
      <td className={`border-l-2 py-3 pl-3 pr-4 align-top ${tone.accent}`}>
        <div className="min-w-0">
          {showCodePath ? (
            <CodePath value={row.name} href={row.href} />
          ) : (
            <>
              <span className={`text-sm font-medium ${tone.title}`}>{row.name}</span>
              {row.href ? (
                <span className="mt-1 block">
                  <CodePath value={row.href} href={row.href} />
                </span>
              ) : null}
            </>
          )}
          {row.meta ? <p className="mt-1 text-[11px] text-slate-500">{row.meta}</p> : null}
        </div>
      </td>
      <td className="py-3 pr-4 align-top">
        <DetailStatusPill status={row.status} />
      </td>
      <td className={`py-3 align-top text-xs leading-5 ${tone.detail}`}>
        {row.message ?? row.code ?? "-"}
        {row.code ? (
          <span className="ml-2 inline-flex align-middle">
            <CodeBadge value={row.code} status={row.status} />
          </span>
        ) : null}
        {row.action ? <div className="mt-2">{row.action}</div> : null}
      </td>
    </tr>
  );
}

function HealthDetailCard({ row }: { row: HealthDetailRowData }) {
  const tone = detailRowTone(row.status);
  const showCodePath = isCodePathValue(row.name);

  return (
    <div
      className={`rounded-xl border bg-white/[0.028] p-3 transition duration-150 ${tone.row} ${row.status === "warning" ? "shadow-[inset_2px_0_0_rgba(251,191,36,0.45)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showCodePath ? (
            <CodePath value={row.name} href={row.href} />
          ) : (
            <>
              <p className={`break-words text-sm font-medium ${tone.title}`}>{row.name}</p>
              {row.href ? (
                <span className="mt-1 block">
                  <CodePath value={row.href} href={row.href} />
                </span>
              ) : null}
            </>
          )}
          {row.meta ? <p className="mt-1 text-[11px] text-slate-500">{row.meta}</p> : null}
        </div>
        <DetailStatusPill status={row.status} />
      </div>
      <p className={`mt-3 text-xs leading-5 ${tone.detail}`}>{row.message ?? row.code ?? "-"}</p>
      {row.code ? (
        <span className="mt-2 inline-flex">
          <CodeBadge value={row.code} status={row.status} />
        </span>
      ) : null}
      {row.action ? <div className="mt-3">{row.action}</div> : null}
    </div>
  );
}

function HealthDetailTable({
  rows,
  loading,
  emptyMessage = "No checks configured.",
}: {
  rows?: HealthDetailRowData[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading && !rows) {
    return <p className="px-4 pb-4 text-sm text-slate-400">Checking...</p>;
  }

  const sortedRows = sortedDetailRows(rows ?? []);
  if (sortedRows.length === 0) {
    return <p className="px-4 pb-4 text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="grid gap-3 px-4 pb-4 sm:hidden">
        {sortedRows.map((row) => (
          <HealthDetailCard key={row.id} row={row} />
        ))}
      </div>
      <div className="hidden max-w-full overflow-hidden px-4 pb-4 sm:block">
        <div className="guardian-table-shell overflow-x-auto">
          <table className="guardian-detail-table w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="h-9 px-3 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  Check
                </th>
                <th className="h-9 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  Status
                </th>
                <th className="h-9 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <HealthDetailRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function HealthSection({
  title,
  icon: Icon,
  status,
  count,
  description,
  defaultOpen,
  children,
}: {
  title: string;
  icon: LucideIcon;
  status: HealthCheckStatus;
  count?: string;
  description?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const tone = statusToneClasses(status, status === "ok" ? "calm" : "default");

  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <details
      className={`guardian-panel group/section overflow-hidden transition duration-200 hover:border-[rgb(198_165_106_/_0.22)] ${tone.glow}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-[rgb(198_165_106_/_0.045)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(198_165_106_/_0.55)] sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(198_165_106_/_0.18)] bg-[rgb(198_165_106_/_0.08)] text-[#F4E6C5]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <span className="text-sm font-semibold text-slate-50">{title}</span>
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
          ) : null}
        </span>
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          {count ? (
            <span className="rounded-md border border-[rgb(198_165_106_/_0.14)] bg-white/[0.045] px-2 py-1 font-mono text-[11px] text-slate-200/74">
              {count}
            </span>
          ) : null}
          <StatusPill status={status} compact variant={status === "ok" ? "calm" : "default"} />
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition details-chevron" />
      </summary>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:hidden">
        {count ? (
          <span className="rounded-md border border-[rgb(198_165_106_/_0.14)] bg-white/[0.045] px-2 py-1 font-mono text-[11px] text-slate-200/74">
            {count}
          </span>
        ) : null}
        <StatusPill status={status} compact variant={status === "ok" ? "calm" : "default"} />
      </div>
      {children}
    </details>
  );
}

function MetadataGrid({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
            {row.label}
          </p>
          <div className="mt-1 min-w-0 text-sm text-slate-100">{row.value}</div>
        </div>
      ))}
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
  const [dataQuality, setDataQuality] = React.useState<DataQualityResult | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = React.useState(false);
  const [dataQualityError, setDataQualityError] = React.useState<string | null>(null);
  const [integrityScan, setIntegrityScan] = React.useState<IntegrityScanResult | null>(null);
  const [integrityScanLoading, setIntegrityScanLoading] = React.useState(false);
  const [integrityScanError, setIntegrityScanError] = React.useState<string | null>(null);

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

  const fetchDataQuality = React.useCallback(async () => {
    setDataQualityLoading(true);
    setDataQualityError(null);
    try {
      const res = await fetch("/api/system/data-quality-check", { cache: "no-store" });
      const data = (await res.json()) as DataQualityResult | { message?: string };
      if (!res.ok) {
        throw new Error(
          "message" in data && data.message ? data.message : "Data quality check failed."
        );
      }
      setDataQuality(data as DataQualityResult);
    } catch (e) {
      setDataQualityError(e instanceof Error ? e.message : "Failed to run number check");
      setDataQuality(null);
    } finally {
      setDataQualityLoading(false);
    }
  }, []);

  const fetchIntegrityScan = React.useCallback(async () => {
    setIntegrityScanLoading(true);
    setIntegrityScanError(null);
    try {
      const res = await fetch("/api/system/integrity-scan", { cache: "no-store" });
      const data = (await res.json()) as IntegrityScanResult | { message?: string };
      if (!res.ok) {
        throw new Error(
          "message" in data && data.message ? data.message : "Integrity scanner failed."
        );
      }
      setIntegrityScan(data as IntegrityScanResult);
    } catch (e) {
      setIntegrityScanError(e instanceof Error ? e.message : "Failed to run integrity scanner");
      setIntegrityScan(null);
    } finally {
      setIntegrityScanLoading(false);
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
        await Promise.all([
          fetchSystemHealth(),
          fetchGuardian(),
          fetchIntegrity(),
          fetchIntegrityScan(),
        ]);
      } finally {
        if (isManual) setRefreshing(false);
      }
    },
    [fetchGuardian, fetchIntegrity, fetchIntegrityScan, fetchSystemHealth]
  );

  // Initial load
  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    void fetchSystemQa();
  }, [fetchSystemQa]);

  React.useEffect(() => {
    void fetchDataQuality();
  }, [fetchDataQuality]);

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
  const healthChecks = summary
    ? [
        summary.app,
        summary.supabase,
        summary.companyProfile,
        summary.pin,
        summary.projectFinancialSnapshot,
        ...summary.requiredTables,
        ...summary.optionalTables,
        ...summary.storageBuckets,
      ]
    : [];
  const criticalIssues = uniqueHealthChecks(
    healthChecks.filter((check) => check.status === "fail")
  );
  const needsAttention = uniqueHealthChecks(
    healthChecks.filter((check) => check.status === "warning" && isActionableHealthCheck(check))
  );
  const optionalModules = uniqueHealthChecks(healthChecks.filter(isOptionalModuleCheck));
  const informationalItems = uniqueHealthChecks(
    (summary?.schemaDriftWarnings ?? []).map((message) => ({
      name: "Schema comparison",
      status: "ok" as const,
      category: "informational" as const,
      message,
      code: "schema_drift_info",
    }))
  );
  const orphanedTaskCount = integrityCount(integrity?.orphanedTasks);
  const ghostTaskCount = integrityCount(integrity?.ghostTasks);
  const duplicateTaskCount = integrityCount(integrity?.duplicateTasks);
  const overdueNotCompletedCount = integrityCount(integrity?.overdueNotCompleted);
  const staleTaskCount = integrityCount(integrity?.staleTestData?.tasks);
  const staleProjectCount = integrityCount(integrity?.staleTestData?.projects);
  const staleTestDataCount = staleTaskCount + staleProjectCount;
  const cadenceSeconds = REFRESH_INTERVAL_MS / 1000;
  const displayCheckedAt = lastRefreshed ?? health?.checkedAt ?? summary?.checkedAt ?? null;
  const dataLayerChecks = summary
    ? [summary.projectFinancialSnapshot, ...summary.requiredTables]
    : [];
  const supabaseChecks = summary ? [summary.supabase, ...summary.storageBuckets] : [];
  const routeCheckRows: HealthDetailRowData[] | undefined = result?.checks.map((check) => ({
    id: check.name,
    name: check.name,
    status: check.ok ? "ok" : "fail",
    message: check.ok ? "Reachable" : (check.error ?? "Check failed"),
    meta: check.name.startsWith("/") ? "route" : "module",
  }));
  const routeStatus: HealthCheckStatus = result
    ? result.ok
      ? "ok"
      : "fail"
    : loading
      ? "ok"
      : "warning";
  const routeCount = result
    ? {
        ok: result.checks.filter((check) => check.ok).length,
        total: result.checks.length,
      }
    : null;
  const coreHealthChecks = summary
    ? [
        summary.app,
        summary.supabase,
        summary.companyProfile,
        summary.pin,
        summary.projectFinancialSnapshot,
        ...summary.storageBuckets,
        ...summary.apBills,
      ]
    : [];
  const coreHealthRows = summary
    ? coreHealthChecks.map((check, index) => checkToDetailRow(check, `core:${index}:${check.name}`))
    : undefined;
  const qaSections = qa?.sections ?? [];
  const destructiveSafetySection = qaSections.find(
    (section) =>
      section.id === "destructive-safety" ||
      section.name.toLowerCase().includes("destructive action safety")
  );
  const previewSection = qaSections.find(
    (section) =>
      section.id === "preview" ||
      section.name.toLowerCase().includes("preview") ||
      section.checks.some((check) => check.type === "preview")
  );
  const destructiveSafetyRows = destructiveSafetySection?.checks.map((check) =>
    qaCheckToDetailRow(check, destructiveSafetySection.id)
  );
  const previewRows = previewSection?.checks.map((check) =>
    qaCheckToDetailRow(check, previewSection.id)
  );
  const destructiveSafetyStatus = qa
    ? qaStatusToHealthStatus(destructiveSafetySection?.status ?? qa.summary.status)
    : "ok";
  const previewStatus = qa ? qaStatusToHealthStatus(previewSection?.status ?? "pass") : "ok";
  const optionalModuleChecks = uniqueHealthChecks([
    ...optionalModules,
    ...(summary?.apBills ?? []).filter(isOptionalModuleCheck),
    ...informationalItems,
  ]);
  const requiredTableRows = summary?.requiredTables.map((check, index) =>
    checkToDetailRow(check, `required:${index}:${check.name}`)
  );
  const optionalRows = optionalModuleChecks.map((check, index) =>
    checkToDetailRow(check, `optional:${index}:${check.name}`)
  );
  const dataIntegrityRows: HealthDetailRowData[] | undefined = integrity?.errors?.length
    ? integrity.errors.map((message, index) => ({
        id: `integrity-error-${index}`,
        name: "Integrity check error",
        status: "fail",
        message,
      }))
    : integrity
      ? [
          {
            id: "orphaned-tasks",
            name: "Orphaned tasks",
            status: orphanedTaskCount === 0 ? "ok" : "warning",
            message:
              orphanedTaskCount > 0
                ? `${orphanedTaskCount} task(s) with missing project`
                : "No orphaned tasks detected.",
            action:
              orphanedTaskCount > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] border-amber-200/30 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15"
                  onClick={() => runCleanup("orphaned")}
                  disabled={cleanupBusy !== null}
                >
                  {cleanupBusy === "orphaned" ? "Cleaning..." : "Clean up"}
                </Button>
              ) : undefined,
          },
          {
            id: "ghost-tasks",
            name: "Ghost tasks",
            status: ghostTaskCount === 0 ? "ok" : "warning",
            message:
              ghostTaskCount > 0
                ? `${ghostTaskCount} task(s) with no title`
                : "No ghost tasks detected.",
            action:
              ghostTaskCount > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] border-amber-200/30 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15"
                  onClick={() => runCleanup("ghost")}
                  disabled={cleanupBusy !== null}
                >
                  {cleanupBusy === "ghost" ? "Cleaning..." : "Clean up"}
                </Button>
              ) : undefined,
          },
          {
            id: "duplicate-tasks",
            name: "Duplicate tasks",
            status: duplicateTaskCount === 0 ? "ok" : "warning",
            message:
              duplicateTaskCount > 0
                ? `${duplicateTaskCount} duplicate(s) in same project`
                : "No duplicate tasks detected.",
            action:
              duplicateTaskCount > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] border-amber-200/30 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15"
                  onClick={() => runCleanup("duplicate")}
                  disabled={cleanupBusy !== null}
                >
                  {cleanupBusy === "duplicate" ? "Cleaning..." : "Clean up"}
                </Button>
              ) : undefined,
          },
          {
            id: "overdue-not-completed",
            name: "Overdue not completed",
            status: overdueNotCompletedCount === 0 ? "ok" : "warning",
            message:
              overdueNotCompletedCount > 0
                ? `${overdueNotCompletedCount} task(s) past due`
                : "No overdue incomplete tasks detected.",
          },
          {
            id: "stale-test-data",
            name: "Stale test data",
            status: staleTestDataCount === 0 ? "ok" : "warning",
            message:
              staleTestDataCount > 0
                ? `${staleTaskCount} task(s), ${staleProjectCount} project(s)`
                : "No stale test data detected.",
            action:
              staleTestDataCount > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] border-amber-200/30 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15"
                  onClick={() => runCleanup("stale")}
                  disabled={cleanupBusy !== null}
                >
                  {cleanupBusy === "stale" ? "Cleaning..." : "Clean up"}
                </Button>
              ) : undefined,
          },
        ]
      : undefined;
  const dataIntegrityStatus: HealthCheckStatus = dataIntegrityRows?.some(
    (row) => row.status === "fail"
  )
    ? "fail"
    : dataIntegrityRows?.some((row) => row.status === "warning")
      ? "warning"
      : "ok";
  const integrityScanHealthStatus = integrityScanStatusToHealthStatus(integrityScan?.status);
  const integrityScanDetailRows = integrityScanRows(integrityScan);
  const healthActiveIssues: ActiveIssue[] = [...criticalIssues, ...needsAttention].map(
    (check, index) => ({
      id: `health:${index}:${check.name}:${check.code ?? ""}`,
      title: check.name,
      status: check.status === "fail" ? "fail" : "warning",
      message: check.message ?? check.code ?? "Needs review",
      href: check.href,
      meta: check.code,
    })
  );
  const guardianActiveIssues: ActiveIssue[] =
    result?.checks
      .filter((check) => !check.ok)
      .map((check, index) => ({
        id: `guardian:${index}:${check.name}`,
        title: check.name,
        status: "fail",
        message: check.error ?? "Guardian route check failed.",
        meta: "guardian",
      })) ?? [];
  const qaActiveIssues: ActiveIssue[] = qaSections.flatMap((section) =>
    section.checks
      .filter(
        (check) =>
          check.status !== "pass" &&
          check.category !== "optionalModule" &&
          check.category !== "informational"
      )
      .map((check) => ({
        id: `qa:${section.id}:${check.id}`,
        title: check.name,
        status: qaStatusToHealthStatus(check.status) === "fail" ? "fail" : "warning",
        message: check.message,
        href: check.page,
        meta: section.name,
      }))
  );
  const dataQualityActiveIssues: ActiveIssue[] =
    dataQuality?.issues
      ?.filter((issue) => issue.severity === "critical" || issue.severity === "warning")
      .map((issue, index) => ({
        id: `data-quality:${index}:${issue.issueCode}`,
        title: issue.entityName ?? issue.issueCode,
        status: issue.severity === "critical" ? "fail" : "warning",
        message: issue.message,
        href: issue.link,
        meta: issue.recommendedAction,
      })) ?? [];
  const integrityScanActiveIssues: ActiveIssue[] =
    integrityScan?.sections
      ?.flatMap((section) =>
        section.issues.map((issue) => ({
          id: `integrity-scan:${section.id}:${issue.table}:${issue.id}:${issue.category}`,
          title: `${issue.table} / ${issue.id}`,
          status:
            integrityScanSeverityToRowStatus(issue.severity) === "fail"
              ? ("fail" as const)
              : ("warning" as const),
          message: issue.message,
          meta: section.title,
        }))
      )
      .filter((issue) => issue.status === "fail" || issue.status === "warning")
      .slice(0, 8) ?? [];
  const activeIssues = [
    ...healthActiveIssues,
    ...guardianActiveIssues,
    ...qaActiveIssues,
    ...dataQualityActiveIssues,
    ...integrityScanActiveIssues,
  ];
  const metadataRows = [
    {
      label: "Environment",
      value: (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Globe2 className="h-4 w-4 shrink-0 text-[#F4E6C5]/75" />
          <span className="truncate">
            {health?.environment?.vercelEnv ?? health?.environment?.nodeEnv ?? "local"}
          </span>
        </span>
      ),
    },
    {
      label: "Commit",
      value: (
        <code className="font-mono text-[#F4E6C5]">
          {health?.environment?.commit ? shortCommit(health.environment.commit) : "n/a"}
        </code>
      ),
    },
    {
      label: "Health API Checked",
      value: formatCheckedAt(health?.checkedAt),
    },
    {
      label: "Guardian Checked",
      value: formatCheckedAt(result?.checkedAt ?? lastRefreshed),
    },
    {
      label: "System QA Mode",
      value: qa
        ? qa.mode === "production-safe"
          ? "Production safe"
          : "Local safe"
        : "Checking...",
    },
    {
      label: "Integrity Scan",
      value: integrityScan
        ? `${integrityScan.summary.totalIssues} issue(s) · ${formatCheckedAt(integrityScan.generatedAt)}`
        : integrityScanLoading
          ? "Checking..."
          : "Not available",
    },
    {
      label: "Schema Notes",
      value: summary?.schemaDriftWarnings?.length
        ? summary.schemaDriftWarnings.join("; ")
        : "No schema drift notes.",
    },
  ];

  return (
    <div className="system-health-command-center min-h-screen px-3 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 text-slate-100 sm:px-4 lg:px-6">
      <style jsx global>{`
        .system-health-command-center {
          color-scheme: dark;
          background:
            radial-gradient(circle at 20% 0%, rgba(198, 165, 106, 0.09), transparent 30rem),
            radial-gradient(circle at 82% 8%, rgba(79, 175, 124, 0.055), transparent 24rem),
            linear-gradient(180deg, #0b0d12 0%, #0f1218 42%, #0b0d12 100%);
        }
        .system-health-command-center .guardian-hero {
          background:
            radial-gradient(circle at 22% 10%, rgba(198, 165, 106, 0.11), transparent 28rem),
            linear-gradient(135deg, rgba(17, 20, 27, 0.96), rgba(11, 13, 18, 0.98));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .system-health-command-center .guardian-panel {
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 1rem;
          background: linear-gradient(180deg, rgba(17, 20, 27, 0.92), rgba(11, 13, 18, 0.94));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .system-health-command-center .guardian-hero-metric {
          min-width: 0;
          border-radius: 0.75rem;
          border: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(255, 255, 255, 0.035);
          padding: 0.65rem 0.75rem;
        }
        .system-health-command-center .guardian-hero-metric span {
          display: block;
          min-width: 0;
        }
        .system-health-command-center details[open] .details-chevron {
          transform: rotate(180deg);
        }
        .system-health-command-center summary::-webkit-details-marker {
          display: none;
        }
        .system-health-command-center .guardian-scan-line {
          animation: none;
          opacity: 0.46;
        }
        .system-health-command-center .guardian-refresh-line span {
          width: 42%;
          animation: guardian-refresh ${cadenceSeconds}s linear infinite;
        }
        .system-health-command-center .airtable-table-wrap {
          max-width: 100%;
          overflow: hidden;
          border-color: rgba(148, 163, 184, 0.12) !important;
          border-radius: 0.875rem;
          background: rgba(11, 13, 18, 0.78) !important;
        }
        .system-health-command-center .airtable-table-scroll {
          max-width: 100%;
          overflow-x: auto;
        }
        .system-health-command-center .guardian-table-shell {
          max-width: 100%;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 0.875rem;
          background: rgba(11, 13, 18, 0.62);
        }
        .system-health-command-center .guardian-detail-table,
        .system-health-command-center .airtable-table-wrap table {
          border-collapse: separate;
          border-spacing: 0;
        }
        .system-health-command-center .guardian-detail-table thead tr,
        .system-health-command-center .airtable-table-wrap thead tr {
          background: linear-gradient(
            180deg,
            rgba(17, 20, 27, 0.94),
            rgba(13, 16, 22, 0.94)
          ) !important;
        }
        .system-health-command-center .guardian-detail-table th,
        .system-health-command-center .airtable-table-wrap th {
          border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
          background: transparent !important;
          color: rgba(148, 163, 184, 0.72) !important;
        }
        .system-health-command-center .guardian-detail-table td,
        .system-health-command-center .airtable-table-wrap td {
          border-color: rgba(148, 163, 184, 0.075) !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .system-health-command-center .guardian-command-row {
          background-clip: padding-box;
        }
        .system-health-command-center .bg-card,
        .system-health-command-center .bg-muted {
          background-color: rgba(255, 255, 255, 0.045) !important;
        }
        .system-health-command-center .text-foreground {
          color: rgb(248, 250, 252) !important;
        }
        .system-health-command-center .text-muted-foreground {
          color: rgb(148, 163, 184) !important;
        }
        .system-health-command-center .border-border\\/70,
        .system-health-command-center .border-border\\/60 {
          border-color: rgba(148, 163, 184, 0.11) !important;
        }
        @keyframes guardian-scan {
          0% {
            transform: translateX(-60%);
            opacity: 0;
          }
          18%,
          72% {
            opacity: 1;
          }
          100% {
            transform: translateX(220%);
            opacity: 0;
          }
        }
        @keyframes guardian-refresh {
          0% {
            transform: translateX(-110%);
          }
          100% {
            transform: translateX(245%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .system-health-command-center *,
          .system-health-command-center *::before,
          .system-health-command-center *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <HealthHero
          overallStatus={overallStatus}
          checkedAt={displayCheckedAt}
          cadenceSeconds={cadenceSeconds}
          environment={health?.environment}
          onRefresh={() => void refreshAll(true)}
          disabled={loading || healthLoading || refreshing}
          refreshing={refreshing}
        />

        {error ? (
          <div className="guardian-panel border-red-400/25 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              <div>
                <p className="font-medium">Guardian request failed.</p>
                <p className="mt-1 text-xs leading-5 text-red-100/75">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <HealthSummaryCard
            title="Core App"
            status={summary?.app.status ?? "ok"}
            summary={summary?.app.message ?? "Application shell and core runtime are checking."}
            count={summary?.app ? "1 / 1 OK" : undefined}
            icon={Server}
          />
          <HealthSummaryCard
            title="Data Layer"
            status={worstHealthStatus(dataLayerChecks)}
            summary="Required tables and project financial snapshot dependencies."
            count={formatCount(countOk(dataLayerChecks))}
            icon={Layers3}
          />
          <HealthSummaryCard
            title="Supabase"
            status={worstHealthStatus(supabaseChecks)}
            summary={summary?.supabase.message ?? "Database and storage reachability checks."}
            count={formatCount(countOk(supabaseChecks))}
            icon={Database}
          />
          <HealthSummaryCard
            title="Security / PIN"
            status={summary?.pin.status ?? "ok"}
            summary={summary?.pin.message ?? "PIN auth guard status is checking."}
            count={summary?.pin ? "1 / 1 OK" : undefined}
            icon={KeyRound}
          />
          <HealthSummaryCard
            title="Critical Routes"
            status={routeStatus}
            summary="Guardian route and module availability checks."
            count={formatCount(routeCount)}
            icon={RouteIcon}
          />
          <HealthSummaryCard
            title="Destructive Safety"
            status={destructiveSafetyStatus}
            summary="Safe route checks for wipe, seed, cleanup, restore, and mutation guards."
            count={formatBlockedRouteCount(destructiveSafetySection)}
            icon={ShieldCheck}
          />
        </div>

        <ActiveIssuesPanel issues={activeIssues} optionalModules={optionalModuleChecks} />

        <div className="grid gap-3">
          <HealthSection
            title="Core Health Checks"
            icon={Server}
            status={worstHealthStatus(coreHealthChecks)}
            count={formatCount(countOk(coreHealthChecks))}
            description="App, Supabase, storage, company profile, PIN, AP bills, and project snapshot checks."
            defaultOpen={Boolean(
              coreHealthRows?.some((row) => row.status !== "ok" && row.status !== "info")
            )}
          >
            <HealthDetailTable rows={coreHealthRows} loading={healthLoading} />
          </HealthSection>

          <HealthSection
            title="Required Tables"
            icon={Table2}
            status={worstHealthStatus(summary?.requiredTables ?? [])}
            count={formatCount(summary ? countOk(summary.requiredTables) : null)}
            description="Core public tables used by production health checks."
            defaultOpen={Boolean(requiredTableRows?.some((row) => row.status !== "ok"))}
          >
            <HealthDetailTable rows={requiredTableRows} loading={healthLoading} />
          </HealthSection>

          <HealthSection
            title="Critical Routes"
            icon={RouteIcon}
            status={routeStatus}
            count={formatCount(routeCount)}
            description="Guardian route checks are pinned first when they fail."
            defaultOpen={Boolean(routeCheckRows?.some((row) => row.status !== "ok"))}
          >
            <HealthDetailTable rows={routeCheckRows} loading={loading} />
          </HealthSection>

          <HealthSection
            title="Preview Routes"
            icon={Activity}
            status={previewStatus}
            count={formatCount(
              previewSection
                ? {
                    ok: previewSection.checks.filter((check) => check.status === "pass").length,
                    total: previewSection.checks.length,
                  }
                : null
            )}
            description="Receipt, attachment, invoice, estimate, and PDF preview readiness."
            defaultOpen={Boolean(
              previewRows?.some((row) => row.status !== "ok" && row.status !== "info")
            )}
          >
            <HealthDetailTable rows={previewRows} loading={qaLoading} />
          </HealthSection>

          <HealthSection
            title="Optional Modules"
            icon={Info}
            status="ok"
            count={
              optionalModuleChecks.length
                ? `${optionalModuleChecks.length} informational`
                : undefined
            }
            description="Disabled optional modules are informational, not production blockers."
            defaultOpen={false}
          >
            <HealthDetailTable
              rows={optionalRows}
              loading={healthLoading}
              emptyMessage="No optional module notices."
            />
          </HealthSection>

          <HealthSection
            title="Destructive Action Safety"
            icon={ShieldCheck}
            status={destructiveSafetyStatus}
            count={formatBlockedRouteCount(destructiveSafetySection)}
            description="Read-only visibility into destructive route protections."
            defaultOpen={Boolean(
              destructiveSafetyRows?.some((row) => row.status !== "ok" && row.status !== "info")
            )}
          >
            <HealthDetailTable rows={destructiveSafetyRows} loading={qaLoading} />
          </HealthSection>

          <HealthSection
            title="System Metadata"
            icon={Clock3}
            status="ok"
            description="Runtime, commit, health timestamps, QA mode, and schema notes."
            defaultOpen={false}
          >
            <MetadataGrid rows={metadataRows} />
          </HealthSection>

          <HealthSection
            title="Data Integrity"
            icon={CheckCircle2}
            status={dataIntegrityStatus}
            description="Current task integrity checks with guarded cleanup actions."
            defaultOpen={Boolean(dataIntegrityRows?.some((row) => row.status !== "ok"))}
          >
            <HealthDetailTable rows={dataIntegrityRows} loading={integrityLoading} />
          </HealthSection>

          <HealthSection
            title="System Integrity Scanner"
            icon={Database}
            status={integrityScanHealthStatus}
            count={
              integrityScan
                ? `${integrityScan.summary.totalIssues} issue(s)`
                : integrityScanError
                  ? "Scanner unavailable"
                  : undefined
            }
            description={`Read-only marker and dependency scanner. ${
              integrityScan
                ? `Generated ${formatCheckedAt(integrityScan.generatedAt)}.`
                : "No cleanup or fix actions are available here."
            }`}
            defaultOpen={Boolean(integrityScanDetailRows?.some((row) => row.status !== "ok"))}
          >
            {integrityScanError ? (
              <p className="px-4 pb-4 text-sm text-red-300">{integrityScanError}</p>
            ) : integrityScan ? (
              <>
                <MetadataGrid
                  rows={[
                    { label: "Critical", value: integrityScan.summary.critical },
                    { label: "High", value: integrityScan.summary.high },
                    { label: "Medium", value: integrityScan.summary.medium },
                    { label: "Low", value: integrityScan.summary.low },
                    {
                      label: "Sections",
                      value: integrityScan.sections.length,
                    },
                    {
                      label: "Auto fix",
                      value: "Disabled",
                    },
                  ]}
                />
                <HealthDetailTable
                  rows={integrityScanDetailRows}
                  loading={integrityScanLoading}
                  emptyMessage="No marker or dependency integrity issues found."
                />
              </>
            ) : (
              <HealthDetailTable rows={undefined} loading={integrityScanLoading} />
            )}
          </HealthSection>
        </div>

        <SystemQaPanel
          qa={qa}
          loading={qaLoading}
          error={qaError}
          onRun={() => void fetchSystemQa()}
        />

        <DataQualityPanel
          dataQuality={dataQuality}
          loading={dataQualityLoading}
          error={dataQualityError}
          onRun={() => void fetchDataQuality()}
        />

        <div className="flex justify-end">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] w-full border-white/15 bg-white/[0.035] text-slate-100 hover:bg-white/[0.065] sm:w-auto"
            >
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
