import { defineConfig } from "@playwright/test";
import base from "./playwright.finance-t5.config";
export default defineConfig({
  ...base,
  testMatch: "finance-t6-reporting.spec.ts",
  outputDir: "/tmp/hh-finance-t6-results",
  reporter: [["list"], ["json", { outputFile: "/tmp/hh-finance-t6-results.json" }]],
});
