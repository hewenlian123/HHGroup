import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getServerSupabaseInternal } from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";

export type SystemHealthStatus = "ok" | "warning";
export type SystemHealthCheckStatus = "ok" | "warning" | "fail";

export type SystemHealthModule = {
  name: string;
  status: "ok" | "warning" | "fail";
  message?: string;
};

export type SystemHealthCheck = {
  name: string;
  status: SystemHealthCheckStatus;
  message?: string;
  code?: string;
};

type HealthTarget = {
  name: string;
  table: string;
  optional?: boolean;
};

type StorageTarget = {
  name: string;
  bucket: string;
  optional?: boolean;
};

type UnknownRow = Record<string, unknown>;

const REQUIRED_TABLES: HealthTarget[] = [
  { name: "Projects", table: "projects" },
  { name: "Customers", table: "customers" },
  { name: "Expenses", table: "expenses" },
  { name: "Expense lines", table: "expense_lines" },
  { name: "Invoices", table: "invoices" },
  { name: "Invoice items", table: "invoice_items" },
  { name: "Labor entries", table: "labor_entries" },
  { name: "Workers", table: "workers" },
  { name: "Worker payments", table: "worker_payments" },
  { name: "Worker advances", table: "worker_advances" },
  { name: "Worker reimbursements", table: "worker_reimbursements" },
  { name: "Bank transactions", table: "bank_transactions" },
  { name: "Company profile", table: "company_profile" },
  { name: "App security settings", table: "app_security_settings" },
];

const OPTIONAL_TABLES: HealthTarget[] = [
  { name: "Expense options", table: "expense_options", optional: true },
  { name: "Legacy payment methods", table: "payment_methods", optional: true },
  { name: "AP bills", table: "ap_bills", optional: true },
  { name: "AP bill payments", table: "ap_bill_payments", optional: true },
  { name: "Payments received", table: "payments_received", optional: true },
  { name: "Payment received attachments", table: "payment_received_attachments", optional: true },
  { name: "Project change orders", table: "project_change_orders", optional: true },
  { name: "Project change order items", table: "project_change_order_items", optional: true },
  { name: "Estimates", table: "estimates", optional: true },
  { name: "Estimate items", table: "estimate_items", optional: true },
  { name: "Worker receipts", table: "worker_receipts", optional: true },
  { name: "Subcontract bills", table: "subcontract_bills", optional: true },
  { name: "Subcontract payments", table: "subcontract_payments", optional: true },
  { name: "Activity logs", table: "activity_logs", optional: true },
];

const STORAGE_BUCKETS: StorageTarget[] = [
  { name: "Branding", bucket: "branding", optional: true },
  { name: "Worker receipts", bucket: "worker-receipts", optional: true },
  { name: "Expense attachments", bucket: "expense-attachments", optional: true },
  { name: "Payment attachments", bucket: "payment-attachments", optional: true },
  { name: "Attachments", bucket: "attachments", optional: true },
];

const COMPANY_PROFILE_E2E_MARKERS = [/E2E-ST/i, /E2E-ZIP/i];

function checkToModule(check: SystemHealthCheck): SystemHealthModule {
  return {
    name: check.name,
    status: check.status,
    ...(check.message ? { message: check.message } : {}),
  };
}

function normalizeError(error: unknown, fallback = "Check failed"): string {
  return safeErrorMessage(error, fallback);
}

function hasMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = (error as { message?: string } | null)?.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation.*does not exist|does not exist|not found|not exist|could not find.*(?:table|relation)|schema cache/i.test(
      message
    )
  );
}

function optionalUnavailableMessage(target: HealthTarget | StorageTarget): string {
  if (target.name === "AP bills" || target.name === "AP bill payments") {
    return "AP Bills module is not configured yet.";
  }
  if (target.name === "Expense options") {
    return "Expense options are not installed in this environment.";
  }
  if (target.name === "Legacy payment methods") {
    return "Legacy payment_methods table is not configured; expense_options/fallbacks should be used.";
  }
  return `${target.name} is optional and is not installed in this environment.`;
}

