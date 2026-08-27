import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertClearDataTargetSafe,
  CLEAR_DATA_CONFIRMATION_PHRASE,
} from "../../scripts/test-write-guard";

describe("clear-data local Docker guard", () => {
  const confirmation = CLEAR_DATA_CONFIRMATION_PHRASE;

  it("accepts only the repository local Docker Supabase endpoints with confirmation", () => {
    expect(
      assertClearDataTargetSafe({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        supabaseUrl: "http://127.0.0.1:54321",
        confirmation,
      })
    ).toEqual({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      supabaseUrl: "http://127.0.0.1:54321",
    });
  });

  it.each(["https://project-ref.supabase.co", "https://api.example.com", "http://127.0.0.1:6543"])(
    "refuses non-local API target %s",
    (supabaseUrl) => {
      expect(() => assertClearDataTargetSafe({ supabaseUrl, confirmation })).toThrow(/Refusing/);
    }
  );

  it.each([
    "postgresql://postgres:secret@db.project-ref.supabase.co:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/production",
  ])("refuses non-local or ambiguous database target %s", (databaseUrl) => {
    expect(() => assertClearDataTargetSafe({ databaseUrl, confirmation })).toThrow(/Refusing/);
  });

  it("refuses conflicting database environment variables", () => {
    expect(() =>
      assertClearDataTargetSafe({
        databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        fallbackDatabaseUrl: "postgresql://postgres:secret@db.remote.test:5432/postgres",
        confirmation,
      })
    ).toThrow(/ambiguous database target/);
  });

  it("requires the exact destructive confirmation phrase", () => {
    expect(() =>
      assertClearDataTargetSafe({
        supabaseUrl: "http://127.0.0.1:54321",
        confirmation: "yes",
      })
    ).toThrow(/Destructive confirmation required/);
  });

  it("refuses an unconfigured target", () => {
    expect(() => assertClearDataTargetSafe({ confirmation })).toThrow(/no Supabase target/);
  });

  it("keeps the direct SQL file fail-closed and free of destructive statements", () => {
    const sql = readFileSync(resolve(process.cwd(), "scripts/clear-data.sql"), "utf8");

    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).not.toMatch(/\bTRUNCATE\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
