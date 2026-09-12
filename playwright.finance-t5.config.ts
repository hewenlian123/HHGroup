import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadE2EProcessEnv } from "./tests/e2e-load-env";
loadE2EProcessEnv();
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
  throw new Error("T5 requires local synthetic Supabase");
const storageState = process.env.E2E_UI_STORAGE_STATE;
if (!storageState || !existsSync(storageState))
  throw new Error("Existing local owner session required");
export default defineConfig({
  testDir: "./tests",
  testMatch: "finance-t5-reporting.spec.ts",
  timeout: 120000,
  expect: { timeout: 45000 },
  workers: 1,
  retries: 0,
  outputDir: process.env.E2E_UI_OUTPUT_DIR || "/tmp/hh-finance-t5-results",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: (process.env.E2E_UI_OUTPUT_DIR || "/tmp/hh-finance-t5-results") + ".json" },
    ],
  ],
  use: {
    baseURL: "http://localhost:3000",
    storageState,
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