function isInformationalWarning(check: SystemHealthCheck): boolean {
  return (
    check.code === "optional_table_missing" || check.code === "optional_storage_bucket_missing"
  );
}

async function checkTable(
  server: ReturnType<typeof getServerSupabaseInternal>,
  target: HealthTarget
): Promise<SystemHealthCheck> {
  if (!server) {
    return {
      name: target.name,
      status: target.optional ? "warning" : "fail",
      message: "Supabase is not configured on the server.",
      code: "supabase_not_configured",
    };
  }

  try {
    const { error } = await server.from(target.table).select("*").limit(1);
    if (error) {
      const missing = hasMissingRelationError(error);
      return {
        name: target.name,
        status: target.optional ? "warning" : missing ? "fail" : "fail",
        message: missing
          ? target.optional
            ? optionalUnavailableMessage(target)
            : `${target.table} is not available.`
          : normalizeError(error.message ?? "Table check failed"),
        code: missing
          ? target.optional
            ? "optional_table_missing"
            : "missing_table"
          : ((error as { code?: string }).code ?? "table_check_failed"),
      };
    }
    return { name: target.name, status: "ok", message: `${target.table} is reachable.` };
  } catch (error) {
    return {
      name: target.name,
      status: target.optional ? "warning" : "fail",
      message: normalizeError(error),
      code: "table_check_exception",
    };
  }
}

async function checkStorageBucket(
  server: ReturnType<typeof getServerSupabaseInternal>,
  target: StorageTarget
): Promise<SystemHealthCheck> {
  if (!server) {
    return {
      name: target.name,
      status: target.optional ? "warning" : "fail",
      message: "Supabase is not configured on the server.",
      code: "supabase_not_configured",
    };
  }

  try {
    const { error } = await server.storage.from(target.bucket).list("", { limit: 1 });
    if (error) {
      const missing = hasMissingRelationError(error);
      return {
        name: target.name,
        status: target.optional ? "warning" : "fail",
        message:
          target.optional && missing
            ? optionalUnavailableMessage(target)
            : normalizeError(error.message ?? "Storage bucket check failed"),
        code:
          target.optional && missing
            ? "optional_storage_bucket_missing"
            : ((error as { statusCode?: string; code?: string }).code ??
              "storage_bucket_check_failed"),
      };
    }
    return { name: target.name, status: "ok", message: `${target.bucket} is reachable.` };
  } catch (error) {
    return {
      name: target.name,
      status: target.optional ? "warning" : "fail",
      message: normalizeError(error),
      code: "storage_bucket_check_exception",
    };
  }
}

function rowHasE2EMarker(row: UnknownRow): boolean {
  return Object.values(row).some(
    (value) =>
      typeof value === "string" && COMPANY_PROFILE_E2E_MARKERS.some((marker) => marker.test(value))
  );
}

async function checkCompanyProfile(
  server: ReturnType<typeof getServerSupabaseInternal>
): Promise<SystemHealthCheck> {
  if (!server) {
    return {
      name: "Company Profile",
      status: "fail",
      message: "Supabase is not configured on the server.",
      code: "supabase_not_configured",
    };
  }

  try {
    const { data, error } = await server.from("company_profile").select("*").limit(3);
    if (error) {
      return {
        name: "Company Profile",
        status: hasMissingRelationError(error) ? "warning" : "fail",
        message: hasMissingRelationError(error)
          ? "company_profile is not available."
          : normalizeError(error.message ?? "Company profile check failed"),
        code: hasMissingRelationError(error)
          ? "missing_table"
          : ((error as { code?: string }).code ?? "company_profile_check_failed"),
      };
    }

    const rows = (data ?? []) as UnknownRow[];
    if (rows.length === 0) {
      return {
        name: "Company Profile",
        status: "warning",
        message: "Company profile has not been configured.",
        code: "company_profile_missing",
      };
    }
    if (rows.some(rowHasE2EMarker)) {
      return {
        name: "Company Profile",
        status: "warning",
        message: "E2E test marker detected in company profile data.",
        code: "company_profile_e2e_marker",
      };
    }
    return {
      name: "Company Profile",
      status: "ok",
      message: "Company profile is configured without test markers.",
    };
  } catch (error) {
    return {
      name: "Company Profile",
      status: "fail",
      message: normalizeError(error),
      code: "company_profile_check_exception",
    };
  }
}

