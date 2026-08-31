const trimKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Returns the environment for the Playwright-spawned local web server.
 * Blank Supabase keys are omitted so Next may load usable local values.
 */
export function buildPlaywrightWebServerEnv(
  source: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (typeof value === "string") {
      out[key] = value;
    }
  }

  for (const key of trimKeys) {
    const raw = out[key];
    if (raw === undefined || raw.trim() === "") {
      delete out[key];
    } else {
      out[key] = raw.trim();
    }
  }

  out.HH_ALLOW_LOCAL_AUTO_LOGIN = "0";
  return out;
}
