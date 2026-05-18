import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getProjectFinancialReview } from "@/lib/financial/project-financial-review-db";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { redactSensitiveText, safeErrorMessage } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QaStatus = "pass" | "warning" | "critical";
type QaCategory = "actionRequired" | "optionalModule" | "dataCleanup" | "informational";
type QaType =
  | "page"
  | "auth"
  | "destructive-safety"
  | "financial"
  | "data-quality"
  | "preview"
  | "mobile"
  | "schema";

type QaCheck = {
  id: string;
  name: string;
  status: QaStatus;
  type: QaType;
  category?: QaCategory;
  page?: string;
  message: string;
  recommendedAction?: string;
  diagnosticCode?: string;
};

type QaSection = {
  id: string;
  name: string;
  status: QaStatus;
  checks: QaCheck[];
};

type SampleIds = {
  projectId: string | null;
  invoiceId: string | null;
  estimateId: string | null;
  changeOrder: { projectId: string; id: string } | null;
};

type PageTarget = {
  id: string;
  name: string;
  path: string;
  mobile?: boolean;
};

type HealthCheckStatus = "ok" | "warning" | "fail";

type HealthCheck = {
  name?: string;
  status?: HealthCheckStatus;
  message?: string;
  code?: string;
  category?: QaCategory;
  href?: string;
};

type SystemHealthResponse = {
  status?: "ok" | "warning";
  summary?: {
    requiredTables?: HealthCheck[];
    optionalTables?: HealthCheck[];
    storageBuckets?: HealthCheck[];
    companyProfile?: HealthCheck;
    pin?: HealthCheck;
    apBills?: HealthCheck[];
    projectFinancialSnapshot?: HealthCheck;
    schemaDriftWarnings?: string[];
  };
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

const STATIC_PAGE_TARGETS: PageTarget[] = [
  { id: "dashboard", name: "Dashboard", path: "/dashboard", mobile: true },
  { id: "projects", name: "Projects", path: "/projects", mobile: true },
  { id: "customers", name: "Customers", path: "/customers" },
  { id: "financial", name: "Financial", path: "/financial" },
  { id: "financial-inbox", name: "Financial Inbox", path: "/financial/inbox", mobile: true },
  {
    id: "financial-expenses",
    name: "Financial Expenses",
    path: "/financial/expenses",
    mobile: true,
  },
  {
    id: "financial-invoices",
    name: "Financial Invoices",
    path: "/financial/invoices",
    mobile: true,
  },
  { id: "financial-bank", name: "Financial Bank", path: "/financial/bank" },
  { id: "financial-owner", name: "Financial Owner", path: "/financial/owner" },
  { id: "estimates", name: "Estimates", path: "/estimates" },
  { id: "change-orders", name: "Change Orders", path: "/change-orders" },
  { id: "labor", name: "Labor", path: "/labor", mobile: true },
  { id: "labor-payments", name: "Labor Payments", path: "/labor/payments" },
  {
    id: "labor-worker-balances",
    name: "Worker Balances",
    path: "/labor/worker-balances",
    mobile: true,
  },
  { id: "labor-payroll", name: "Payroll Summary", path: "/labor/payroll" },
  { id: "settings", name: "Settings", path: "/settings" },
  { id: "settings-security", name: "Settings Security", path: "/settings/security" },
  {
    id: "project-financial-review",
    name: "Project Financial Review",
    path: "/settings/project-financial-review",
  },
  { id: "system-health", name: "System Health", path: "/system-health" },
];

const DESTRUCTIVE_GET_TARGETS = [
  "/api/production/wipe-database",
  "/api/production/cleanup-test-data",
  "/api/seed-workers",
  "/api/seed/operations",
  "/api/ensure-schema",
  "/api/system/integrity/cleanup",
  "/api/test/full-system-test",
] as const;

const STORAGE_BUCKETS = [
  "branding",
  "expense-attachments",
  "payment-attachments",
  "worker-receipts",
  "attachments",
] as const;

const RAW_TECHNICAL_ERROR_RE =
  /permission denied|row-level security|\brls\b|schema cache|could not find (?:the )?(?:table|column)|pgrst\d+|TypeError:|ReferenceError:|Unhandled Runtime Error|Application error|Internal Server Error/i;
const RAW_CURRENCY_RE = /\$\s*-?\d[\d,]*\.\d{3,}\b/;
const BAD_VALUE_RE = /\b(?:NaN|Infinity|undefined|null)\b/i;
const TEST_COPY_RE = /E2E-ST|E2E-ZIP|E2E test marker|sample data|test data/i;

function sectionStatus(checks: QaCheck[]): QaStatus {
  if (checks.some((check) => check.status === "critical")) return "critical";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

function makeSection(id: string, name: string, checks: QaCheck[]): QaSection {
  return { id, name, status: sectionStatus(checks), checks };
}

function isOptionalModuleCheck(check: HealthCheck): boolean {
  return (
    check.category === "optionalModule" ||
    (check.code === "optional_module_disabled" &&
      (check.name === "AP bills" ||
        check.name === "AP bill payments" ||
        check.name === "Legacy payment methods"))
  );
}

function companyProfileMarkerFields(rows: Array<Record<string, unknown>>): string[] {
  const fields = new Set<string>();
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "string" && /E2E-ST|E2E-ZIP/i.test(value)) fields.add(field);
    }
  }
  return Array.from(fields).sort();
}

function visibleTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSnippet(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  if (!match || match.index == null) return undefined;
  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + 160);
  return redactSensitiveText(text.slice(start, end));
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const productionLock = request.headers.get("x-hh-production-safety-lock");
  const localBypass = request.headers.get("x-hh-test-auth-bypass");
  if (cookie) headers.set("cookie", cookie);
  if (productionLock) headers.set("x-hh-production-safety-lock", productionLock);
  if (localBypass) headers.set("x-hh-test-auth-bypass", localBypass);
  return headers;
}

async function selectFirstId(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  table: string,
  select: string,
  orderColumn = "created_at"
): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .order(orderColumn, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

async function getSampleIds(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>
): Promise<SampleIds> {
  const [project, invoice, estimate, changeOrder] = await Promise.all([
    selectFirstId(supabase, "projects", "id,name,updated_at", "updated_at"),
    selectFirstId(supabase, "invoices", "id,created_at", "created_at"),
    selectFirstId(supabase, "estimates", "id,created_at", "created_at"),
    selectFirstId(supabase, "project_change_orders", "id,project_id,created_at", "created_at"),
  ]);

  return {
    projectId: typeof project?.id === "string" ? project.id : null,
    invoiceId: typeof invoice?.id === "string" ? invoice.id : null,
    estimateId: typeof estimate?.id === "string" ? estimate.id : null,
    changeOrder:
      typeof changeOrder?.id === "string" && typeof changeOrder.project_id === "string"
        ? { id: changeOrder.id, projectId: changeOrder.project_id }
        : null,
  };
}

function buildPageTargets(samples: SampleIds): PageTarget[] {
  const dynamicTargets: PageTarget[] = [];
  if (samples.projectId) {
    dynamicTargets.push({
      id: "project-detail-cost",
      name: "Project Detail Cost Tab",
      path: `/projects/${samples.projectId}?tab=cost`,
      mobile: true,
    });
  }
  if (samples.invoiceId) {
    dynamicTargets.push({
      id: "invoice-preview",
      name: "Invoice Preview",
      path: `/financial/invoices/${samples.invoiceId}/preview`,
      mobile: true,
    });
  }
  if (samples.estimateId) {
    dynamicTargets.push({
      id: "estimate-preview",
      name: "Estimate Preview",
      path: `/estimates/${samples.estimateId}/preview`,
      mobile: true,
    });
  }
  if (samples.changeOrder) {
    dynamicTargets.push({
      id: "change-order-detail",
      name: "Change Order Detail",
      path: `/projects/${samples.changeOrder.projectId}/change-orders/${samples.changeOrder.id}`,
    });
  }
  return [...STATIC_PAGE_TARGETS, ...dynamicTargets];
}

async function checkPageTarget(
  origin: string,
  headers: Headers,
  target: PageTarget
): Promise<QaCheck> {
  const url = `${origin}${target.path}`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers,
      redirect: "manual",
    });
    const location = response.headers.get("location") ?? "";
    const html = await response.text().catch(() => "");
    const visibleText = visibleTextFromHtml(html);

    if (response.status === 401 || response.status === 403 || location.includes("/login")) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "critical",
        type: "page",
        page: target.path,
        message: `Page is blocked (${response.status}${location ? ` → ${location}` : ""}).`,
        recommendedAction: "Check PIN auth boundary and route guard.",
        diagnosticCode: "page_auth_blocked",
      };
    }
    if (response.status >= 500) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "critical",
        type: "page",
        page: target.path,
        message: `Page returned ${response.status}.`,
        recommendedAction: "Open the page locally and inspect server logs.",
        diagnosticCode: "page_server_error",
      };
    }
    if (response.status >= 400) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "warning",
        type: "page",
        page: target.path,
        message: `Page returned ${response.status}.`,
        recommendedAction: "Confirm the route exists and has a safe empty state.",
        diagnosticCode: "page_client_error",
      };
    }
    if (RAW_TECHNICAL_ERROR_RE.test(visibleText)) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "critical",
        type: "page",
        page: target.path,
        message: `Raw technical error visible: ${safeSnippet(visibleText, RAW_TECHNICAL_ERROR_RE)}`,
        recommendedAction: "Fix the underlying API/RLS/schema error and replace raw UI errors.",
        diagnosticCode: "page_raw_technical_error",
      };
    }
    if (RAW_CURRENCY_RE.test(visibleText)) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "warning",
        type: "financial",
        page: target.path,
        message: `Currency with more than two decimals is visible: ${safeSnippet(
          visibleText,
          RAW_CURRENCY_RE
        )}`,
        recommendedAction: "Route amount rendering through the shared currency formatter.",
        diagnosticCode: "currency_precision_warning",
      };
    }
    if (BAD_VALUE_RE.test(visibleText)) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "warning",
        type: "data-quality",
        page: target.path,
        message: `Placeholder value visible: ${safeSnippet(visibleText, BAD_VALUE_RE)}`,
        recommendedAction: "Add a user-friendly empty state or normalize the displayed value.",
        diagnosticCode: "raw_placeholder_value_visible",
      };
    }
    if (TEST_COPY_RE.test(visibleText)) {
      return {
        id: `page-${target.id}`,
        name: target.name,
        status: "warning",
        type: "data-quality",
        page: target.path,
        message: `Test/debug marker is visible: ${safeSnippet(visibleText, TEST_COPY_RE)}`,
        recommendedAction: "Clean production data or remove debug copy from the page.",
        diagnosticCode: "test_marker_visible",
      };
    }

    return {
      id: `page-${target.id}`,
      name: target.name,
      status: "pass",
      type: "page",
      page: target.path,
      message: `Page responded ${response.status}.`,
    };
  } catch (error) {
    return {
      id: `page-${target.id}`,
      name: target.name,
      status: "critical",
      type: "page",
      page: target.path,
      message: safeErrorMessage(error, "Page check failed."),
      recommendedAction: "Open the page locally and inspect the network/server logs.",
      diagnosticCode: "page_fetch_exception",
    };
  }
}

