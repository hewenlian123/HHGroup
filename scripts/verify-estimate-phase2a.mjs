import assert from "node:assert/strict";
import postgres from "postgres";

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsed = new URL(databaseUrl);
if (!new Set(["127.0.0.1", "localhost", "[::1]", "::1"]).has(parsed.hostname)) {
  throw new Error("Phase 2A verification is local-Supabase only.");
}
if (parsed.port !== "54322") {
  throw new Error("Phase 2A verification requires the local Supabase database port 54322.");
}

const sql = postgres(databaseUrl, { max: 1 });
const estimateIds = [];
const templateIds = [];

async function seedEstimate({ subtotal, tax = 0, discount = 0, label }) {
  const [estimate] = await sql`
    insert into public.estimates (number, client, project, status)
    values (
      ${`VERIFY-P2A-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`},
      'Phase 2A verifier',
      'Local verifier',
      'Draft'
    )
    returning id
  `;
  estimateIds.push(estimate.id);
  await sql`
    insert into public.estimate_meta (
      estimate_id,
      client_name,
      project_name,
      tax,
      discount
    ) values (${estimate.id}, 'Phase 2A verifier', 'Local verifier', ${tax}, ${discount})
  `;
  await sql`
    insert into public.estimate_items (
      estimate_id,
      cost_code,
      "desc",
      qty,
      unit,
      unit_cost,
      markup_pct,
      sort_order
    ) values (${estimate.id}, '010000', 'Phase 2A scope', 1, 'LS', ${subtotal}, 0, 0)
  `;
  return estimate.id;
}

async function seedTemplate(label, items) {
  const [template] = await sql`
    insert into public.payment_schedule_templates (name)
    values (${`VERIFY-P2A-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`})
    returning id
  `;
  templateIds.push(template.id);
  await sql`
    insert into public.payment_schedule_template_items (
      template_id,
      sort_order,
      title,
      amount_type,
      value,
      due_rule
    )
    select
      ${template.id}::uuid,
      item.sort_order,
      item.title,
      item.amount_type,
      item.value,
      item.due_rule
    from jsonb_to_recordset(${sql.json(
      items.map((item, index) => ({
        sort_order: index,
        title: item.title,
        amount_type: item.amountType,
        value: item.value,
        due_rule: item.dueRule ?? "",
      }))
    )}::jsonb) as item(
      sort_order integer,
      title text,
      amount_type text,
      value numeric,
      due_rule text
    )
  `;
  return template.id;
}

async function schedule(estimateId) {
  const rows = await sql`
    select title, amount::text as amount, sort_order, status
    from public.estimate_payment_schedule_items
    where estimate_id = ${estimateId}
    order by sort_order, id
  `;
  return rows.map((row) => ({
    title: row.title,
    amount: Number(row.amount),
    sortOrder: row.sort_order,
    status: row.status,
  }));
}

async function applyTemplate(estimateId, templateId, mode) {
  const [result] = await sql`
    select *
    from public.apply_payment_schedule_template(${estimateId}, ${templateId}, ${mode})
  `;
  return {
    appliedCount: result.applied_count,
    scheduledTotal: Number(result.scheduled_total),
    remainingTotal: Number(result.remaining_total),
  };
}