async function checkPinSettings(
  server: ReturnType<typeof getServerSupabaseInternal>
): Promise<SystemHealthCheck> {
  if (!server) {
    return {
      name: "App Security / PIN",
      status: "fail",
      message: "Supabase is not configured on the server.",
      code: "supabase_not_configured",
    };
  }

  try {
    const { data, error } = await server.from("app_security_settings").select("*").limit(10);
    if (error) {
      return {
        name: "App Security / PIN",
        status: hasMissingRelationError(error) ? "fail" : "warning",
        message: hasMissingRelationError(error)
          ? "app_security_settings is not available."
          : normalizeError(error.message ?? "PIN settings check failed"),
        code: hasMissingRelationError(error)
          ? "missing_table"
          : ((error as { code?: string }).code ?? "pin_settings_check_failed"),
      };
    }

    const rows = (data ?? []) as UnknownRow[];
    const loginPin = rows.find((row) => row.key === "login_pin");
    if (!loginPin) {
      return {
        name: "App Security / PIN",
        status: "fail",
        message: "login_pin row is missing.",
        code: "login_pin_missing",
      };
    }
    const hasHash = typeof loginPin.pin_hash === "string" && loginPin.pin_hash.length > 0;
    const hasSalt = typeof loginPin.pin_salt === "string" && loginPin.pin_salt.length > 0;
    if (!hasHash || !hasSalt) {
      return {
        name: "App Security / PIN",
        status: "warning",
        message: "PIN row exists but the PIN is not initialized.",
        code: "login_pin_not_initialized",
      };
    }
    return {
      name: "App Security / PIN",
      status: "ok",
      message: "PIN session settings are initialized.",
    };
  } catch (error) {
    return {
      name: "App Security / PIN",
      status: "fail",
      message: normalizeError(error),
      code: "pin_settings_check_exception",
    };
  }
}

function summarizeProjectFinancialSnapshot(requiredTables: SystemHealthCheck[]): SystemHealthCheck {
  const missingCore = requiredTables.filter(
    (check) =>
      check.status === "fail" &&
      [
        "Projects",
        "Expenses",
        "Expense lines",
        "Invoices",
        "Invoice items",
        "Labor entries",
        "Worker reimbursements",
      ].includes(check.name)
  );

  if (missingCore.length > 0) {
    return {
      name: "Project Financial Snapshot",
      status: "fail",
      message: `${missingCore.length} required financial table(s) are unavailable.`,
      code: "project_snapshot_required_tables_missing",
    };
  }

  return {
    name: "Project Financial Snapshot",
    status: "ok",
    message: "Core snapshot tables are reachable.",
  };
}

function collectWarnings(checks: SystemHealthCheck[]): string[] {
  return checks
    .filter((check) => check.status !== "ok")
    .map((check) => `${check.name}: ${check.message ?? check.code ?? "Needs review"}`);
}

