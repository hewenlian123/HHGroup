import { afterEach, expect, test, vi } from "vitest";
import { assertEstimateCertificationLocalOnly } from "../../tests/e2e-supabase-url-guard";
const target = {
  baseURL: "http://127.0.0.1:3101",
  supabaseUrl: "http://127.0.0.1:55321",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
};
afterEach(() => vi.unstubAllEnvs());
test("RC requires explicit opt-in and matching local ports", () => {
  vi.stubEnv("E2E_ESTIMATE_TARGET", "");
  expect(() => assertEstimateCertificationLocalOnly(target)).toThrow();
  vi.stubEnv("E2E_ESTIMATE_TARGET", "estimate-release-20260911");
  expect(assertEstimateCertificationLocalOnly(target).supabaseOrigin).toBe(target.supabaseUrl);
});
test("RC rejects development, remote, missing DB, and mismatched app targets", () => {
  vi.stubEnv("E2E_ESTIMATE_TARGET", "estimate-release-20260911");
  for (const delta of [
    { databaseUrl: undefined },
    { databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" },
    { baseURL: "http://127.0.0.1:3000" },
    { supabaseUrl: "http://127.0.0.1:54321" },
    { supabaseUrl: "https://example.supabase.co" },
    { databaseUrl: "postgresql://postgres@remote.example:55322/postgres" },
  ]) {
    expect(() => assertEstimateCertificationLocalOnly({ ...target, ...delta })).toThrow();
  }
});
