import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_LABEL = "owner@example.com";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase service role is required for this test.");
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

test("Estimate Activity is revision-aware, linked, read-only, and responsive", async ({ page }) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
  const estimateNumber = `EST-P3C-PW-${suffix}`;
  const invoiceNumber = `INV-P3C-PW-${suffix}`;
  const projectName = `P3C Activity Project ${suffix}`;
  let sourceId = "";
  let revisionId = "";
  let scheduleId = "";
  let invoiceId = "";
  let projectId = "";

  try {
    const source = await db
      .from("estimates")
      .insert({
        number: estimateNumber,
        client: "Activity Customer",
        project: projectName,
        status: "Draft",
      })
      .select("id")
      .single();
    if (source.error || !source.data?.id) {
      throw new Error(source.error?.message ?? "Could not seed Estimate.");
    }
    sourceId = String(source.data.id);

    const meta = await db.from("estimate_meta").insert({
      estimate_id: sourceId,
      client_name: "Activity Customer",
      project_name: projectName,
      estimate_date: "2026-08-22",
      tax: 50,
      discount: 50,
    });
    if (meta.error) throw new Error(meta.error.message);
    const item = await db.from("estimate_items").insert({
      estimate_id: sourceId,
      cost_code: "010000",
      desc: "Activity fixture",
      qty: 2,
      unit: "EA",
      unit_cost: 500,
      markup_pct: 0,
      sort_order: 0,
    });
    if (item.error) throw new Error(item.error.message);
    const schedule = await db
      .from("estimate_payment_schedule_items")
      .insert({
        estimate_id: sourceId,
        title: "Deposit",
        description: "Tax-inclusive fixed amount",
        amount: 500,
        status: "draft",
        invoice_id: null,
        sort_order: 0,
      })
      .select("id")
      .single();
    if (schedule.error || !schedule.data?.id) {
      throw new Error(schedule.error?.message ?? "Could not seed schedule.");
    }
    scheduleId = String(schedule.data.id);

    const created = await db.rpc("record_estimate_created_activity", {
      p_estimate_id: sourceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
      p_creation_method: "new",
      p_source_estimate_id: null,
    });
    if (created.error) throw new Error(created.error.message);
    for (const nextStatus of ["Sent", "Approved"]) {
      const transition = await db.rpc("transition_estimate_status_with_activity", {
        p_estimate_id: sourceId,
        p_next_status: nextStatus,
        p_actor_user_id: ACTOR_ID,
        p_actor_label: ACTOR_LABEL,
        p_related_record_id: null,
        p_related_record_type: null,
      });
      if (transition.error) throw new Error(transition.error.message);
    }

    const revision = await db.rpc("create_estimate_revision", {
      p_source_estimate_id: sourceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
    });
    if (revision.error) throw new Error(revision.error.message);
    const revisionRow = Array.isArray(revision.data) ? revision.data[0] : revision.data;
    revisionId = String(revisionRow?.estimate_id ?? "");
    if (!revisionId) throw new Error("Revision RPC did not return a record.");

    const invoice = await db
      .from("invoices")
      .insert({
        invoice_no: invoiceNumber,
        client_name: "Activity Customer",
        issue_date: "2026-08-22",
        due_date: "2026-08-22",
        status: "Draft",
        tax_pct: 5,
        subtotal: 476.19,
        tax_amount: 23.81,
        total: 500,
        paid_total: 0,
        balance_due: 500,
      })
      .select("id")
      .single();
    if (invoice.error || !invoice.data?.id) {
      throw new Error(invoice.error?.message ?? "Could not seed Invoice.");
    }
    invoiceId = String(invoice.data.id);
    const linkInvoice = await db.rpc("link_estimate_milestone_invoice_with_activity", {
      p_estimate_id: sourceId,
      p_schedule_item_id: scheduleId,
      p_invoice_id: invoiceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
    });
    if (linkInvoice.error) throw new Error(linkInvoice.error.message);

    const project = await db
      .from("projects")
      .insert({
        name: projectName,
        status: "active",
        budget: 1000,
        spent: 0,
        source_estimate_id: sourceId,
        snapshot_revenue: 1000,
        snapshot_budget_cost: 1000,
        snapshot_breakdown: { materials: 1000, labor: 0, vendor: 0, other: 0 },
      })
      .select("id")
      .single();
    if (project.error || !project.data?.id) {
      throw new Error(project.error?.message ?? "Could not seed Project.");
    }
    projectId = String(project.data.id);
    const convert = await db.rpc("transition_estimate_status_with_activity", {
      p_estimate_id: sourceId,
      p_next_status: "Converted",
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
      p_related_record_id: projectId,
      p_related_record_type: "project",
    });
    if (convert.error) throw new Error(convert.error.message);

    await loginAsE2EOwner(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/estimates/${sourceId}`, { waitUntil: "domcontentloaded" });

    const timeline = page.getByTestId("estimate-activity-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText("Activity");
    await expect(timeline).toContainText("Rev 0");
    await expect(timeline).toContainText("Estimate Created");
    await expect(timeline).toContainText("Marked as Sent");
    await expect(timeline).toContainText("Approved");
    await expect(timeline).toContainText("Revision Created");
    await expect(timeline).toContainText("Draft Invoice Created");
    await expect(timeline).toContainText("Converted to Project");
    await expect(timeline).toContainText(ACTOR_LABEL);
    await expect(timeline.getByRole("link", { name: "Open Rev 1" })).toHaveAttribute(
      "href",
      `/estimates/${revisionId}`
    );
    await expect(timeline.getByRole("link", { name: `Open ${invoiceNumber}` })).toHaveAttribute(
      "href",
      `/financial/invoices/${invoiceId}`
    );
    await expect(timeline.getByRole("link", { name: "Open Project" })).toHaveAttribute(
      "href",
      `/projects/${projectId}`
    );
    await expect(timeline.locator("button, input, textarea, select")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText("Draft Invoice Created");
    await expect(timeline).toContainText("Converted to Project");
  } finally {
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    if (revisionId) {
      await db.from("estimate_payment_schedule_items").delete().eq("estimate_id", revisionId);
    }
    if (sourceId) {
      await db.from("estimate_payment_schedule_items").delete().eq("estimate_id", sourceId);
    }
    if (invoiceId) await db.from("invoices").delete().eq("id", invoiceId);
    if (revisionId) {
      await db.from("estimate_items").delete().eq("estimate_id", revisionId);
      await db.from("estimate_categories").delete().eq("estimate_id", revisionId);
      await db.from("estimate_meta").delete().eq("estimate_id", revisionId);
      await db.from("estimates").delete().eq("id", revisionId);
    }
    if (sourceId) {
      await db.from("estimate_items").delete().eq("estimate_id", sourceId);
      await db.from("estimate_categories").delete().eq("estimate_id", sourceId);
      await db.from("estimate_meta").delete().eq("estimate_id", sourceId);
      await db.from("estimates").delete().eq("id", sourceId);
    }
  }
});