async function buildPageSection(request: Request, samples: SampleIds): Promise<QaSection> {
  const origin = new URL(request.url).origin;
  const headers = forwardedHeaders(request);
  const targets = buildPageTargets(samples);
  const checks = await Promise.all(
    targets.map((target) => checkPageTarget(origin, headers, target))
  );
  return makeSection("pages", "Page availability and visible errors", checks);
}

async function buildDestructiveSafetySection(request: Request): Promise<QaSection> {
  const origin = new URL(request.url).origin;
  const headers = forwardedHeaders(request);
  const checks = await Promise.all(
    DESTRUCTIVE_GET_TARGETS.map(async (path): Promise<QaCheck> => {
      try {
        const response = await fetch(`${origin}${path}`, {
          method: "GET",
          cache: "no-store",
          headers,
          redirect: "manual",
        });
        const ok = response.status >= 400;
        return {
          id: `destructive-get-${path.replace(/[^a-z0-9]+/gi, "-")}`,
          name: `GET ${path}`,
          status: ok ? "pass" : "critical",
          type: "destructive-safety",
          page: path,
          message: ok
            ? `GET is blocked safely with status ${response.status}.`
            : `GET returned ${response.status}; destructive actions must not be reachable by GET.`,
          recommendedAction: ok
            ? undefined
            : "Require POST plus typed confirmation before any destructive action.",
          diagnosticCode: ok ? undefined : "destructive_get_allowed",
        };
      } catch (error) {
        return {
          id: `destructive-get-${path.replace(/[^a-z0-9]+/gi, "-")}`,
          name: `GET ${path}`,
          status: "warning",
          type: "destructive-safety",
          page: path,
          message: safeErrorMessage(error, "Could not verify destructive GET behavior."),
          recommendedAction: "Manually confirm the endpoint rejects GET.",
          diagnosticCode: "destructive_get_check_exception",
        };
      }
    })
  );
  return makeSection("destructive-safety", "Destructive action safety", checks);
}

