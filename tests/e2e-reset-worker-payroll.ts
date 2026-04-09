/**
 * Reset E2E seed worker payroll state (worker_payments + labor_entries links).
 * Used by Playwright global-setup and payment E2E beforeEach so partial runs do not leave
 * "already settled" or orphan payment rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_LABOR_ENTRY_ID, E2E_PRESERVED_WORKER_ID } from "./e2e-cleanup-db";
import { ensureE2EPreservedSeed } from "./e2e-ensure-seed";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

export async function resetE2ESeedWorkerPayrollStateWithClient(
  admin: SupabaseClient
): Promise<void> {
  assertE2ESupabaseUrlSafeForMutations(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const wid = E2E_PRESERVED_WORKER_ID;
  const keepLaborId = E2E_PRESERVED_LABOR_ENTRY_ID;

  const payDel = await admin.from("worker_payments").delete().eq("worker_id", wid);
  if (
    payDel.error &&
    !/relation.*does not exist|schema cache|pgrst205/i.test(payDel.error.message ?? "")
  ) {
    console.warn("[e2e-reset-worker-payroll] worker_payments cleanup:", payDel.error.message);
  }

  const delStray = await admin
    .from("labor_entries")
    .delete()
    .eq("worker_id", wid)
    .neq("id", keepLaborId);
  if (delStray.error && !/column|schema cache|does not exist/i.test(delStray.error.message ?? "")) {
    console.warn("[e2e-reset-worker-payroll] labor_entries stray delete:", delStray.error.message);
  }

  const uLink = await admin
    .from("labor_entries")
    .update({ worker_payment_id: null })
    .eq("worker_id", wid);
  if (uLink.error && !/column|schema cache|worker_payment_id/i.test(uLink.error.message ?? "")) {
    console.warn(
      "[e2e-reset-worker-payroll] labor_entries worker_payment_id clear:",
      uLink.error.message
    );
  }

  const uStat = await admin.from("labor_entries").update({ status: "Draft" }).eq("worker_id", wid);
  if (uStat.error && !/column|schema cache|status/i.test(uStat.error.message ?? "")) {
    console.warn("[e2e-reset-worker-payroll] labor_entries status reset:", uStat.error.message);
  }
}

/** Load env from .env / .env.local then reset (no-op if URL or service role missing). */
export async function resetE2ESeedWorkerPayrollStateFromEnv(): Promise<void> {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  await resetE2ESeedWorkerPayrollStateWithClient(createClient(url, key));
}

/**
 * Reset payroll links, then re-upsert preserved E2E rows (worker, project, unpaid labor).
 * Use in worker-payment specs so a long main suite cannot leave the seed worker without payable labor.
 */
export async function resetAndEnsureE2EPaymentSeedFromEnv(): Promise<void> {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  await resetE2ESeedWorkerPayrollStateWithClient(supabase);
  await ensureE2EPreservedSeed(supabase);
}
