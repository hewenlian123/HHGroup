const PROD_WRITE_OVERRIDE = "ALLOW_PROD_TEST_WRITES";

export const CLEAR_DATA_CONFIRMATION_PHRASE = "DELETE ALL LOCAL HH GROUP DATA";

type ClearDataTargetInput = {
  databaseUrl?: string | null;
  fallbackDatabaseUrl?: string | null;
  supabaseUrl?: string | null;
  confirmation?: string | null;
};

export type VerifiedLocalClearDataTarget = {
  databaseUrl: string | null;
  supabaseUrl: string | null;
};

function isHostedSupabaseTarget(url: string | undefined | null): boolean {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw.includes("supabase.co") || raw.includes("supabase.com");
}

export function assertScriptSupabaseTargetSafeForTestWrites(
  url: string | undefined | null,
  context: string
): void {
  if (!isHostedSupabaseTarget(url) || process.env[PROD_WRITE_OVERRIDE] === "1") return;
  throw new Error(
    `[scripts] Refusing ${context} against hosted Supabase target. ` +
      "Production/remote test writes are disabled by default. Use local Supabase, " +
      `or set ${PROD_WRITE_OVERRIDE}=1 only for an intentional marker-data run with guaranteed cleanup.`
  );
}

function normalized(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "[::1]" || value === "::1";
}

function assertLocalCliUrl(raw: string, kind: "database" | "api"): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[clear-data] Refusing ambiguous ${kind} target: URL is invalid.`);
  }

  const expectedPort = kind === "database" ? "54322" : "54321";
  const allowedProtocols = kind === "database" ? ["postgres:", "postgresql:"] : ["http:"];
  if (
    !allowedProtocols.includes(url.protocol) ||
    !isLoopbackHostname(url.hostname) ||
    url.port !== expectedPort
  ) {
    throw new Error(
      `[clear-data] Refusing ${kind} target that is not the HH Group local Docker Supabase ` +
        `endpoint on loopback port ${expectedPort}.`
    );
  }

  if (kind === "database" && url.pathname !== "/postgres") {
    throw new Error(
      "[clear-data] Refusing local database target with an unexpected database name."
    );
  }
}

/**
 * Fail-closed guard for whole-database deletion. Unlike marker-data test writes, this
 * operation never accepts a hosted override: it must target this repo's local CLI ports.
 */
export function assertClearDataTargetSafe(
  input: ClearDataTargetInput
): VerifiedLocalClearDataTarget {
  const primaryDatabaseUrl = normalized(input.databaseUrl);
  const fallbackDatabaseUrl = normalized(input.fallbackDatabaseUrl);
  const supabaseUrl = normalized(input.supabaseUrl);

  if (primaryDatabaseUrl && fallbackDatabaseUrl && primaryDatabaseUrl !== fallbackDatabaseUrl) {
    throw new Error(
      "[clear-data] Refusing ambiguous database target: SUPABASE_DATABASE_URL and DATABASE_URL differ."
    );
  }

  const databaseUrl = primaryDatabaseUrl ?? fallbackDatabaseUrl;
  if (!databaseUrl && !supabaseUrl) {
    throw new Error("[clear-data] Refusing to run because no Supabase target is configured.");
  }

  if (databaseUrl) assertLocalCliUrl(databaseUrl, "database");
  if (supabaseUrl) assertLocalCliUrl(supabaseUrl, "api");

  if (input.confirmation !== CLEAR_DATA_CONFIRMATION_PHRASE) {
    throw new Error(
      `[clear-data] Destructive confirmation required. Set HH_CLEAR_DATA_CONFIRM exactly to ` +
        `"${CLEAR_DATA_CONFIRMATION_PHRASE}" for this one local run.`
    );
  }

  return { databaseUrl, supabaseUrl };
}
