const PROD_WRITE_OVERRIDE = "ALLOW_PROD_TEST_WRITES";

const PRODUCTION_READ_ONLY_SPECS = [
  /(?:^|\/)tests\/production-safety\.spec\.ts$/,
  /(?:^|\/)tests\/production-add-flows\.spec\.ts$/,
] as const;

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
  if (!isProductionAppUrl(params.baseURL) || productionTestWritesAllowed()) return;

  const specArgs = explicitPlaywrightSpecArgs(params.argv ?? []);
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