async function buildCompanyProfileSection(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>
): Promise<QaSection> {
  if (!supabase) {
    return makeSection("company-profile", "Company profile data quality", [
      {
        id: "company-profile-config",
        name: "Company profile",
        status: "critical",
        type: "data-quality",
        message: "Supabase server client is not configured.",
        recommendedAction: "Set server Supabase environment variables.",
        diagnosticCode: "supabase_not_configured",
      },
    ]);
  }

  const { data, error } = await supabase
    .from("company_profile")
    .select("id,org_name,legal_name,address1,address2,city,state,zip,updated_at")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) {
    return makeSection("company-profile", "Company profile data quality", [
      {
        id: "company-profile-load",
        name: "Company profile",
        status: "critical",
        type: "data-quality",
        message: safeErrorMessage(error.message, "Company profile check failed."),
        recommendedAction: "Check company_profile schema and RLS.",
        diagnosticCode: error.code ?? "company_profile_check_failed",
      },
    ]);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasE2E = rows.some((row) =>
    Object.values(row).some((value) => typeof value === "string" && /E2E-ST|E2E-ZIP/i.test(value))
  );
  const fields = companyProfileMarkerFields(rows);
  return makeSection("company-profile", "Company profile data quality", [
    {
      id: "company-profile-e2e-marker",
      name: "Company profile E2E marker",
      status: hasE2E ? "warning" : "pass",
      type: "data-quality",
      category: hasE2E ? "dataCleanup" : "informational",
      page: "/settings/company",
      message: hasE2E
        ? `Company profile contains test marker data. Update in Settings -> Company Profile.${
            fields.length > 0 ? ` Fields: ${fields.join(", ")}.` : ""
          }`
        : "No E2E company profile marker found in recent rows.",
      recommendedAction: hasE2E
        ? "Clean the company profile in Settings after confirming the correct production values."
        : undefined,
      diagnosticCode: hasE2E ? "company_profile_e2e_marker" : undefined,
    },
  ]);
}

