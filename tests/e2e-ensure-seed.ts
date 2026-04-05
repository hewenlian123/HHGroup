/**
 * Ensure fixed E2E rows exist before Playwright runs (same UUIDs / labels as supabase/seed.sql).
 * Safe to call repeatedly (upsert). Handles sparse schemas (missing optional columns) and FK issues.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_LABOR_ENTRY_ID,
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

  // Unpaid labor for [E2E] Seed Worker so /labor/workers/:id/balance enables "Pay Worker" (globalSetup-only DBs
  // often lack rows that full supabase/seed.sql would insert).
  const { error: laborProbeErr } = await supabase.from("labor_entries").select("id").limit(1);
  if (laborProbeErr && isMissingTableError(laborProbeErr.message)) {
    /* optional table */
  } else if (laborProbeErr) {
    throw new Error(`E2E seed labor_entries probe: ${laborProbeErr.message}`);
  } else {
    const y = new Date();
    y.setUTCDate(y.getUTCDate() - 1);
    const workDate = y.toISOString().slice(0, 10);
    const notes = "[E2E] SEED preserved unpaid labor";
    const wid = E2E_PRESERVED_WORKER_ID;
    const pid = E2E_PRESERVED_PROJECT_ID;
    const lid = E2E_PRESERVED_LABOR_ENTRY_ID;

    await supabase.from("labor_entries").delete().eq("id", lid);

    // Shapes mirror `insertLaborEntryShaped` (api/test/financial-workflows) — schemas differ by migration.
    // Older DBs: project_am_id + day_rate + total (see 202603082100_daily_labor_log_schema.sql).
    // Newer DBs: project_id + work_date + hours + cost_amount (+ optional morning/afternoon, status).
    const laborAttempts: RecordUpsert[] = [
      {
        id: lid,
        worker_id: wid,
        work_date: workDate,
        project_am_id: pid,
        project_pm_id: null,
        day_rate: 200,
        ot_amount: 0,
        total: 200,
      },
      {
        id: lid,
        worker_id: wid,
        work_date: workDate,
        project_am_id: pid,
        day_rate: 200,
        ot_amount: 0,
        total: 200,
      },
      {
        id: lid,
        worker_id: wid,
        project_id: pid,
        work_date: workDate,
        hours: 8,
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "Draft",
        worker_payment_id: null,
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "Draft",
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        work_date: workDate,
        cost_amount: 200,
        status: "Draft",
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        entry_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "Draft",
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        project_id: pid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "Draft",
        worker_payment_id: null,
        morning: true,
        afternoon: true,
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        project_id: pid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "Draft",
        morning: true,
        afternoon: true,
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        project_id: pid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        notes,
      },
      {
        id: lid,
        worker_id: wid,
        project_id: pid,
        work_date: workDate,
        hours: 8,
        cost_amount: 200,
        status: "pending",
        notes,
      },
    ];

    let laborLastErr = "";
    let laborOk = false;
    for (const payload of laborAttempts) {
      const { error } = await supabase
        .from("labor_entries")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (!error) {
        laborOk = true;
        break;
      }
      laborLastErr = error.message ?? "";
      const retry = missingColumnOrSchemaCache(laborLastErr) || isForeignKeyError(laborLastErr);
      if (!retry) {
        throw new Error(`E2E seed labor_entries: ${laborLastErr}`);
      }
    }
    if (!laborOk) {
      throw new Error(
        `E2E seed labor_entries: no insert shape matched this DB. Last error: ${laborLastErr || "(none)"}`
      );
    }
  }

  // Default payment accounts for expenses / receipt queue (matches migration seed).
  const { error: paymentAccountsProbe } = await supabase
    .from("payment_accounts")
    .select("id")
    .limit(1);
  if (paymentAccountsProbe && isMissingTableError(paymentAccountsProbe.message)) {
    /* optional until payment_accounts migration */
  } else if (paymentAccountsProbe) {
    throw new Error(`E2E seed payment_accounts probe: ${paymentAccountsProbe.message}`);
  } else {
    const { error: paUpsert } = await supabase.from("payment_accounts").upsert(
      [
        { name: "Cash", type: "cash" },
        { name: "Amex", type: "card" },
        { name: "Chase", type: "card" },
      ],
      { onConflict: "name" }
    );
    if (paUpsert) {
      throw new Error(`E2E seed payment_accounts: ${paUpsert.message}`);
    }
  }
}
