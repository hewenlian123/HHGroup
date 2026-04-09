/**
 * Idempotent: upsert the same preserved rows as supabase/seed.sql (minimal subset).
 * Usage: npx tsx scripts/ensure-e2e-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_WORKER_ID,
} from "../tests/e2e-cleanup-db";
import { ensureE2EPreservedSeed } from "../tests/e2e-ensure-seed";
import { loadE2EProcessEnv } from "../tests/e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "../tests/e2e-supabase-url-guard";

loadE2EProcessEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / anon key. " +
      "Load order: .env → .env.test → .env.e2e → .env.local — see .env.test.example."
  );
  process.exit(1);
}

assertE2ESupabaseUrlSafeForMutations(url);

ensureE2EPreservedSeed(createClient(url, key))
  .then(() => {
    console.log(
      "ensure-e2e-seed: OK",
      JSON.stringify({
        customer: E2E_PRESERVED_CUSTOMER_ID,
        worker: E2E_PRESERVED_WORKER_ID,
        project: E2E_PRESERVED_PROJECT_ID,
      })
    );
  })
  .catch((e) => {
    console.error("ensure-e2e-seed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
