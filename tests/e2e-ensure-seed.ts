/**
 * Ensure fixed E2E rows exist before Playwright runs (same UUIDs / labels as supabase/seed.sql).
 * Safe to call repeatedly (upsert). Handles sparse schemas (missing optional columns) and FK issues.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_WORKER_ID,
} from "./e2e-cleanup-db";

function missingColumnOrSchemaCache(msg: string): boolean {
  return /column|does not exist|schema cache|pgrst204|could not find|unknown field/i.test(msg);
}

function isForeignKeyError(msg: string): boolean {
  return /foreign key|violates foreign key|23503/i.test(msg);
}

function isMissingTableError(msg: string): boolean {
  return /relation.*does not exist|Could not find the table/i.test(msg);
}

type RecordUpsert = Record<string, unknown>;

async function upsertFirstSuccess(
  supabase: SupabaseClient,
  table: string,
  variants: RecordUpsert[],
  onConflict: string
): Promise<void> {
  let lastErr: { message: string } | null = null;
  for (const payload of variants) {
    const r = await supabase.from(table).upsert(payload, { onConflict });
    if (!r.error) return;
    lastErr = r.error;
    const retry = missingColumnOrSchemaCache(r.error.message) || isForeignKeyError(r.error.message);
    if (!retry) break;
  }
  if (lastErr) throw new Error(`E2E seed ${table}: ${lastErr.message}`);
}

export async function ensureE2EPreservedSeed(supabase: SupabaseClient): Promise<void> {
  const customerVariants: RecordUpsert[] = [
    {
      id: E2E_PRESERVED_CUSTOMER_ID,
      name: "[E2E] Test Customer",
      email: "e2e-customer@example.test",
      phone: "555-0101",
      address: "100 Seed Lane",
    },
    {
      id: E2E_PRESERVED_CUSTOMER_ID,
      name: "[E2E] Test Customer",
      email: "e2e-customer@example.test",
    },
    {
      id: E2E_PRESERVED_CUSTOMER_ID,
      name: "[E2E] Test Customer",
    },
  ];
  const { error: ce } = await supabase.from("customers").select("id").limit(1);
  if (ce && isMissingTableError(ce.message)) {
    throw new Error(
      `E2E seed: table customers is missing — apply supabase migrations before db:seed:e2e. (${ce.message})`
    );
  }

  await upsertFirstSuccess(supabase, "customers", customerVariants, "id");

  const workerVariants: RecordUpsert[] = [
    {
      id: E2E_PRESERVED_WORKER_ID,
      name: "[E2E] Seed Worker",
      trade: "Carpenter",
      phone: "555-0200",
      daily_rate: 200,
      default_ot_rate: 0,
      status: "Active",
      notes: "[E2E] SEED",
    },
    {
      id: E2E_PRESERVED_WORKER_ID,
      name: "[E2E] Seed Worker",
      trade: "Carpenter",
      phone: "555-0200",
      daily_rate: 200,
      default_ot_rate: 0,
      status: "active",
      notes: "[E2E] SEED",
    },
    {
      id: E2E_PRESERVED_WORKER_ID,
      name: "[E2E] Seed Worker",
      role: "Carpenter",
      phone: "555-0200",
      half_day_rate: 100,
      status: "active",
      notes: "[E2E] SEED",
    },
    {
      id: E2E_PRESERVED_WORKER_ID,
      name: "[E2E] Seed Worker",
      role: "Carpenter",
      half_day_rate: 100,
      status: "active",
    },
    {
      id: E2E_PRESERVED_WORKER_ID,
      name: "[E2E] Seed Worker",
      half_day_rate: 0,
      status: "active",
    },
  ];
  await upsertFirstSuccess(supabase, "workers", workerVariants, "id");

  await supabase
    .from("labor_workers")
    .upsert({ id: E2E_PRESERVED_WORKER_ID, name: "[E2E] Seed Worker" }, { onConflict: "id" })
    .then(() => undefined);

  const projectFull: RecordUpsert = {
    id: E2E_PRESERVED_PROJECT_ID,
    name: "[E2E] Seed — HH Unified",
    status: "active",
    budget: 100000,
    spent: 0,
    client: "[E2E] Client",
    client_name: "[E2E] Client",
    customer_id: E2E_PRESERVED_CUSTOMER_ID,
    address: "100 Seed Lane, Testville",
    notes: "[E2E] SEED — preserved row for Playwright",
  };
  const projectVariants: RecordUpsert[] = [
    projectFull,
    (() => {
      const { client_name: _a, ...r } = projectFull;
      return r;
    })(),
    (() => {
      const { client_name: _a, customer_id: _b, ...r } = projectFull;
      return r;
    })(),
    (() => {
      const { client_name: _a, customer_id: _b, address: _c, notes: _d, ...r } = projectFull;
      return r;
    })(),
    {
      id: E2E_PRESERVED_PROJECT_ID,
      name: "[E2E] Seed — HH Unified",
      status: "active",
      budget: 100000,
      spent: 0,
      client: "[E2E] Client",
    },
    {
      id: E2E_PRESERVED_PROJECT_ID,
      name: "[E2E] Seed — HH Unified",
      status: "active",
      budget: 100000,
      spent: 0,
    },
  ];
  await upsertFirstSuccess(supabase, "projects", projectVariants, "id");
}
