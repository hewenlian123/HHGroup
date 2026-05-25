const PROD_WRITE_OVERRIDE = "ALLOW_PROD_TEST_WRITES";

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