function healthCheckToQa(
  check: HealthCheck,
  options?: { criticalOnFail?: boolean; idPrefix?: string; type?: QaType }
): QaCheck {
  if (isOptionalModuleCheck(check)) {
    const name = check.name ?? "Optional module";
    return {
      id: `${options?.idPrefix ?? "schema"}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      status: "pass",
      type: options?.type ?? "schema",
      category: "optionalModule",
      message: check.message
        ? redactSensitiveText(check.message)
        : "Optional module is disabled in this environment.",
      recommendedAction: "No action required unless you decide to enable this module.",
      diagnosticCode: check.code,
    };
  }

  const status: QaStatus =
    check.status === "ok"
      ? "pass"
      : check.status === "fail" && options?.criticalOnFail
        ? "critical"
        : "warning";
  const name = check.name ?? "Schema check";
  return {
    id: `${options?.idPrefix ?? "schema"}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    status,
    type: options?.type ?? "schema",
    category:
      check.category ??
      (status === "pass"
        ? "informational"
        : check.code === "company_profile_e2e_marker"
          ? "dataCleanup"
          : "actionRequired"),
    message: check.message
      ? redactSensitiveText(check.message)
      : status === "pass"
        ? "Schema item is reachable."
        : "Schema item needs review.",
    recommendedAction:
      status === "critical"
        ? "Review required table migrations before relying on this route."
        : status === "warning"
          ? "Confirm whether this optional module is expected in this environment."
          : undefined,
    diagnosticCode: check.code,
  };
}

async function buildSchemaSection(request: Request): Promise<QaSection> {
  const origin = new URL(request.url).origin;
  try {
    const response = await fetch(`${origin}/api/system-health`, {
      cache: "no-store",
      headers: forwardedHeaders(request),
    });
    if (!response.ok) {
      return makeSection("schema", "Schema and system health", [
        {
          id: "schema-health-unavailable",
          name: "System Health API",
          status: "critical",
          type: "schema",
          page: "/system-health",
          message: `System Health API returned ${response.status}.`,
          recommendedAction: "Open /system-health locally and inspect the server log.",
          diagnosticCode: "system_health_unavailable",
        },
      ]);
    }

    const health = (await response.json().catch(() => ({}))) as SystemHealthResponse;
    const summary = health.summary;
    if (!summary) {
      return makeSection("schema", "Schema and system health", [
        {
          id: "schema-health-missing-summary",
          name: "System Health summary",
          status: "critical",
          type: "schema",
          page: "/system-health",
          message: "System Health response did not include a summary.",
          recommendedAction: "Check /api/system-health response shape.",
          diagnosticCode: "system_health_missing_summary",
        },
      ]);
    }

    const required = summary.requiredTables ?? [];
    const optional = summary.optionalTables ?? [];
    const storage = summary.storageBuckets ?? [];
    const requiredFailures = required.filter((check) => check.status === "fail");
    const optionalWarnings = optional.filter((check) => check.status !== "ok");
    const optionalDisabled = optional.filter(isOptionalModuleCheck);
    const storageWarnings = storage.filter((check) => check.status !== "ok");
    const driftWarnings = (summary.schemaDriftWarnings ?? []).filter(
      (warning) => !/AP Bills module|payment_methods/i.test(warning)
    );
    const companyProfileCheck: QaCheck =
      summary.companyProfile?.code === "company_profile_e2e_marker"
        ? {
            id: "schema-company-profile-data-cleanup-tracked",
            name: "Company Profile",
            status: "pass",
            type: "data-quality",
            category: "informational",
            page: "/settings/company",
            message: "Company profile data cleanup is tracked in the Company Profile section.",
            recommendedAction:
              "Update Settings -> Company Profile after confirming the correct production values.",
            diagnosticCode: "company_profile_data_cleanup_tracked",
          }
        : healthCheckToQa(summary.companyProfile ?? {}, {
            idPrefix: "schema",
            type: "data-quality",
          });

    const checks: QaCheck[] = [
      {
        id: "schema-required-tables",
        name: "Required tables",
        status: requiredFailures.length > 0 ? "critical" : "pass",
        type: "schema",
        page: "/system-health",
        message:
          requiredFailures.length > 0
            ? `${requiredFailures.length} required table check(s) failed.`
            : `${required.length} required table check(s) passed.`,
        recommendedAction:
          requiredFailures.length > 0
            ? "Create and test a migration for missing required schema before deployment."
            : undefined,
        diagnosticCode: requiredFailures.length > 0 ? "required_schema_missing" : undefined,
      },
      {
        id: "schema-optional-tables",
        name: "Optional tables",
        status: optionalWarnings.length > 0 ? "warning" : "pass",
        type: "schema",
        category: optionalWarnings.length > 0 ? "actionRequired" : "optionalModule",
        page: "/system-health",
        message:
          optionalWarnings.length > 0
            ? `${optionalWarnings.length} optional table warning(s).`
            : optionalDisabled.length > 0
              ? `${optionalDisabled.length} optional module(s) are disabled by design.`
              : `${optional.length} optional table check(s) passed.`,
        recommendedAction:
          optionalWarnings.length > 0
            ? "Review whether this optional schema is required by the current app flow."
            : optionalDisabled.length > 0
              ? "No action required unless you decide to enable one of these modules."
              : undefined,
        diagnosticCode: optionalWarnings.length > 0 ? "optional_schema_warning" : undefined,
      },
      {
        id: "schema-storage-buckets",
        name: "Storage buckets",
        status: storageWarnings.length > 0 ? "warning" : "pass",
        type: "schema",
        page: "/system-health",
        message:
          storageWarnings.length > 0
            ? `${storageWarnings.length} storage bucket warning(s).`
            : `${storage.length} storage bucket check(s) passed.`,
        recommendedAction:
          storageWarnings.length > 0 ? "Review storage bucket existence and policies." : undefined,
        diagnosticCode: storageWarnings.length > 0 ? "storage_schema_warning" : undefined,
      },
      companyProfileCheck,
      healthCheckToQa(summary.pin ?? {}, {
        criticalOnFail: true,
        idPrefix: "schema",
      }),
      healthCheckToQa(summary.projectFinancialSnapshot ?? {}, {
        criticalOnFail: true,
        idPrefix: "schema",
      }),
    ];

    for (const warning of driftWarnings) {
      checks.push({
        id: `schema-drift-${checks.length}`,
        name: "Schema drift warning",
        status: "warning",
        type: "schema",
        category: "actionRequired",
        page: "/system-health",
        message: redactSensitiveText(warning),
        recommendedAction: "Compare local and production schema before changing this module.",
        diagnosticCode: "schema_drift_warning",
      });
    }

    return makeSection("schema", "Schema and system health", checks);
  } catch (error) {
    return makeSection("schema", "Schema and system health", [
      {
        id: "schema-health-exception",
        name: "System Health API",
        status: "critical",
        type: "schema",
        page: "/system-health",
        message: safeErrorMessage(error, "System Health check failed."),
        recommendedAction: "Open /system-health locally and inspect server logs.",
        diagnosticCode: "system_health_exception",
      },
    ]);
  }
}

async function buildFinancialSection(): Promise<QaSection> {
  try {
    const review = await getProjectFinancialReview();
    const flagged = review.flaggedProjects;
    const placeholderCount = review.summary.placeholder + review.summary.zero;
    const suspiciousHugeCount = review.summary.suspiciousHuge;
    const checks: QaCheck[] = [
      {
        id: "contract-value-review",
        name: "Contract value review",
        status: flagged.length > 0 ? "warning" : "pass",
        type: "financial",
        category: flagged.length > 0 ? "actionRequired" : "informational",
        page: "/settings/project-financial-review",
        message:
          flagged.length > 0
            ? `${flagged.length} project(s) need contract value review before profit totals are final (${placeholderCount} placeholder/zero, ${suspiciousHugeCount} suspicious huge).`
            : "No contract value review issues found.",
        recommendedAction:
          flagged.length > 0
            ? "Open /settings/project-financial-review and fix placeholder or suspicious contract values."
            : undefined,
        diagnosticCode: flagged.length > 0 ? "contract_value_review_needed" : undefined,
      },
    ];

    return makeSection("financial", "Financial data guardrails", checks);
  } catch (error) {
    return makeSection("financial", "Financial data guardrails", [
      {
        id: "financial-review-load",
        name: "Project financial review",
        status: "critical",
        type: "financial",
        message: safeErrorMessage(error, "Financial review check failed."),
        recommendedAction: "Check project financial review API/server helper.",
        diagnosticCode: "project_financial_review_failed",
      },
    ]);
  }
}

async function countTableRows(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>,
  table: string
): Promise<{ count: number | null; error?: { message?: string; code?: string } }> {
  if (!supabase) return { count: null, error: { message: "Supabase not configured" } };
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return { count: null, error };
  return { count: count ?? 0 };
}

async function buildPreviewSection(
  supabase: ReturnType<typeof getServerSupabaseInternalNoStore>
): Promise<QaSection> {
  const checks: QaCheck[] = [];

  for (const table of [
    "attachments",
    "expense_attachments",
    "payment_received_attachments",
    "worker_receipts",
  ]) {
    const result = await countTableRows(supabase, table);
    checks.push({
      id: `attachment-table-${table}`,
      name: `${table} records`,
      status: result.error ? "warning" : "pass",
      type: "preview",
      message: result.error
        ? safeErrorMessage(result.error.message, `${table} could not be checked.`)
        : `${result.count ?? 0} record(s) available for preview workflows.`,
      recommendedAction: result.error
        ? "Check attachment table schema/RLS before relying on previews."
        : undefined,
      diagnosticCode: result.error?.code,
    });
  }

  if (!supabase) {
    checks.push({
      id: "storage-config",
      name: "Storage buckets",
      status: "critical",
      type: "preview",
      message: "Supabase server client is not configured.",
      recommendedAction: "Set server Supabase environment variables.",
      diagnosticCode: "supabase_not_configured",
    });
  } else {
    for (const bucket of STORAGE_BUCKETS) {
      const { error } = await supabase.storage.from(bucket).list("", { limit: 1 });
      checks.push({
        id: `storage-${bucket}`,
        name: `${bucket} bucket`,
        status: error ? "warning" : "pass",
        type: "preview",
        message: error
          ? safeErrorMessage(error.message, `${bucket} storage bucket check failed.`)
          : `${bucket} bucket is reachable for safe list checks.`,
        recommendedAction: error ? "Check storage bucket existence and read policy." : undefined,
        diagnosticCode: error
          ? ((error as { code?: string; statusCode?: string }).code ?? "storage_check_failed")
          : undefined,
      });
    }
  }

  checks.push({
    id: "preview-ui-local-coverage",
    name: "Preview modal UI coverage",
    status: "pass",
    type: "preview",
    message:
      "Receipt, invoice, estimate, and attachment modal open/close checks are covered by local Playwright specs; this API only performs safe GET/storage checks.",
    recommendedAction:
      "Run inbox-view-receipt-preview-ux, quick-expense-upload, and invoice/estimate specs locally for full modal verification.",
  });

  return makeSection("preview", "Receipt, attachment, and PDF preview readiness", checks);
}

function buildMobileSection(pageTargets: PageTarget[]): QaSection {
  const checks = pageTargets
    .filter((target) => target.mobile)
    .map(
      (target): QaCheck => ({
        id: `mobile-${target.id}`,
        name: target.name,
        status: "pass",
        type: "mobile",
        page: target.path,
        message:
          "Included in the System QA mobile route list. Use local Playwright mobile viewport checks for overflow, safe-area, modal, keyboard, and touch-target verification.",
        recommendedAction:
          "Run the local mobile QA specs before deployment when this page changes.",
      })
    );
  return makeSection("mobile", "Mobile field-use coverage", checks);
}

function summarize(sections: QaSection[]) {
  const checks = sections.flatMap((section) => section.checks);
  const critical = checks.filter((check) => check.status === "critical").length;
  const warning = checks.filter((check) => check.status === "warning").length;
  const pass = checks.filter((check) => check.status === "pass").length;
  const status: QaStatus = critical > 0 ? "critical" : warning > 0 ? "warning" : "pass";
  return { status, critical, warning, pass, total: checks.length };
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const checkedAt = new Date().toISOString();
  const supabase = getServerSupabaseInternalNoStore();
  const samples = await getSampleIds(supabase);
  const pageTargets = buildPageTargets(samples);

  const [
    pageSection,
    destructiveSafetySection,
    schemaSection,
    companyProfileSection,
    financialSection,
    preview,
  ] = await Promise.all([
    buildPageSection(request, samples),
    buildDestructiveSafetySection(request),
    buildSchemaSection(request),
    buildCompanyProfileSection(supabase),
    buildFinancialSection(),
    buildPreviewSection(supabase),
  ]);

  const mobile = buildMobileSection(pageTargets);
  const sections = [
    pageSection,
    destructiveSafetySection,
    schemaSection,
    companyProfileSection,
    financialSection,
    preview,
    mobile,
  ];
  const summary = summarize(sections);

  return NextResponse.json(
    {
      ok: summary.critical === 0,
      checkedAt,
      mode:
        process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production"
          ? "production-safe"
          : "local-safe",
      summary,
      sections,
    },
    { headers: NO_CACHE_HEADERS }
  );
}
