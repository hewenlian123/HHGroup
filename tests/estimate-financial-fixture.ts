import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

export const ESTIMATE_FINANCIAL_FIXTURE_ID = "bef76a22-bbc3-4af6-a886-625f0d756805";
export const ESTIMATE_FINANCIAL_FIXTURE_NUMBER = "EST-0063";

export const ESTIMATE_FINANCIAL_FIXTURE_BASELINE = {
  subtotal: "$1,020.01",
  tax: "$48.06",
  discount: "$106.81",
  total: "$961.26",
  deposit: "$384.50",
  final: "$576.76",
  remaining: "$0.00",
} as const;

export const ESTIMATE_FINANCIAL_FIXTURE_LEDGER = {
  subtotal: 1020.01,
  tax: 48.06,
  discount: 106.81,
  total: 961.26,
  deposit: 384.5,
  final: 576.76,
  remaining: 0,
} as const;

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin configuration is required.");

  assertEstimateCertificationLocalOnly({
    baseURL: process.env.E2E_BASE_URL,
    supabaseUrl: url,
    databaseUrl: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
  });

  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function requireSuccess(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`[EST-0063 fixture] ${label}: ${error.message}`);
}

export async function cleanupEstimateFinancialFixture(): Promise<void> {
  const db = localAdmin();
  for (const table of [
    "estimate_payment_schedule_items",
    "estimate_items",
    "estimate_categories",
    "estimate_meta",
  ] as const) {
    const { error } = await db
      .from(table)
      .delete()
      .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID);
    requireSuccess(`delete ${table}`, error);
  }

  await deleteLocalEstimateFixtureGraphs([ESTIMATE_FINANCIAL_FIXTURE_ID]);
}

export async function seedEstimateFinancialFixture(): Promise<{ depositId: string }> {
  await cleanupEstimateFinancialFixture();
  const db = localAdmin();

  try {
    requireSuccess(
      "insert estimates",
      (
        await db.from("estimates").insert({
          id: ESTIMATE_FINANCIAL_FIXTURE_ID,
          number: ESTIMATE_FINANCIAL_FIXTURE_NUMBER,
          client: "QA Test Customer",
          project: "QA Test Project",
          status: "Sent",
        })
      ).error
    );

    requireSuccess(
      "insert estimate_meta",
      (
        await db.from("estimate_meta").insert({
          estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
          client_name: "QA Test Customer",
          client_phone: "808-555-0063",
          client_email: "qa-0063@example.invalid",
          client_address: "63 Persistence Way",
          project_name: "QA Test Project",
          project_site_address: "63 Persistence Way",
          tax: ESTIMATE_FINANCIAL_FIXTURE_LEDGER.tax,
          discount: ESTIMATE_FINANCIAL_FIXTURE_LEDGER.discount,
          overhead_pct: 0.05,
          profit_pct: 0.1,
          estimate_date: "2026-08-29",
          valid_until: "2026-09-29",
        })
      ).error
    );

    requireSuccess(
      "insert estimate_categories",
      (
        await db.from("estimate_categories").insert([
          {
            estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
            cost_code: "010000",
            display_name: "Demolition",
            order_index: 0,
          },
          {
            estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
            cost_code: "020000",
            display_name: "Flooring",
            order_index: 1,
          },
        ])
      ).error
    );

    requireSuccess(
      "insert estimate_items",
      (
        await db.from("estimate_items").insert([
          {
            estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
            cost_code: "010000",
            desc: "Remove existing flooring",
            qty: 1,
            unit: "LS",
            unit_cost: 420.01,
            markup_pct: 0,
            sort_order: 0,
            status: "included",
          },
          {
            estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
            cost_code: "020000",
            desc: "Install SPC flooring",
            qty: 1,
            unit: "LS",
            unit_cost: 600,
            markup_pct: 0,
            sort_order: 1,
            status: "included",
          },
        ])
      ).error
    );

    const schedule = await db
      .from("estimate_payment_schedule_items")
      .insert([
        {
          estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
          sort_order: 0,
          title: "Deposit",
          amount: ESTIMATE_FINANCIAL_FIXTURE_LEDGER.deposit,
          status: "paid",
        },
        {
          estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
          sort_order: 1,
          title: "Final",
          amount: ESTIMATE_FINANCIAL_FIXTURE_LEDGER.final,
          status: "paid",
        },
      ])
      .select("id, title");
    requireSuccess("insert estimate_payment_schedule_items", schedule.error);

    const depositId = String(schedule.data?.find((row) => row.title === "Deposit")?.id ?? "");
    if (!depositId) throw new Error("[EST-0063 fixture] Deposit fixture id was not returned.");

    const [metaResult, itemResult, paymentResult] = await Promise.all([
      db
        .from("estimate_meta")
        .select("tax, discount, overhead_pct, profit_pct, estimate_date, valid_until")
        .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID)
        .single(),
      db
        .from("estimate_items")
        .select("qty, unit_cost")
        .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID),
      db
        .from("estimate_payment_schedule_items")
        .select("amount, status")
        .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID),
    ]);
    requireSuccess("verify estimate_meta", metaResult.error);
    requireSuccess("verify estimate_items", itemResult.error);
    requireSuccess("verify estimate_payment_schedule_items", paymentResult.error);
    if (!metaResult.data) throw new Error("[EST-0063 fixture] persisted meta was not returned.");

    const cents = (amount: number) => Math.round(amount * 100);
    const persistedSubtotal = (itemResult.data ?? []).reduce(
      (sum, item) => sum + Number(item.qty) * Number(item.unit_cost),
      0
    );
    const persistedTotal =
      persistedSubtotal + Number(metaResult.data.tax) - Number(metaResult.data.discount);
    const persistedScheduled = (paymentResult.data ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    if (
      cents(persistedSubtotal) !== cents(ESTIMATE_FINANCIAL_FIXTURE_LEDGER.subtotal) ||
      cents(persistedTotal) !== cents(ESTIMATE_FINANCIAL_FIXTURE_LEDGER.total) ||
      cents(persistedScheduled) !== cents(ESTIMATE_FINANCIAL_FIXTURE_LEDGER.total) ||
      cents(persistedTotal - persistedScheduled) !==
        cents(ESTIMATE_FINANCIAL_FIXTURE_LEDGER.remaining) ||
      Number(metaResult.data.overhead_pct) !== 0.05 ||
      Number(metaResult.data.profit_pct) !== 0.1 ||
      metaResult.data.estimate_date !== "2026-08-29" ||
      metaResult.data.valid_until !== "2026-09-29" ||
      paymentResult.data?.length !== 2 ||
      paymentResult.data.some((payment) => payment.status !== "paid")
    ) {
      throw new Error(
        `[EST-0063 fixture] persisted ledger mismatch: ` +
          `${persistedSubtotal} subtotal / ${persistedTotal} total / ` +
          `${persistedScheduled} scheduled / ${persistedTotal - persistedScheduled} remaining`
      );
    }

    return { depositId };
  } catch (error) {
    await cleanupEstimateFinancialFixture();
    throw error;
  }
}
