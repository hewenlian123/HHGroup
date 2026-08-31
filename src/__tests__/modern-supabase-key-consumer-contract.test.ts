import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("modern Supabase key consumer contract", () => {
  it("supports the modern server secret at every production runtime consumer", () => {
    const consumers = [
      "src/lib/supabase-server.ts",
      "src/lib/invoices-db.ts",
      "src/app/api/production/checklist/route.ts",
      "src/app/api/diag/upload-receipt-supabase/route.ts",
      "docs/AUTH_RECEIPT_PRODUCTION_ROLLOUT.md",
      "docs/PRODUCTION_CHECKLIST.md",
    ];

    for (const path of consumers) {
      expect(source(path), path).toContain("SUPABASE_SECRET_KEY");
    }
  });

  it("supports modern server secrets in local verification without logging key prefixes", () => {
    const consumers = [
      "tests/e2e-webserver-env.ts",
      ".env.test.example",
      "tests/e2e-auth-owner.ts",
      "tests/global-setup.ts",
      "tests/global-teardown.ts",
      "tests/e2e-supabase-env-diagnostic.ts",
      "scripts/debug-delete.ts",
    ];

    for (const path of consumers) {
      expect(source(path), path).toContain("SUPABASE_SECRET_KEY");
    }

    expect(source("tests/e2e-supabase-env-diagnostic.ts")).not.toMatch(
      /keyPrefix|KeyPrefix|slice\(\s*0|substring\(\s*0/i
    );
    expect(source("scripts/debug-delete.ts")).not.toMatch(
      /key prefix|slice\(\s*0|substring\(\s*0/i
    );
  });

  it("does not use a JWT-shaped fallback in CI", () => {
    const ci = source(".github/workflows/ci.yml");

    expect(ci).not.toMatch(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY:[^\n]*eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i
    );
  });

  it("uses the server-only client for authenticated project financial API reads", () => {
    const route = source("src/app/api/projects/[id]/tab/route.ts");

    expect(route).toMatch(
      /const supabase = getServerSupabaseInternalNoStore\(\)[\s\S]*?getCanonicalProjectProfit\(id,\s*supabase\)/i
    );
  });
});
