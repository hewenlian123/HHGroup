import { expect, test, type Locator, type Page } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
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

async function openLineMenu(page: Page, lineId: string): Promise<void> {
  const row = page.locator(`[data-estimate-section-id] [data-estimate-line-item-id="${lineId}"]`);
  await row.hover();
  const actions = row.getByRole("button", { name: "More actions" });
  await expect(actions).toBeVisible();
  await actions.click();
}

async function dragLineHandleToRow(page: Page, handle: Locator, target: Locator): Promise<void> {
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Could not measure line item drag targets.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 8, {
    steps: 10,
  });
  await page.mouse.up();
}

async function performAndWaitForEstimateRefresh(
  page: Page,
  estimateId: string,
  action: () => Promise<void>
): Promise<void> {
  const refreshResponse = page.waitForResponse(
    (response) => {
      const headers = response.request().headers();
      return (
        new URL(response.url()).pathname === `/estimates/${estimateId}` &&
        headers["rsc"] === "1" &&
        headers["next-router-prefetch"] !== "1" &&
        headers["next-action"] === undefined
      );
    },
    { timeout: 30_000 }
  );
  await action();
  const response = await refreshResponse;
  expect(response.ok()).toBe(true);
  await page.waitForLoadState("networkidle");
}

test("Estimate items reorder atomically within/across Sections and persist after reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
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

  async function persistedItems() {
    const result = await db
      .from("estimate_items")
      .select(
        "id, cost_code, desc, qty, unit, unit_cost, markup_pct, status, hide_amount_on_pdf, sort_order"
      )
      .eq("estimate_id", estimateId)
      .order("sort_order")
      .order("id");
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async function expectPersistedOrder(expected: string[]): Promise<void> {
    await expect
      .poll(async () => (await persistedItems()).map((item) => item.id))
      .toEqual(expected);
    expect((await persistedItems()).map((item) => item.sort_order)).toEqual(
      expected.map((_, index) => index)
    );
    // Each reorder action schedules router.refresh(). Do not begin another
    // mutation or full reload while that RSC request is still in flight.
    await page.waitForLoadState("networkidle");
  }

  try {
    const estimateInsert = await db
      .from("estimates")
      .insert({
        number: `EST-P2C-${suffix}`,
        client: `P2C Customer ${suffix}`,
        project: `P2C Project ${suffix}`,
        status: "Draft",
      })
      .select("id")
      .single();
    if (estimateInsert.error || !estimateInsert.data?.id) {
      throw new Error(estimateInsert.error?.message ?? "Could not seed Estimate.");
    }
    estimateId = String(estimateInsert.data.id);

    const metaInsert = await db.from("estimate_meta").insert({
      estimate_id: estimateId,
      client_name: `P2C Customer ${suffix}`,
      project_name: `P2C Project ${suffix}`,
      tax: 47.12,
      discount: 5,
      estimate_date: "2026-08-22",
    });
    if (metaInsert.error) throw new Error(metaInsert.error.message);

    const categoryInsert = await db.from("estimate_categories").insert([
      { estimate_id: estimateId, cost_code: "100000", display_name: "Section One", order_index: 0 },
      { estimate_id: estimateId, cost_code: "200000", display_name: "Section Two", order_index: 1 },
    ]);
    if (categoryInsert.error) throw new Error(categoryInsert.error.message);

    const itemInsert = await db
      .from("estimate_items")
      .insert([
        {
          estimate_id: estimateId,
          cost_code: "100000",
          desc: "Alpha detail",
          qty: 2,
          unit: "EA",
          unit_cost: 10.25,
          markup_pct: 0,
          status: "included",
          hide_amount_on_pdf: false,
          sort_order: 0,
        },
        {
          estimate_id: estimateId,
          cost_code: "100000",
          desc: "Bravo optional",
          qty: 3,
          unit: "LF",
          unit_cost: 20.5,
          markup_pct: 0,
          status: "optional",
          hide_amount_on_pdf: true,
          sort_order: 1,
        },
        {
          estimate_id: estimateId,
          cost_code: "200000",
          desc: "Charlie allowance",
          qty: 4,
          unit: "SF",
          unit_cost: 30.75,
          markup_pct: 0,
          status: "allowance",
          hide_amount_on_pdf: false,
          sort_order: 2,
        },
        {
          estimate_id: estimateId,
          cost_code: "200000",
          desc: "Delta owner supplied",
          qty: 5,
          unit: "LS",
          unit_cost: 40,
          markup_pct: 0,
          status: "owner_supplied",
          hide_amount_on_pdf: true,
          sort_order: 3,
        },
      ])
      .select("id, desc");
    if (itemInsert.error) throw new Error(itemInsert.error.message);
    const idByDescription = Object.fromEntries(
      (itemInsert.data ?? []).map((item) => [item.desc, String(item.id)])
    );
    const alpha = idByDescription["Alpha detail"];
    const bravo = idByDescription["Bravo optional"];
    const charlie = idByDescription["Charlie allowance"];
    const delta = idByDescription["Delta owner supplied"];
    const original = await persistedItems();
    const originalTotal = original.reduce(
      (sum, item) => sum + Number(item.qty) * Number(item.unit_cost),
      0
    );

    await loginAsE2EOwner(page, `/estimates/${estimateId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    // Keyboard-accessible move down and move up.
    await openLineMenu(page, alpha);
    await performAndWaitForEstimateRefresh(page, estimateId, () =>
      page.getByRole("menuitem", { name: "Move line item down" }).click()
    );
    await expectPersistedOrder([bravo, alpha, charlie, delta]);
    expect(runtimeErrors).toEqual([]);
    await openLineMenu(page, alpha);
    const moveAlphaUp = page.getByRole("menuitem", { name: "Move line item up" });
    await expect(moveAlphaUp).not.toHaveAttribute("data-disabled", "");
    await performAndWaitForEstimateRefresh(page, estimateId, () => moveAlphaUp.click());
    await expectPersistedOrder([alpha, bravo, charlie, delta]);
    expect(runtimeErrors).toEqual([]);

    // Handle-only drag within the first Section.
    const alphaRow = page.locator(
      `[data-estimate-section-id="100000"] [data-estimate-line-item-id="${alpha}"]`
    );
    const bravoRow = page.locator(
      `[data-estimate-section-id="100000"] [data-estimate-line-item-id="${bravo}"]`
    );
    const alphaDragHandle = alphaRow.getByRole("button", {
      name: /Drag to reorder line item/,
    });
    await expect(alphaDragHandle).toBeEnabled();
    await performAndWaitForEstimateRefresh(page, estimateId, () =>
      dragLineHandleToRow(page, alphaDragHandle, bravoRow)
    );
    await expectPersistedOrder([bravo, alpha, charlie, delta]);
    expect(runtimeErrors).toEqual([]);

    // Existing move-to-Section interaction now uses the same atomic order engine.
    await openLineMenu(page, alpha);
    await page.getByRole("menuitem", { name: "Move to section" }).hover();
    await performAndWaitForEstimateRefresh(page, estimateId, () =>
      page.getByRole("menuitem", { name: "Section Two", exact: true }).press("Enter")
    );
    await expectPersistedOrder([bravo, charlie, delta, alpha]);
    expect(runtimeErrors).toEqual([]);

    await page.waitForLoadState("networkidle");
    await reloadWithE2EAuth(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.locator('[data-estimate-section-id="100000"] [data-estimate-line-item-id]')
    ).toHaveAttribute("data-estimate-line-item-id", bravo);
    await expect(
      page.locator('[data-estimate-section-id="200000"] [data-estimate-line-item-id]')
    ).toHaveCount(3);

    // Existing Section reorder remains independent and persistent.
    const sectionHandles = page.getByRole("button", { name: "Reorder section" });
    const sections = page.locator("[data-estimate-section-id]");
    await performAndWaitForEstimateRefresh(page, estimateId, () =>
      dragLineHandleToRow(page, sectionHandles.first(), sectionHandles.nth(1))
    );
    await expect
      .poll(async () => {
        const result = await db
          .from("estimate_categories")
          .select("cost_code")
          .eq("estimate_id", estimateId)
          .order("order_index");
        return (result.data ?? []).map((category) => category.cost_code);
      })
      .toEqual(["200000", "100000"]);
    await page.waitForLoadState("networkidle");
    expect(runtimeErrors).toEqual([]);
    await reloadWithE2EAuth(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(sections.first()).toHaveAttribute("data-estimate-section-id", "200000");

    // Tablet/mobile card exposes and executes the same keyboard-accessible contract.
    await page.setViewportSize({ width: 390, height: 1024 });
    await page.waitForLoadState("networkidle");
    await reloadWithE2EAuth(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const bravoMobile = page.locator(
      `[data-estimate-section-mobile-id="100000"] [data-estimate-line-item-id="${bravo}"]`
    );
    await bravoMobile.locator(".eb-line-item-mobile-summary").click();
    await bravoMobile.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Move line item up" })).toBeDisabled();
    await page.getByRole("menuitem", { name: "Move to section" }).hover();
    await performAndWaitForEstimateRefresh(page, estimateId, () =>
      page.getByRole("menuitem", { name: "Section Two", exact: true }).press("Enter")
    );
    await expectPersistedOrder([charlie, delta, alpha, bravo]);
    expect(runtimeErrors).toEqual([]);

    await page.waitForLoadState("networkidle");
    await reloadWithE2EAuth(page);
    await expect(page.locator("body")).toContainText("$447.12");
    const finalRows = await persistedItems();
    expect(
      finalRows.reduce((sum, item) => sum + Number(item.qty) * Number(item.unit_cost), 0)
    ).toBe(originalTotal);
    for (const item of finalRows) {
      const source = original.find((candidate) => candidate.id === item.id);
      expect({
        desc: item.desc,
        qty: item.qty,
        unit: item.unit,
        unit_cost: item.unit_cost,
        markup_pct: item.markup_pct,
        status: item.status,
        hide_amount_on_pdf: item.hide_amount_on_pdf,
      }).toEqual({
        desc: source?.desc,
        qty: source?.qty,
        unit: source?.unit,
        unit_cost: source?.unit_cost,
        markup_pct: source?.markup_pct,
        status: source?.status,
        hide_amount_on_pdf: source?.hide_amount_on_pdf,
      });
    }
    await page.waitForLoadState("networkidle");
    expect(runtimeErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    if (estimateId) {
      await db.from("estimate_items").delete().eq("estimate_id", estimateId);
      await db.from("estimate_categories").delete().eq("estimate_id", estimateId);
      await db.from("estimate_meta").delete().eq("estimate_id", estimateId);
      await deleteLocalEstimateFixtureGraphs([estimateId]);
    }
  }
});
