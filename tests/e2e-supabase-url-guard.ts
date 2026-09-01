const PROD_WRITE_OVERRIDE = "ALLOW_PROD_TEST_WRITES";
const LOCAL_E2E_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOCAL_SUPABASE_API_PORT = "54321";
const LOCAL_SUPABASE_DATABASE_PORT = "54322";

const PRODUCTION_NEVER_RUN_SPECS = [/(?:^|\/)tests\/production-safety\.spec\.ts$/] as const;

const PRODUCTION_READ_ONLY_SPECS = [/(?:^|\/)tests\/production-add-flows\.spec\.ts$/] as const;

export function productionTestWritesAllowed(): boolean {
  return process.env[PROD_WRITE_OVERRIDE] === "1";
}

export function isProductionAppUrl(url: string | undefined | null): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  let host = raw.toLowerCase();
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    host =
      raw
        .replace(/^https?:\/\//i, "")
        .split(/[/?#]/)[0]
        ?.toLowerCase() ?? raw;
  }
  return (
    host === "hhprojectgroup.com" ||
    host === "www.hhprojectgroup.com" ||
    host.endsWith(".vercel.app")
  );
}

function explicitPlaywrightSpecArgs(argv: readonly string[]): string[] {
  return argv
    .filter((arg) => !arg.startsWith("-"))
    .filter((arg) => /(?:^|\/)tests\/.+\.spec\.ts$|\.spec\.ts$/i.test(arg))
    .map((arg) => arg.replace(/\\/g, "/"));
}

export function assertPlaywrightProductionRunSafeForWrites(params: {
  baseURL: string | undefined | null;
  argv?: readonly string[];
}): void {
  if (!isProductionAppUrl(params.baseURL)) return;

  const specArgs = explicitPlaywrightSpecArgs(params.argv ?? []);
  const localOnlySpecs = specArgs.filter((arg) =>
    PRODUCTION_NEVER_RUN_SPECS.some((pattern) => pattern.test(arg))
  );
  if (localOnlySpecs.length > 0) {
    throw new Error(
      `[E2E] Refusing to run ${localOnlySpecs.join(", ")} against production app target ${params.baseURL}. ` +
        "This destructive-route guard contract is localhost-only and cannot be overridden. " +
        "Run it against a local production build instead."
    );
  }

  if (productionTestWritesAllowed()) return;

  const allExplicitSpecsAreReadOnly =
    specArgs.length > 0 &&
    specArgs.every((arg) => PRODUCTION_READ_ONLY_SPECS.some((pattern) => pattern.test(arg)));

  if (allExplicitSpecsAreReadOnly) return;

  const requested = specArgs.length > 0 ? specArgs.join(", ") : "the selected Playwright suite";
  throw new Error(
    `[E2E] Refusing to run ${requested} against production app target ${params.baseURL}. ` +
      "Production URL is read-only by default. Use E2E_BASE_URL=http://localhost:3000 for write tests. " +
      `Only set ${PROD_WRITE_OVERRIDE}=1 for an intentional marker-data run with guaranteed cleanup.`
  );
}

/**
 * Blocks Playwright / E2E DB mutations against hosted Supabase project URLs (`*.supabase.co`)
 * so seed, teardown, and cleanup never target production by accident.
 *
 * Local CLI default: http://127.0.0.1:54321
 *
 * Override (staging team only): `E2E_ALLOW_REMOTE_SUPABASE=1`
 */
export function assertE2ESupabaseUrlSafeForMutations(url: string | undefined | null): void {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === "1") return;
  const u = (url ?? "").trim().toLowerCase();
  if (!u) return;
  if (u.includes("supabase.co")) {
    throw new Error(
      "[E2E] Refusing DB mutations: NEXT_PUBLIC_SUPABASE_URL points at supabase.co (hosted project). " +
        "Use local Supabase for E2E: http://127.0.0.1:54321 — see .env.test.example. " +
        "Override only for intentional remote staging: E2E_ALLOW_REMOTE_SUPABASE=1."
    );
  }
}

function parseRequiredE2EUrl(value: string | undefined | null, label: string): URL {
  const raw = value?.trim();
  if (!raw) throw new Error(`[E2E] ${label} is required for local Estimate certification.`);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`[E2E] ${label} must be an absolute URL; received an invalid value.`);
  }
}

function assertLocalHost(url: URL, label: string): void {
  if (!LOCAL_E2E_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`[E2E] ${label} must use a localhost or 127.0.0.1 host.`);
  }
}

/**
 * Fail-closed target proof for Estimate operational certification. This suite creates and
 * deletes marker data through an admin client, so it cannot use the generic staging escape hatch.
 */
export function assertEstimateCertificationLocalOnly(params: {
  baseURL: string | undefined | null;
  supabaseUrl: string | undefined | null;
  databaseUrl?: string | undefined | null;
}): { appOrigin: string; databaseOrigin?: string; supabaseOrigin: string } {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE?.trim()) {
    throw new Error(
      "[E2E] Estimate certification does not permit E2E_ALLOW_REMOTE_SUPABASE; use the local Docker target only."
    );
  }

  const app = parseRequiredE2EUrl(params.baseURL, "E2E_BASE_URL");
  if (app.protocol !== "http:") {
    throw new Error("[E2E] Estimate certification requires an http local app URL.");
  }
  assertLocalHost(app, "E2E_BASE_URL");
  if (!app.port) {
    throw new Error("[E2E] Estimate certification requires an explicit local app port.");
  }

  const supabase = parseRequiredE2EUrl(params.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabase.protocol !== "http:") {
    throw new Error("[E2E] Estimate certification requires the local Supabase API endpoint.");
  }
  assertLocalHost(supabase, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabase.port !== LOCAL_SUPABASE_API_PORT) {
    throw new Error(
      `[E2E] Estimate certification requires local Supabase API port :${LOCAL_SUPABASE_API_PORT}.`
    );
  }

  let databaseOrigin: string | undefined;
  if (params.databaseUrl?.trim()) {
    const database = parseRequiredE2EUrl(params.databaseUrl, "SUPABASE_DATABASE_URL");
    if (database.protocol !== "postgres:" && database.protocol !== "postgresql:") {
      throw new Error("[E2E] Estimate certification requires a PostgreSQL local database URL.");
    }
    assertLocalHost(database, "SUPABASE_DATABASE_URL");
    if (database.port !== LOCAL_SUPABASE_DATABASE_PORT) {
      throw new Error(
        `[E2E] Estimate certification requires local Supabase database port :${LOCAL_SUPABASE_DATABASE_PORT}.`
      );
    }
    databaseOrigin = `${database.protocol}//${database.host}`;
  }

  return { appOrigin: app.origin, databaseOrigin, supabaseOrigin: supabase.origin };
}

/**
 * Blocks browser-driven E2E mutations against production app hosts. This matters for singleton
 * resources such as company_profile where UI tests can mutate the server-side production DB even
 * when the local test runner's Supabase env points somewhere safe.
 */
export function assertE2EBaseUrlSafeForMutations(
  url: string | undefined | null,
  context = "browser E2E mutation"
): void {
  if (productionTestWritesAllowed()) return;
  if (isProductionAppUrl(url)) {
    throw new Error(
      `[E2E] Refusing ${context} against production app target ${url}. ` +
        "Use local app URL for E2E mutations. " +
        `Only set ${PROD_WRITE_OVERRIDE}=1 for an intentional marker-data run with guaranteed cleanup.`
    );
  }
}
