/**
 * Playwright global teardown: final DB sweep after all tests (see tests/e2e-cleanup-db.ts).
 */
import type { FullConfig } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

import { cleanupTestData } from "./e2e-cleanup-db";

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  loadDotenv({ path: resolve(process.cwd(), ".env.local") });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "[global-teardown] Skip DB cleanup: missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local"
    );
    return;
  }

  const { deleted, warnings } = await cleanupTestData(createClient(url, key));
  if (warnings.length > 0) warnings.forEach((w) => console.warn(`[global-teardown] ${w}`));
  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  // Always log so `npm run test:local` is easy to grep (`deleted: { ... }` or `deleted: (none)`).
  console.log("[global-teardown] deleted:", total > 0 ? deleted : "(none — no matching test rows)");
}
