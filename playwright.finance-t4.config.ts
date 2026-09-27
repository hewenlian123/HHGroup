import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { loadE2EProcessEnv } from "./tests/e2e-load-env";

loadE2EProcessEnv();
const storageState = process.env.E2E_UI_STORAGE_STATE;
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
  throw new Error("T4 requires the existing hh-finance-audit-2026 local Supabase instance.");
}
if (!storageState || !existsSync(storageState)) {
  throw new Error("Set E2E_UI_STORAGE_STATE to an existing authenticated local owner session.");
}

// Preserve the audit fixtures: no global seed, schema repair or broad teardown.
export default defineConfig({
  testDir: "./tests",
  testMatch: "finance-t4-workspace.spec.ts",
  timeout: 90_000,
  expect: { timeout: 45_000 },
  workers: 1,
  retries: 0,
  outputDir: process.env.E2E_UI_OUTPUT_DIR || "/tmp/hh-finance-t4-results",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    storageState,
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
