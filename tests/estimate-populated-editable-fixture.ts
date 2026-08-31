import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

export const POPULATED_EDITABLE_ESTIMATE_ID = "a6f7d9b0-8732-4fe1-a2f4-62b77c462004";
export const POPULATED_EDITABLE_ESTIMATE_NUMBER = "[E2E]-EST-POP-004";
export const POPULATED_EDITABLE_SECTION_COUNT = 2;
export const POPULATED_EDITABLE_LINE_ITEM_COUNT = 3;

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
  if (error) throw new Error(`[populated editable Estimate fixture] ${label}: ${error.message}`);
}

export async function cleanupPopulatedEditableEstimateFixture(): Promise<void> {
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
      .eq("estimate_id", POPULATED_EDITABLE_ESTIMATE_ID);
    requireSuccess(`delete ${table}`, error);
  }

  await deleteLocalEstimateFixtureGraphs([POPULATED_EDITABLE_ESTIMATE_ID]);
}

export async function seedPopulatedEditableEstimateFixture(): Promise<void> {
  await cleanupPopulatedEditableEstimateFixture();
  const db = localAdmin();

  try {
    requireSuccess(
      "insert estimates",
      (
        await db.from("estimates").insert({
          id: POPULATED_EDITABLE_ESTIMATE_ID,
          number: POPULATED_EDITABLE_ESTIMATE_NUMBER,
          client: "[E2E] Populated Editable Customer",
          project: "[E2E] Populated Editable Project",
          status: "Draft",
        })
      ).error
    );

    requireSuccess(
      "insert estimate_meta",
      (
        await db.from("estimate_meta").insert({
          estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
          client_name: "[E2E] Populated Editable Customer",
          client_phone: "808-555-4004",
          client_email: "populated-estimate@example.invalid",
          client_address: "4 Local Fixture Lane",
          project_name: "[E2E] Populated Editable Project",
          project_site_address: "4 Local Fixture Lane",
          tax: 0,
          discount: 0,
          overhead_pct: 0,
          profit_pct: 0,
          estimate_date: "2026-08-29",
          valid_until: "2026-09-29",
        })
      ).error
    );

    const categories = [
      {
        estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
        cost_code: "e2e-pop-01",
        display_name: "Site preparation",
        order_index: 0,
      },
      {
        estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
        cost_code: "e2e-pop-02",
        display_name: "Finish work",
        order_index: 1,
      },
    ];
    requireSuccess(
      "insert estimate_categories",
      (await db.from("estimate_categories").insert(categories)).error
    );

    const items = [
      {
        id: "a6f7d9b0-8732-4fe1-a2f4-62b77c462101",
        estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
        cost_code: "e2e-pop-01",
        desc: "Protect adjacent finishes\nInstall temporary protection before construction.",
        qty: 1,
        unit: "LS",
        unit_cost: 1250,
        markup_pct: 0,
        sort_order: 0,
        status: "included",
      },
      {
        id: "a6f7d9b0-8732-4fe1-a2f4-62b77c462102",
        estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
        cost_code: "e2e-pop-01",
        desc: "Prepare existing surfaces\nClean and prepare substrates for finish work.",
        qty: 2,
        unit: "EA",
        unit_cost: 375,
        markup_pct: 0,
        sort_order: 1,
        status: "included",
      },
      {
        id: "a6f7d9b0-8732-4fe1-a2f4-62b77c462103",
        estimate_id: POPULATED_EDITABLE_ESTIMATE_ID,
        cost_code: "e2e-pop-02",
        desc: "Complete finish installation\nInstall, inspect, clean, and close out finish scope.",
        qty: 3,
        unit: "EA",
        unit_cost: 500,
        markup_pct: 0,
        sort_order: 2,
        status: "included",
      },
    ];
    requireSuccess("insert estimate_items", (await db.from("estimate_items").insert(items)).error);

    const [sectionResult, itemResult] = await Promise.all([
      db
        .from("estimate_categories")
        .select("cost_code, order_index")
        .eq("estimate_id", POPULATED_EDITABLE_ESTIMATE_ID)
        .order("order_index"),
      db
        .from("estimate_items")
        .select("id, cost_code, sort_order")
        .eq("estimate_id", POPULATED_EDITABLE_ESTIMATE_ID)
        .order("sort_order"),
    ]);
    requireSuccess("verify estimate_categories", sectionResult.error);
    requireSuccess("verify estimate_items", itemResult.error);
    if (
      sectionResult.data?.length !== POPULATED_EDITABLE_SECTION_COUNT ||
      itemResult.data?.length !== POPULATED_EDITABLE_LINE_ITEM_COUNT
    ) {
      throw new Error(
        `[populated editable Estimate fixture] persisted contract mismatch: ` +
          `${sectionResult.data?.length ?? 0} sections / ${itemResult.data?.length ?? 0} items`
      );
    }
  } catch (error) {
    await cleanupPopulatedEditableEstimateFixture();
    throw error;
  }
}
