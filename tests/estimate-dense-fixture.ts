import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

export const DENSE_ESTIMATE_ID = "edc68a63-cb87-4298-8231-9c668bf43ffe";
export const DENSE_ESTIMATE_NUMBER = "[E2E]-EST-DENSE-0079";
export const DENSE_ESTIMATE_TOTAL = 3_253_937;
export const DENSE_ESTIMATE_TAX = 1_250;
export const DENSE_ESTIMATE_DISCOUNT = 1_250;
export const DENSE_ESTIMATE_ITEM_COUNT = 62;
export const DENSE_ESTIMATE_PAYMENT_COUNT = 5;

const FIXTURE_DATE = "2026-08-29";
const SECTION_ITEM_COUNTS = [7, 7, 6, 6, 6, 6, 6, 6, 6, 6] as const;

export function captureUnexpectedBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

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
  if (error) throw new Error(`[dense Estimate fixture] ${label}: ${error.message}`);
}

function deterministicUuid(kind: "item" | "payment" | "note", ordinal: number): string {
  const namespace = kind === "item" ? "a100" : kind === "payment" ? "a200" : "a300";
  return `edc68a63-cb87-4298-${namespace}-${ordinal.toString(16).padStart(12, "0")}`;
}

export async function cleanupDenseEstimateFixture(): Promise<void> {
  const admin = localAdmin();
  for (const table of [
    "estimate_payment_schedule_items",
    "estimate_items",
    "estimate_categories",
    "estimate_meta",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("estimate_id", DENSE_ESTIMATE_ID);
    requireSuccess(`delete ${table}`, error);
  }

  await deleteLocalEstimateFixtureGraphs([DENSE_ESTIMATE_ID]);
}

export async function seedDenseEstimateFixture(): Promise<void> {
  await cleanupDenseEstimateFixture();
  const admin = localAdmin();

  const categories = SECTION_ITEM_COUNTS.map((_, index) => ({
    estimate_id: DENSE_ESTIMATE_ID,
    cost_code: `dense-${String(index + 1).padStart(2, "0")}`,
    display_name: `Certified Dense Scope ${index + 1}`,
    order_index: index,
  }));

  let ordinal = 0;
  const items = categories.flatMap((category, sectionIndex) =>
    Array.from({ length: SECTION_ITEM_COUNTS[sectionIndex] }, (_, itemIndex) => {
      ordinal += 1;
      const isFinalItem = ordinal === DENSE_ESTIMATE_ITEM_COUNT;
      const qty = isFinalItem ? 2 : 1 + (ordinal % 5);
      const unitCost = isFinalItem ? 98_868.5 : 6_000 + ordinal * 350;
      const title = `Certified construction scope line ${ordinal}`;
      return {
        id: deterministicUuid("item", ordinal),
        estimate_id: DENSE_ESTIMATE_ID,
        cost_code: category.cost_code,
        desc:
          `${title}\n` +
          `Provide labor, materials, coordination, protection, installation, inspection, cleanup, and closeout for section ${sectionIndex + 1}, item ${itemIndex + 1}.`,
        qty,
        unit: ["EA", "SF", "LF", "CY", "LS"][(ordinal - 1) % 5],
        unit_cost: unitCost,
        markup_pct: 0,
        sort_order: ordinal - 1,
        status: ordinal % 13 === 0 ? "allowance" : "included",
        hide_amount_on_pdf: false,
      };
    })
  );

  const computedTotal = items.reduce((sum, item) => sum + item.qty * item.unit_cost, 0);
  if (items.length !== DENSE_ESTIMATE_ITEM_COUNT || computedTotal !== DENSE_ESTIMATE_TOTAL) {
    throw new Error(
      `[dense Estimate fixture] invalid ledger: ${items.length} items total ${computedTotal}`
    );
  }

  const paymentAmount = DENSE_ESTIMATE_TOTAL / DENSE_ESTIMATE_PAYMENT_COUNT;
  const payments = Array.from({ length: DENSE_ESTIMATE_PAYMENT_COUNT }, (_, index) => ({
    id: deterministicUuid("payment", index + 1),
    estimate_id: DENSE_ESTIMATE_ID,
    title: `Certified payment milestone ${index + 1}`,
    description: `Fixed-dollar milestone ${index + 1} for the deterministic local Estimate fixture.`,
    amount: paymentAmount,
    due_date: null,
    status: "draft",
    sort_order: index,
  }));

  try {
    requireSuccess(
      "insert estimates",
      (
        await admin.from("estimates").insert({
          id: DENSE_ESTIMATE_ID,
          number: DENSE_ESTIMATE_NUMBER,
          client: "[E2E] Pacific Heritage Construction Partners",
          project: "[E2E] Oceanfront Hospitality Renovation and Site Modernization",
          status: "Draft",
          updated_at: FIXTURE_DATE,
        })
      ).error
    );
    requireSuccess(
      "insert estimate_meta",
      (
        await admin.from("estimate_meta").insert({
          estimate_id: DENSE_ESTIMATE_ID,
          client_name: "[E2E] Pacific Heritage Construction Partners",
          client_phone: "808-555-0079",
          client_email: "dense-estimate@example.invalid",
          client_address: "79 Local Certification Way, Honolulu, Hawaiʻi 96813",
          project_name: "[E2E] Oceanfront Hospitality Renovation and Site Modernization",
          project_site_address: "79 Local Certification Way, Honolulu, Hawaiʻi 96813",
          cost_category_names: { __hh: { documentStyle: "itemized" } },
          tax: DENSE_ESTIMATE_TAX,
          discount: DENSE_ESTIMATE_DISCOUNT,
          overhead_pct: 0,
          profit_pct: 0,
          estimate_date: FIXTURE_DATE,
          valid_until: "2026-09-28",
          notes: "[E2E] Deterministic dense historical-contract fixture.",
          sales_person: "Local QA",
          document_notes: [
            {
              id: deterministicUuid("note", 1),
              type: "assumptions",
              title: "Site access assumptions",
              body: "Pricing assumes coordinated weekday access, timely approvals, and unobstructed work areas.",
            },
            {
              id: deterministicUuid("note", 2),
              type: "clarifications",
              title: "Scope clarifications",
              body: "Concealed conditions and owner-requested changes remain subject to written authorization.",
            },
          ],
        })
      ).error
    );
    requireSuccess(
      "insert estimate_categories",
      (await admin.from("estimate_categories").insert(categories)).error
    );
    requireSuccess(
      "insert estimate_items",
      (await admin.from("estimate_items").insert(items)).error
    );
    requireSuccess(
      "insert estimate_payment_schedule_items",
      (await admin.from("estimate_payment_schedule_items").insert(payments)).error
    );

    const [estimateResult, metaResult, itemResult, paymentResult] = await Promise.all([
      admin.from("estimates").select("id, number").eq("id", DENSE_ESTIMATE_ID).single(),
      admin
        .from("estimate_meta")
        .select("tax, discount")
        .eq("estimate_id", DENSE_ESTIMATE_ID)
        .single(),
      admin.from("estimate_items").select("qty, unit_cost").eq("estimate_id", DENSE_ESTIMATE_ID),
      admin
        .from("estimate_payment_schedule_items")
        .select("amount")
        .eq("estimate_id", DENSE_ESTIMATE_ID),
    ]);
    requireSuccess("verify estimates", estimateResult.error);
    requireSuccess("verify estimate_meta", metaResult.error);
    requireSuccess("verify estimate_items", itemResult.error);
    requireSuccess("verify estimate_payment_schedule_items", paymentResult.error);
    if (!estimateResult.data || !metaResult.data || !itemResult.data || !paymentResult.data) {
      throw new Error("[dense Estimate fixture] verification query returned no data.");
    }

    const persistedTotal = itemResult.data.reduce(
      (sum, item) => sum + Number(item.qty) * Number(item.unit_cost),
      0
    );
    const persistedPayments = paymentResult.data.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0
    );
    if (
      estimateResult.data.number !== DENSE_ESTIMATE_NUMBER ||
      Number(metaResult.data.tax) !== DENSE_ESTIMATE_TAX ||
      Number(metaResult.data.discount) !== DENSE_ESTIMATE_DISCOUNT ||
      itemResult.data.length !== DENSE_ESTIMATE_ITEM_COUNT ||
      paymentResult.data.length !== DENSE_ESTIMATE_PAYMENT_COUNT ||
      persistedTotal !== DENSE_ESTIMATE_TOTAL ||
      persistedPayments !== DENSE_ESTIMATE_TOTAL
    ) {
      throw new Error(
        `[dense Estimate fixture] persisted contract mismatch: ` +
          `${itemResult.data.length} items / ${paymentResult.data.length} payments / ` +
          `${persistedTotal} item total / ${persistedPayments} scheduled`
      );
    }
  } catch (error) {
    await cleanupDenseEstimateFixture();
    throw error;
  }
}
