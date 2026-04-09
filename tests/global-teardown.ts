/**
 * Playwright global teardown: final DB sweep after all tests (see tests/e2e-cleanup-db.ts).
 */
import type { FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { cleanupTestData } from "./e2e-cleanup-db";
import { loadE2EProcessEnv } from "./e2e-load-env";

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  loadE2EProcessEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "[global-teardown] Skip DB cleanup: missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local"
    );
    return;
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.includes("supabase.co")) {
    throw new Error("E2E tests must not run against production Supabase!");
  }

  const { deleted, warnings } = await cleanupTestData(createClient(url, key));
  if (warnings.length > 0) warnings.forEach((w) => console.warn(`[global-teardown] ${w}`));
  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  // Always log so `npm run test:local` is easy to grep (`deleted: { ... }` or `deleted: (none)`).
  console.log("[global-teardown] deleted:", total > 0 ? deleted : "(none — no matching test rows)");
}
