import { expect, test } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase service role is required for this test.");
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

test("Estimate transitions Draft to Sent to Rejected and becomes protected", async ({ page }) => {
  test.setTimeout(120_000);
  const db = localAdmin();
  const suffix = Date.now();
  const estimateNumber = `EST-REJECT-${suffix}`;
  let estimateId = "";
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  try {
    const estimate = await db
      .from("estimates")
      .insert({
        number: estimateNumber,
        client: "Rejected lifecycle customer",
        project: "Rejected lifecycle project",
        status: "Draft",
      })
      .select("id")
      .single();
    if (estimate.error || !estimate.data?.id) {
      throw new Error(estimate.error?.message ?? "Could not seed Estimate.");
    }
    estimateId = String(estimate.data.id);

    const meta = await db.from("estimate_meta").insert({
      estimate_id: estimateId,
      client_name: "Rejected lifecycle customer",
      project_name: "Rejected lifecycle project",
      estimate_date: "2026-08-24",
      tax: 0,
      discount: 0,
    });
    if (meta.error) throw new Error(meta.error.message);

    const item = await db.from("estimate_items").insert({
      estimate_id: estimateId,
      cost_code: "010000",
      desc: "Rejected lifecycle browser fixture",
      qty: 1,
      unit: "LS",
      unit_cost: 1000,
      markup_pct: 0,
      sort_order: 0,
    });
    if (item.error) throw new Error(item.error.message);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${estimateId}`);
    const header = page.getByTestId("estimate-detail-header");
    await expect(header).toContainText("Draft");

    await page.getByRole("button", { name: "Mark as Sent", exact: true }).click();
    await expect(header).toContainText("Sent");
    await page.getByRole("button", { name: "Mark declined", exact: true }).click();

    await expect(header).toContainText("Rejected");
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("create-estimate-revision-action")).toBeVisible();

    await page.getByRole("button", { name: "Estimate actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await expect
      .poll(async () => {
        const result = await db.from("estimates").select("status").eq("id", estimateId).single();
        if (result.error) throw new Error(result.error.message);
        return result.data?.status;
      })
      .toBe("Rejected");

    expect(runtimeErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    if (estimateId) {
      await db.from("estimate_items").delete().eq("estimate_id", estimateId);
      await db.from("estimate_meta").delete().eq("estimate_id", estimateId);
      await deleteLocalEstimateFixtureGraphs([estimateId]);
    }
  }
});