function collectSchemaDriftWarnings(checks: SystemHealthCheck[]): string[] {
  const warnings: string[] = [];
  for (const check of checks) {
    if (check.status === "ok") continue;
    if (check.name === "Expense options") {
      warnings.push(
        "Expense options schema is missing in this environment; compare local and production before changing expense settings."
      );
    }
    if (check.name === "Legacy payment methods") {
      warnings.push(
        "Legacy payment_methods schema is missing; this is acceptable only while expense_options/fallbacks cover the app flow."
      );
    }
    if (check.name === "AP bills" || check.name === "AP bill payments") {
      warnings.push("AP Bills module is not configured yet.");
    }
  }
  return Array.from(new Set(warnings));
}

async function fetchSchemaCheck(request: Request): Promise<string[] | undefined> {
  try {
    const origin = new URL(request.url).origin;
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const lock = request.headers.get("x-hh-production-safety-lock");
    if (lock) headers.set("x-hh-production-safety-lock", lock);
    const bypass = request.headers.get("x-hh-test-auth-bypass");
    if (bypass) headers.set("x-hh-test-auth-bypass", bypass);
    const schemaRes = await fetch(`${origin}/api/schema-check`, { cache: "no-store", headers });
    const schemaData = (await schemaRes.json().catch(() => ({}))) as {
      status?: string;
      missing?: string[];
    };
    if (
      schemaData.status === "error" &&
      Array.isArray(schemaData.missing) &&
      schemaData.missing.length > 0
    ) {
      return schemaData.missing.map((item) => safeErrorMessage(item));
    }
    return undefined;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const checkedAt = new Date().toISOString();
  const server = getServerSupabaseInternal();

  const appCheck: SystemHealthCheck = {
    name: "App Status",
    status: "ok",
    message: "Application route is responding.",
  };
  const supabaseCheck: SystemHealthCheck = server
    ? {
        name: "Supabase Connection",
        status: "ok",
        message: "Supabase client is configured on the server.",
      }
    : {
        name: "Supabase Connection",
        status: "fail",
        message: "Supabase server configuration is missing.",
        code: "supabase_not_configured",
      };

  const requiredTables = await Promise.all(
    REQUIRED_TABLES.map((target) => checkTable(server, target))
  );
  const optionalTables = await Promise.all(
    OPTIONAL_TABLES.map((target) => checkTable(server, target))
  );
  const storageBuckets = await Promise.all(
    STORAGE_BUCKETS.map((target) => checkStorageBucket(server, target))
  );
  const companyProfile = await checkCompanyProfile(server);
  const pin = await checkPinSettings(server);
  const apBills = optionalTables.filter((check) =>
    ["AP bills", "AP bill payments"].includes(check.name)
  );
  const projectFinancialSnapshot = summarizeProjectFinancialSnapshot(requiredTables);
  const schemaMissing = await fetchSchemaCheck(request);

  const checks = [
    appCheck,
    supabaseCheck,
    ...requiredTables,
    ...optionalTables,
    ...storageBuckets,
    companyProfile,
    pin,
    projectFinancialSnapshot,
  ];
  const status: SystemHealthStatus =
    checks.some((check) => check.status !== "ok" && !isInformationalWarning(check)) ||
    (schemaMissing?.length ?? 0) > 0
      ? "warning"
      : "ok";
  const schemaWarnings =
    schemaMissing && schemaMissing.length > 0
      ? [`Schema check missing: ${schemaMissing.join(", ")}`]
      : [];
  const schemaDriftWarnings = collectSchemaDriftWarnings(optionalTables);
  const warnings = [...collectWarnings(checks), ...schemaWarnings].map((warning) =>
    safeErrorMessage(warning)
  );
  const modules = checks.map(checkToModule);

  return NextResponse.json({
    status,
    modules,
    ...(schemaMissing !== undefined ? { schemaMissing } : {}),
    checkedAt,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
        null,
    },
    summary: {
      app: appCheck,
      supabase: supabaseCheck,
      requiredTables,
      optionalTables,
      storageBuckets,
      companyProfile,
      pin,
      apBills,
      projectFinancialSnapshot,
      schemaDriftWarnings,
      warnings,
      checkedAt,
    },
  });
}
