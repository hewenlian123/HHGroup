/**
 * Shared dotenv order for Playwright + E2E scripts.
 *
 * Put **local Supabase** credentials in `.env.test` so they win over `.env.local`
 * (where many teams keep production `NEXT_PUBLIC_SUPABASE_URL` for day-to-day dev).
 *
 * Precedence (last wins): `.env` → `.env.local` → `.env.e2e` (if present) → `.env.test` (if present)
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

export function loadE2EProcessEnv(cwd: string = process.cwd()): void {
  loadDotenv({ path: resolve(cwd, ".env") });
  loadDotenv({ path: resolve(cwd, ".env.local"), override: true });
  const e2ePath = resolve(cwd, ".env.e2e");
  if (existsSync(e2ePath)) {
    loadDotenv({ path: e2ePath, override: true });
  }
  const testPath = resolve(cwd, ".env.test");
  if (existsSync(testPath)) {
    loadDotenv({ path: testPath, override: true });
  }
}
