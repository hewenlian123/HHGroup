import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
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

test("Create Revision preserves immutable lineage on desktop and mobile", async ({ page }) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
  const estimateNumber = `EST-P3A-${suffix}`;
  const customerName = `PW P3A Customer ${suffix}`;
  const projectName = `PW P3A Project ${suffix}`;
  const estimateIds: string[] = [];
  let customerId = "";
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
    const customer = await db
      .from("customers")
      .insert({
        name: customerName,
        email: `p3a-${suffix}@example.test`,
        phone: "808-555-0303",
        address: "100 Revision Way",
      })
      .select("id")
      .single();
    if (customer.error || !customer.data?.id) {
      throw new Error(customer.error?.message ?? "Could not seed customer.");
    }
    customerId = String(customer.data.id);

    const source = await db
      .from("estimates")
      .insert({
        number: estimateNumber,
        client: customerName,
        project: projectName,
        status: "Approved",
        approved_at: "2025-01-03",
        customer_id: customerId,
      })
      .select("id")
      .single();
    if (source.error || !source.data?.id) {
      throw new Error(source.error?.message ?? "Could not seed source Estimate.");
    }
    const sourceId = String(source.data.id);
    estimateIds.push(sourceId);

    const meta = await db.from("estimate_meta").insert({
      estimate_id: sourceId,
      client_name: customerName,
      client_email: `p3a-${suffix}@example.test`,
      client_phone: "808-555-0303",
      client_address: "100 Revision Way",
      project_name: projectName,
      project_site_address: "100 Revision Way",
      cost_category_names: { __documentStyle: "itemized" },
      tax: 50,
      discount: 100,
      estimate_date: "2025-01-02",
      valid_until: "2025-03-02",
      notes: "Browser revision fidelity note",
      document_notes: [{ id: "terms-1", type: "payment_terms", title: "Terms", body: "Net 15" }],
    });
    if (meta.error) throw new Error(meta.error.message);
    const category = await db.from("estimate_categories").insert({
      estimate_id: sourceId,
      cost_code: "260000",
      display_name: "Electrical",
      order_index: 0,
    });
    if (category.error) throw new Error(category.error.message);
    const item = await db.from("estimate_items").insert({
      estimate_id: sourceId,
      cost_code: "260000",
      desc: "Revision fidelity fixture",
      qty: 2,
      unit: "EA",
      unit_cost: 500,
      markup_pct: 0,
      status: "owner_supplied",
      hide_amount_on_pdf: true,
      sort_order: 0,
    });
    if (item.error) throw new Error(item.error.message);
    const schedule = await db.from("estimate_payment_schedule_items").insert({
      estimate_id: sourceId,
      title: "Deposit",
      description: "Tax-inclusive fixed amount",
      amount: 500,
      due_date: "2025-01-10",
      status: "draft",
      invoice_id: null,
      sort_order: 0,
    });
    if (schedule.error) throw new Error(schedule.error.message);

    await page.setViewportSize({ width: 1440, height: 960 });
    await loginAsE2EOwner(page, `/estimates/${sourceId}`);
    await expect(page.getByTestId("estimate-detail-header")).toContainText(
      `${estimateNumber} Rev 0`
    );
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Approved");
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await page.getByTestId("create-estimate-revision-action").click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .not.toBe(`/estimates/${sourceId}`);
    await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]+$/, { timeout: 30_000 });
    const revisionOneId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(revisionOneId).not.toBe(sourceId);
    estimateIds.push(revisionOneId);

    await expect(page.getByTestId("estimate-detail-header")).toContainText(
      `${estimateNumber} Rev 1`
    );
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft");
    await expect(page.locator("body")).toContainText("Revision fidelity fixture");
    await expect(page.getByRole("link", { name: "Previous revision" })).toBeVisible();

    const revisionOne = await db
      .from("estimates")
      .select(
        "id, number, status, approved_at, customer_id, revision_root_id, revision_number, previous_revision_id"
      )
      .eq("id", revisionOneId)
      .single();
    expect(revisionOne.error).toBeNull();
    expect(revisionOne.data).toEqual({
      id: revisionOneId,
      number: estimateNumber,
      status: "Draft",
      approved_at: null,
      customer_id: customerId,
      revision_root_id: sourceId,
      revision_number: 1,
      previous_revision_id: sourceId,
    });
    const revisionSchedule = await db
      .from("estimate_payment_schedule_items")
      .select("title, description, amount, due_date, status, invoice_id, sort_order")
      .eq("estimate_id", revisionOneId)
      .single();
    expect(revisionSchedule.error).toBeNull();
    expect(revisionSchedule.data).toEqual({
      title: "Deposit",
      description: "Tax-inclusive fixed amount",
      amount: 500,
      due_date: null,
      status: "draft",
      invoice_id: null,
      sort_order: 0,
    });

    await page.getByRole("link", { name: "Previous revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${sourceId}$`));
    await expect(page.getByRole("link", { name: "Current revision" })).toBeVisible();
    await page.getByRole("link", { name: "Preview", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${sourceId}/preview`));
    await expect(page.locator("body")).toContainText(`${estimateNumber} Rev 0`);

    const protectRevision = await db
      .from("estimates")
      .update({ status: "Rejected" })
      .eq("id", revisionOneId);
    if (protectRevision.error) throw new Error(protectRevision.error.message);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/estimates/${revisionOneId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("estimate-detail-header")).toContainText(
      `${estimateNumber} Rev 1`
    );
    await page.getByLabel("More estimate actions", { exact: true }).click();
    await page.getByTestId("create-estimate-revision-action-mobile").click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .not.toBe(`/estimates/${revisionOneId}`);
    await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]+$/, { timeout: 30_000 });
    const revisionTwoId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(revisionTwoId).not.toBe(revisionOneId);
    estimateIds.push(revisionTwoId);
    await expect(page.getByTestId("estimate-detail-header")).toContainText(
      `${estimateNumber} Rev 2`
    );
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft");

    const family = await db
      .from("estimates")
      .select("id, revision_number, previous_revision_id")
      .eq("revision_root_id", sourceId)
      .order("revision_number");
    expect(family.error).toBeNull();
    expect(family.data).toEqual([
      { id: sourceId, revision_number: 0, previous_revision_id: null },
      { id: revisionOneId, revision_number: 1, previous_revision_id: sourceId },
      { id: revisionTwoId, revision_number: 2, previous_revision_id: revisionOneId },
    ]);

    expect(runtimeErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    if (estimateIds.length > 0) {
      await db.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIds);
      await db.from("estimate_items").delete().in("estimate_id", estimateIds);
      await db.from("estimate_categories").delete().in("estimate_id", estimateIds);
      await db.from("estimate_meta").delete().in("estimate_id", estimateIds);
      const remaining = await db
        .from("estimates")
        .select("id, revision_number")
        .in("id", estimateIds)
        .order("revision_number", { ascending: false });
      for (const row of remaining.data ?? []) {
        await db.from("estimates").delete().eq("id", row.id);
      }
    }
    if (customerId) await db.from("customers").delete().eq("id", customerId);
  }
});
