import { afterEach, describe, expect, it } from "vitest";

import { getE2ESupabaseEnvDiagnostic } from "../../tests/e2e-supabase-env-diagnostic";

const ORIGINAL_ENV = { ...process.env };

describe("E2E Supabase diagnostics", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports configuration state without exposing any key characters", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-sensitive-value";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_sensitive-value";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const diagnostic = getE2ESupabaseEnvDiagnostic();
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      hasPublishableKey: true,
      hasServerSecret: true,
      looksReadyForAdminMutations: true,
    });
    expect(serialized).not.toContain("publishable-sensitive-value");
    expect(serialized).not.toContain("sb_secret_sensitive-value");
    expect(serialized).not.toContain("prefix");
  });
});
