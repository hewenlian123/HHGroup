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

test("percentage payment templates Merge and Replace as authoritative fixed-dollar milestones", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
  const partialTemplateName = `PW P2A Partial ${suffix}`;
  const fullTemplateName = `PW P2A Full ${suffix}`;
  const savedTemplateName = `PW P2A Saved ${suffix}`;
  let estimateId = "";
  const templateIds: string[] = [];

  try {
    const estimateInsert = await db
      .from("estimates")
      .insert({
        number: `EST-P2A-${suffix}`,
        client: `P2A Owner ${suffix}`,
        project: `P2A Project ${suffix}`,
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
      client_name: `P2A Owner ${suffix}`,
      project_name: `P2A Project ${suffix}`,
      tax: 47.12,
      discount: 100,
    });
    if (metaInsert.error) throw new Error(metaInsert.error.message);
    const itemInsert = await db.from("estimate_items").insert({
      estimate_id: estimateId,
      cost_code: "010000",
      desc: "Tax-inclusive template scope",
      qty: 1,
      unit: "LS",
      unit_cost: 1000,
      markup_pct: 0,
      sort_order: 0,
    });
    if (itemInsert.error) throw new Error(itemInsert.error.message);
    const scheduleInsert = await db.from("estimate_payment_schedule_items").insert({
      estimate_id: estimateId,
      title: "Existing unrelated milestone",
      amount: 100,
      sort_order: 0,
      status: "draft",
    });
    if (scheduleInsert.error) throw new Error(scheduleInsert.error.message);

    for (const [name, values] of [
      [partialTemplateName, [25, 25]],
      [fullTemplateName, [50, 50]],
    ] as const) {
      const templateInsert = await db
        .from("payment_schedule_templates")
        .insert({ name })
        .select("id")
        .single();
      if (templateInsert.error || !templateInsert.data?.id) {
        throw new Error(templateInsert.error?.message ?? "Could not seed payment template.");
      }
      const templateId = String(templateInsert.data.id);
      templateIds.push(templateId);
      const itemInsert = await db.from("payment_schedule_template_items").insert(
        values.map((value, index) => ({
          template_id: templateId,
          sort_order: index,
          title: `${name} milestone ${index + 1}`,
          amount_type: "percent",
          value,
          due_rule: `Stage ${index + 1}`,
        }))
      );
      if (itemInsert.error) throw new Error(itemInsert.error.message);
    }

    await loginAsE2EOwner(page, `/estimates/${estimateId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByTestId("payment-template-controls")).toBeVisible({ timeout: 30_000 });
    const templateSelect = page.getByLabel("Payment template");

    await templateSelect.selectOption({ label: partialTemplateName });
    await page.getByTestId("payment-template-merge").click();
    await expect(page.getByText("Payment schedule merged")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const { data } = await db
          .from("estimate_payment_schedule_items")
          .select("title, amount, sort_order")
          .eq("estimate_id", estimateId)
          .order("sort_order");
        return (data ?? []).map((row) => [row.title, Number(row.amount)]);
      })
      .toEqual([
        ["Existing unrelated milestone", 100],
        [`${partialTemplateName} milestone 1`, 236.78],
        [`${partialTemplateName} milestone 2`, 236.78],
      ]);

    await templateSelect.selectOption({ label: fullTemplateName });
    await page.getByTestId("payment-template-merge").click();
    await expect(page.getByText(/cannot exceed Estimate final total/i)).toBeVisible({
      timeout: 30_000,
    });
    const afterRejectedMerge = await db
      .from("estimate_payment_schedule_items")
      .select("id")
      .eq("estimate_id", estimateId);
    expect(afterRejectedMerge.data).toHaveLength(3);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("payment-template-replace").click();
    await expect(page.getByText("Payment schedule replaced")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const { data } = await db
          .from("estimate_payment_schedule_items")
          .select("amount, sort_order")
          .eq("estimate_id", estimateId)
          .order("sort_order");
        return (data ?? []).map((row) => Number(row.amount));
      })
      .toEqual([473.56, 473.56]);

    await page.getByTestId("payment-template-save-open").click();
    await page.getByTestId("payment-template-name").fill(savedTemplateName);
    await page.getByLabel("Payment template amount type").selectOption("percent");
    await page.getByTestId("payment-template-save").click();
    await expect(page.getByText("Payment template saved")).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => {
        const { data: template } = await db
          .from("payment_schedule_templates")
          .select("id")
          .eq("name", savedTemplateName)
          .maybeSingle();
        if (!template?.id) return [];
        if (!templateIds.includes(String(template.id))) templateIds.push(String(template.id));
        const { data: items } = await db
          .from("payment_schedule_template_items")
          .select("amount_type, value")
          .eq("template_id", template.id)
          .order("sort_order");
        return (items ?? []).map((item) => [item.amount_type, Number(item.value)]);
      })
      .toEqual([
        ["percent", 50],
        ["percent", 50],
      ]);
  } finally {
    if (estimateId) await db.from("estimates").delete().eq("id", estimateId);
    if (templateIds.length > 0) {
      await db.from("payment_schedule_templates").delete().in("id", templateIds);
    }
    await db.from("payment_schedule_templates").delete().eq("name", savedTemplateName);
  }
});
