/**
 * Before all Playwright tests: ensure preserved E2E rows exist (see supabase/seed.sql).
 *
 * - Loads `.env` then `.env.local` (local overrides).
 * - Set `E2E_SKIP_DB_SEED=1` to skip (no Supabase / UI-only runs).
 * - When URL + key are present, seed **must** succeed or the suite fails fast.
 */
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { FullConfig } from "@playwright/test";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_WORKER_ID,
  purgeE2EReceiptQueueRows,
} from "./e2e-cleanup-db";
import { runSchemaAutoRepair } from "../src/lib/ensure-schema-auto-repair";
import { ensureE2EPreservedSeed } from "./e2e-ensure-seed";
import { resetE2ESeedWorkerPayrollStateWithClient } from "./e2e-reset-worker-payroll";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env.E2E_SKIP_DB_SEED === "1") {
    console.log("[global-setup] E2E_SKIP_DB_SEED=1 — skipping DB seed.");
    return;
  }

  loadDotenv({ path: resolve(process.cwd(), ".env") });
  loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "[global-setup] E2E seed required: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local — or set E2E_SKIP_DB_SEED=1 to skip."
    );
  }

  const repair = await runSchemaAutoRepair();
  if (repair.hasDatabaseUrl) {
    console.log("[global-setup] schema auto-repair:", repair.message);
  } else {
    console.log("[global-setup] schema auto-repair skipped:", repair.message);
  }

  const supabase = createClient(url, key);
  await resetE2ESeedWorkerPayrollStateWithClient(supabase);
  await ensureE2EPreservedSeed(supabase);

  const rqPurged = await purgeE2EReceiptQueueRows(supabase);
  if (rqPurged > 0) {
    console.log(`[global-setup] purged ${rqPurged} stale E2E receipt_queue row(s).`);
  }

  const ids = {
    customer: E2E_PRESERVED_CUSTOMER_ID,
    worker: E2E_PRESERVED_WORKER_ID,
    project: E2E_PRESERVED_PROJECT_ID,
  };
  console.log("[global-setup] E2E preserved seed OK", JSON.stringify(ids));

  const checks = await Promise.all([
    supabase.from("customers").select("id").eq("id", E2E_PRESERVED_CUSTOMER_ID).maybeSingle(),
    supabase.from("workers").select("id").eq("id", E2E_PRESERVED_WORKER_ID).maybeSingle(),
    supabase.from("projects").select("id").eq("id", E2E_PRESERVED_PROJECT_ID).maybeSingle(),
  ]);
  const labels = ["customer", "worker", "project"] as const;
  for (let i = 0; i < checks.length; i++) {
    const row = checks[i].data as { id?: string } | null;
    if (!row?.id) {
      throw new Error(`[global-setup] Post-seed verify failed: ${labels[i]} row missing.`);
    }
  }
  console.log("[global-setup] Post-seed DB verify OK (3333… / 2222… / 1111… present).");

  // Prime Next.js dev compile for heavy routes so first tests do not sit on AppShell "Loading…".
  const base = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  if (process.env.E2E_SKIP_APP_WARMUP !== "1") {
    const paths = ["/financial/expenses", "/dashboard", "/financial/receipt-queue"];
    for (const p of paths) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 180_000);
        const res = await fetch(`${base}${p}`, { signal: ac.signal, redirect: "follow" });
        clearTimeout(timer);
        if (!res.ok) {
          console.warn(`[global-setup] App warmup ${p}: HTTP ${res.status}`);
        }
      } catch (e) {
        console.warn(
          "[global-setup] App warmup fetch failed (non-fatal):",
          p,
          e instanceof Error ? e.message : e
        );
      }
    }
    console.log("[global-setup] App warmup finished.");
  }
}