try {
  const taxDiscountEstimate = await seedEstimate({
    subtotal: 1000,
    tax: 47.12,
    discount: 100,
    label: "tax-discount",
  });
  const partial = await seedTemplate("partial", [
    { title: "Partial 1", amountType: "percent", value: 25 },
    { title: "Partial 2", amountType: "percent", value: 25 },
  ]);
  const full = await seedTemplate("full", [
    { title: "Full 1", amountType: "percent", value: 50 },
    { title: "Full 2", amountType: "percent", value: 50 },
  ]);

  await sql`
    insert into public.estimate_payment_schedule_items (
      estimate_id,
      title,
      amount,
      sort_order,
      status
    ) values (${taxDiscountEstimate}, 'Existing unrelated', 100, 0, 'draft')
  `;

  assert.deepEqual(await applyTemplate(taxDiscountEstimate, partial, "merge"), {
    appliedCount: 2,
    scheduledTotal: 573.56,
    remainingTotal: 373.56,
  });
  const merged = await schedule(taxDiscountEstimate);
  assert.deepEqual(
    merged.map(({ title, amount, sortOrder }) => ({ title, amount, sortOrder })),
    [
      { title: "Existing unrelated", amount: 100, sortOrder: 0 },
      { title: "Partial 1", amount: 236.78, sortOrder: 1 },
      { title: "Partial 2", amount: 236.78, sortOrder: 2 },
    ]
  );

  let overScheduleRejected = false;
  try {
    await applyTemplate(taxDiscountEstimate, full, "merge");
  } catch (error) {
    overScheduleRejected = error?.code === "23514";
  }
  assert.equal(overScheduleRejected, true, "Merge must reject over-scheduling.");
  assert.deepEqual(await schedule(taxDiscountEstimate), merged, "Rejected Merge must be atomic.");

  assert.deepEqual(await applyTemplate(taxDiscountEstimate, full, "replace"), {
    appliedCount: 2,
    scheduledTotal: 947.12,
    remainingTotal: 0,
  });
  assert.deepEqual(
    (await schedule(taxDiscountEstimate)).map(({ amount, sortOrder }) => ({ amount, sortOrder })),
    [
      { amount: 473.56, sortOrder: 0 },
      { amount: 473.56, sortOrder: 1 },
    ]
  );

  await sql`
    update public.estimate_payment_schedule_items
    set status = 'paid'
    where estimate_id = ${taxDiscountEstimate}
      and sort_order = 0
  `;
  const protectedSchedule = await schedule(taxDiscountEstimate);
  let linkedReplaceRejected = false;
  try {
    await applyTemplate(taxDiscountEstimate, partial, "replace");
  } catch (error) {
    linkedReplaceRejected = error?.code === "23514";
  }
  assert.equal(linkedReplaceRejected, true, "Replace must protect non-draft milestones.");
  assert.deepEqual(
    await schedule(taxDiscountEstimate),
    protectedSchedule,
    "Protected Replace must roll back without deleting rows."
  );

  const noTaxEstimate = await seedEstimate({ subtotal: 1000, label: "no-tax" });
  const fixed = await seedTemplate("fixed", [
    { title: "Fixed partial", amountType: "fixed", value: 250 },
  ]);
  assert.deepEqual(await applyTemplate(noTaxEstimate, fixed, "replace"), {
    appliedCount: 1,
    scheduledTotal: 250,
    remainingTotal: 750,
  });

  const roundingEstimate = await seedEstimate({ subtotal: 100.01, label: "rounding" });
  const thirds = await seedTemplate("rounding", [
    { title: "Third 1", amountType: "percent", value: 33.333333 },
    { title: "Third 2", amountType: "percent", value: 33.333333 },
    { title: "Third 3", amountType: "percent", value: 33.333334 },
  ]);
  assert.deepEqual(await applyTemplate(roundingEstimate, thirds, "replace"), {
    appliedCount: 3,
    scheduledTotal: 100.01,
    remainingTotal: 0,
  });
  assert.deepEqual(
    (await schedule(roundingEstimate)).map(({ amount }) => amount),
    [33.34, 33.34, 33.33]
  );

  console.log(
    "PASS: no-tax, tax+discount, percentage-to-fixed, partial/full, rounding, Replace, Merge, order, over-schedule rejection, and atomic rollback."
  );
} finally {
  if (estimateIds.length > 0) {
    await sql`delete from public.estimates where id = any(${estimateIds}::uuid[])`;
  }
  if (templateIds.length > 0) {
    await sql`delete from public.payment_schedule_templates where id = any(${templateIds}::uuid[])`;
  }
  await sql.end();
}
