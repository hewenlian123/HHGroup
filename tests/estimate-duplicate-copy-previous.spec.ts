import { expect, test } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
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

test("Duplicate as Draft and Copy Previous share the reset-safe Estimate copy contract", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
  const sourceNumber = `EST-P2B-${suffix}`;
  const customerName = `PW P2B Customer ${suffix}`;
  const projectName = `PW P2B Project ${suffix}`;
  const createdEstimateIds: string[] = [];
  let customerId = "";
  let projectId = "";
  let invoiceId = "";
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  async function assertResetSafeCopy(copyId: string): Promise<void> {
    await expect
      .poll(async () => {
        const { data } = await db
          .from("estimates")
          .select("id, number, status, approved_at, customer_id, client, project")
          .eq("id", copyId)
          .maybeSingle();
        return data;
      })
      .toMatchObject({
        id: copyId,
        status: "Draft",
        approved_at: null,
        customer_id: customerId,
        client: customerName,
        project: projectName,
      });

    const [meta, items, schedule, projectLinks, snapshots] = await Promise.all([
      db
        .from("estimate_meta")
        .select("estimate_date, valid_until")
        .eq("estimate_id", copyId)
        .single(),
      db
        .from("estimate_items")
        .select("desc, qty, unit, unit_cost, status, hide_amount_on_pdf, sort_order")
        .eq("estimate_id", copyId)
        .order("sort_order"),
      db
        .from("estimate_payment_schedule_items")
        .select("title, description, amount, due_date, status, invoice_id, sort_order")
        .eq("estimate_id", copyId)
        .order("sort_order"),
      db.from("projects").select("id").eq("source_estimate_id", copyId),
      db.from("estimate_snapshots").select("id").eq("estimate_id", copyId),
    ]);
    expect(meta.error).toBeNull();
    expect(meta.data).toEqual({
      estimate_date: new Date().toISOString().slice(0, 10),
      valid_until: null,
    });
    expect(items.error).toBeNull();
    expect(items.data).toEqual([
      {
        desc: "Hidden owner-supplied fixture",
        qty: 2,
        unit: "EA",
        unit_cost: 450,
        status: "owner_supplied",
        hide_amount_on_pdf: true,
        sort_order: 0,
      },
    ]);
    expect(schedule.error).toBeNull();
    expect(schedule.data).toEqual([
      {
        title: "Paid source milestone",
        description: "Tax-inclusive fixed amount",
        amount: 850,
        due_date: null,
        status: "draft",
        invoice_id: null,
        sort_order: 0,
      },
    ]);
    expect(projectLinks.data).toHaveLength(0);
    expect(snapshots.data).toHaveLength(0);
  }

  try {
    const customerInsert = await db
      .from("customers")
      .insert({
        name: customerName,
        email: `p2b-${suffix}@example.test`,
        phone: "808-555-0202",
        address: "912 Ikena Cir",
      })
      .select("id")
      .single();
    if (customerInsert.error || !customerInsert.data?.id) {
      throw new Error(customerInsert.error?.message ?? "Could not seed customer.");
    }
    customerId = String(customerInsert.data.id);

    const estimateInsert = await db
      .from("estimates")
      .insert({
        number: sourceNumber,
        client: customerName,
        project: projectName,
        status: "Converted",
        approved_at: "2025-01-03",
        customer_id: customerId,
      })
      .select("id")
      .single();
    if (estimateInsert.error || !estimateInsert.data?.id) {
      throw new Error(estimateInsert.error?.message ?? "Could not seed source Estimate.");
    }
    const sourceId = String(estimateInsert.data.id);
    createdEstimateIds.push(sourceId);

    const metaInsert = await db.from("estimate_meta").insert({
      estimate_id: sourceId,
      client_name: customerName,
      client_email: `p2b-${suffix}@example.test`,
      client_phone: "808-555-0202",
      client_address: "912 Ikena Cir",
      project_name: projectName,
      project_site_address: "100 Project Way",
      cost_category_names: { __documentStyle: "itemized" },
      tax: 50,
      discount: 100,
      estimate_date: "2025-01-02",
      valid_until: "2025-03-02",
      notes: "Browser fidelity note",
      document_notes: [{ id: "terms-1", type: "payment_terms", title: "Terms", body: "Net 15" }],
    });
    if (metaInsert.error) throw new Error(metaInsert.error.message);

    const categoryInsert = await db.from("estimate_categories").insert({
      estimate_id: sourceId,
      cost_code: "260000",
      display_name: "Electrical",
      order_index: 0,
    });
    if (categoryInsert.error) throw new Error(categoryInsert.error.message);

    const itemInsert = await db.from("estimate_items").insert({
      estimate_id: sourceId,
      cost_code: "260000",
      desc: "Hidden owner-supplied fixture",
      qty: 2,
      unit: "EA",
      unit_cost: 450,
      markup_pct: 0,
      status: "owner_supplied",
      hide_amount_on_pdf: true,
      sort_order: 0,
    });
    if (itemInsert.error) throw new Error(itemInsert.error.message);

    const projectInsert = await db
      .from("projects")
      .insert({
        name: `${projectName} Converted`,
        status: "Active",
        budget: 850,
        customer_id: customerId,
        source_estimate_id: sourceId,
      })
      .select("id")
      .single();
    if (projectInsert.error || !projectInsert.data?.id) {
      throw new Error(projectInsert.error?.message ?? "Could not seed converted project.");
    }
    projectId = String(projectInsert.data.id);

    const invoiceInsert = await db
      .from("invoices")
      .insert({
        invoice_no: `INV-P2B-${suffix}`,
        project_id: projectId,
        customer_id: customerId,
        client_name: customerName,
        status: "Paid",
        subtotal: 850,
        tax_amount: 0,
        total: 850,
        paid_total: 850,
        balance_due: 0,
      })
      .select("id")
      .single();
    if (invoiceInsert.error || !invoiceInsert.data?.id) {
      throw new Error(invoiceInsert.error?.message ?? "Could not seed linked Invoice.");
    }
    invoiceId = String(invoiceInsert.data.id);

    const scheduleInsert = await db.from("estimate_payment_schedule_items").insert({
      estimate_id: sourceId,
      title: "Paid source milestone",
      description: "Tax-inclusive fixed amount",
      amount: 850,
      due_date: "2025-01-10",
      status: "paid",
      invoice_id: invoiceId,
      sort_order: 0,
    });
    if (scheduleInsert.error) throw new Error(scheduleInsert.error.message);

    const snapshotInsert = await db.from("estimate_snapshots").insert({
      estimate_id: sourceId,
      version: 1,
      status_at_snapshot: "Converted",
      frozen_payload: { browserHistory: true },
    });
    if (snapshotInsert.error) throw new Error(snapshotInsert.error.message);

    await loginAsE2EOwner(page, `/estimates/${sourceId}`);
    await page.getByLabel("Estimate actions", { exact: true }).click();
    await page.getByTestId("duplicate-estimate-action").click();
    await expect(page).not.toHaveURL(new RegExp(`/estimates/${sourceId}$`), { timeout: 30_000 });
    await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]+$/, { timeout: 30_000 });
    const duplicateId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(duplicateId).not.toBe(sourceId);
    createdEstimateIds.push(duplicateId);
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft");
    await expect(page.locator("body")).toContainText("Hidden owner-supplied fixture");
    await assertResetSafeCopy(duplicateId);

    await gotoWithE2EAuth(page, "/estimates");
    const sourceRow = page.getByRole("row").filter({ hasText: sourceNumber });
    await expect(sourceRow).toBeVisible({ timeout: 30_000 });
    await sourceRow.getByLabel(`Actions for estimate ${sourceNumber}`).click();
    await page.getByRole("menuitem", { name: "Copy Previous as Draft" }).click();
    await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]+$/, { timeout: 30_000 });
    const copyPreviousId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(copyPreviousId).not.toBe(sourceId);
    expect(copyPreviousId).not.toBe(duplicateId);
    createdEstimateIds.push(copyPreviousId);
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft", {
      timeout: 30_000,
    });
    await expect(page.locator("body")).toContainText("Hidden owner-supplied fixture");
    await assertResetSafeCopy(copyPreviousId);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithE2EAuth(page, `/estimates/${sourceId}`);
    await page.getByLabel("More estimate actions", { exact: true }).click();
    await expect(page.getByTestId("duplicate-estimate-action-mobile")).toBeVisible();

    expect(runtimeErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    if (createdEstimateIds.length > 0) {
      await db
        .from("estimate_payment_schedule_items")
        .delete()
        .in("estimate_id", createdEstimateIds);
    }
    if (invoiceId) await db.from("invoices").delete().eq("id", invoiceId);
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    if (createdEstimateIds.length > 0) {
      await deleteLocalEstimateFixtureGraphs(createdEstimateIds);
    }
    if (customerId) await db.from("customers").delete().eq("id", customerId);
  }
});
