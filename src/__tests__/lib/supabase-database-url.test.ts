import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSupabaseTransactionPoolerUrl } from "@/lib/supabase-database-url";

const publicUrl = "https://projectref.supabase.co";
const originalDatabaseUrl = process.env.SUPABASE_DATABASE_URL;

afterEach(() => {
  vi.resetModules();
  if (originalDatabaseUrl === undefined) delete process.env.SUPABASE_DATABASE_URL;
  else process.env.SUPABASE_DATABASE_URL = originalDatabaseUrl;
});

describe("Supabase serverless database URL gate", () => {
  it("accepts shared and dedicated transaction poolers", () => {
    expect(() =>
      assertSupabaseTransactionPoolerUrl(
        "postgresql://postgres.projectref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
        publicUrl
      )
    ).not.toThrow();
    expect(() =>
      assertSupabaseTransactionPoolerUrl(
        "postgresql://postgres:secret@db.projectref.supabase.co:6543/postgres?sslmode=verify-full",
        publicUrl
      )
    ).not.toThrow();
  });

  it("rejects direct, cross-project, and non-SSL connections without echoing credentials", () => {
    for (const candidate of [
      "postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres",
      "postgresql://postgres.other:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      "postgresql://postgres.projectref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=disable",
    ]) {
      expect(() => assertSupabaseTransactionPoolerUrl(candidate, publicUrl)).toThrow();
      try {
        assertSupabaseTransactionPoolerUrl(candidate, publicUrl);
      } catch (error) {
        expect(String(error)).not.toContain("secret");
      }
    }
  });

  it("keeps the credential server-only and fails closed when it is absent", async () => {
    delete process.env.SUPABASE_DATABASE_URL;
    const { getSupabaseServerPostgres } = await import("@/lib/supabase-server-postgres");
    expect(getSupabaseServerPostgres()).toBeNull();

    const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(source("src/lib/supabase-server-postgres.ts")).toContain('import "server-only"');
    expect(source("src/app/estimates/_components/estimate-editor.tsx")).not.toMatch(
      /SUPABASE_DATABASE_URL|DATABASE_URL|from ["']postgres["']/
    );
  });
});
