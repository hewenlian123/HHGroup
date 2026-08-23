import assert from "node:assert/strict";
import postgres from "postgres";

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsed = new URL(databaseUrl);
if (!new Set(["127.0.0.1", "localhost", "[::1]", "::1"]).has(parsed.hostname)) {
  throw new Error("Phase 2C verification is local-Supabase only.");
}
if (parsed.port !== "54322") {
  throw new Error("Phase 2C verification requires local Supabase port 54322.");
}

const sql = postgres(databaseUrl, { max: 1 });
let estimateId = "";

async function rows() {
  return sql`
    select id, cost_code, "desc", qty, unit, unit_cost, markup_pct,
      status, hide_amount_on_pdf, sort_order
    from public.estimate_items
    where estimate_id = ${estimateId}
    order by sort_order, id
  `;
}

async function total() {
  const [result] = await sql`
    select sum(qty * unit_cost)::numeric as total
    from public.estimate_items
    where estimate_id = ${estimateId}
  `;
  return Number(result.total);
}

async function reorder(expectedItems, orderedItems) {
  const [result] = await sql`
    select public.reorder_estimate_items(
      ${estimateId}::uuid,
      ${sql.json(expectedItems)}::jsonb,
      ${sql.json(orderedItems)}::jsonb
    ) as reordered_count
  `;
  assert.equal(result.reordered_count, orderedItems.length);
}

try {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [estimate] = await sql`
    insert into public.estimates (number, client, project, status)
    values (${`VERIFY-P2C-${suffix}`}, 'Phase 2C Customer', 'Phase 2C Project', 'Draft')
    returning id
  `;
  estimateId = estimate.id;

  await sql`
    insert into public.estimate_categories (estimate_id, cost_code, display_name, order_index)
    values
      (${estimateId}, '100000', 'Section One', 0),
      (${estimateId}, '200000', 'Section Two', 1)
  `;
  const inserted = await sql`
    insert into public.estimate_items (
      estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct,
      sort_order, status, hide_amount_on_pdf
    ) values
      (${estimateId}, '100000', 'Alpha detail', 2, 'EA', 10.25, 0, 9, 'included', false),
      (${estimateId}, '100000', 'Bravo optional', 3, 'LF', 20.50, 0, 9, 'optional', true),
      (${estimateId}, '200000', 'Charlie allowance', 4, 'SF', 30.75, 0, 25, 'allowance', false),
      (${estimateId}, '200000', 'Delta owner supplied', 5, 'LS', 40.00, 0, 30, 'owner_supplied', true)
    returning id, "desc"
  `;
  const idByDesc = Object.fromEntries(inserted.map((item) => [item.desc, item.id]));
  const alpha = idByDesc["Alpha detail"];
  const bravo = idByDesc["Bravo optional"];
  const charlie = idByDesc["Charlie allowance"];
  const delta = idByDesc["Delta owner supplied"];

  const original = await rows();
  const originalById = new Map(
    original.map(({ sort_order: _order, cost_code: _code, ...row }) => [row.id, row])
  );
  const originalTotal = await total();
  const expected = original.map((item) => ({ id: item.id, costCode: item.cost_code }));

  // Same-Section move up (Bravo before Alpha), including normalization of gaps/duplicates.
  await reorder(expected, [
    { id: bravo, costCode: "100000" },
    { id: alpha, costCode: "100000" },
    { id: charlie, costCode: "200000" },
    { id: delta, costCode: "200000" },
  ]);
  let current = await rows();
  assert.deepEqual(
    current.map((item) => item.id),
    [bravo, alpha, charlie, delta]
  );
  assert.deepEqual(
    current.map((item) => item.sort_order),
    [0, 1, 2, 3]
  );

  // Same-Section move down restores Alpha before Bravo.
  await reorder(
    current.map((item) => ({ id: item.id, costCode: item.cost_code })),
    [
      { id: alpha, costCode: "100000" },
      { id: bravo, costCode: "100000" },
      { id: charlie, costCode: "200000" },
      { id: delta, costCode: "200000" },
    ]
  );

  // Cross-Section move inserts Alpha between Charlie and Delta.
  current = await rows();
  await reorder(
    current.map((item) => ({ id: item.id, costCode: item.cost_code })),
    [
      { id: bravo, costCode: "100000" },
      { id: charlie, costCode: "200000" },
      { id: alpha, costCode: "200000" },
      { id: delta, costCode: "200000" },
    ]
  );
  current = await rows();
  assert.deepEqual(
    current.map((item) => ({ id: item.id, costCode: item.cost_code, sortOrder: item.sort_order })),
    [
      { id: bravo, costCode: "100000", sortOrder: 0 },
      { id: charlie, costCode: "200000", sortOrder: 1 },
      { id: alpha, costCode: "200000", sortOrder: 2 },
      { id: delta, costCode: "200000", sortOrder: 3 },
    ]
  );

  for (const item of current) {
    const { sort_order: _order, cost_code: _code, ...fidelity } = item;
    assert.deepEqual(fidelity, originalById.get(item.id), `fidelity:${item.id}`);
  }
  assert.equal(await total(), originalTotal, "Estimate line total must not change");

  const stableRows = await rows();
  await assert.rejects(
    () =>
      reorder(expected, [
        { id: delta, costCode: "200000" },
        { id: alpha, costCode: "200000" },
        { id: charlie, costCode: "200000" },
        { id: bravo, costCode: "100000" },
      ]),
    /items changed|reload/i
  );
  assert.deepEqual(await rows(), stableRows, "stale rejection must leave every row unchanged");

  await assert.rejects(
    () =>
      reorder(
        stableRows.map((item) => ({
          id: item.id,
          costCode: item.id === alpha ? "100000" : item.cost_code,
        })),
        stableRows.map((item) => ({ id: item.id, costCode: item.cost_code }))
      ),
    /items changed|reload/i
  );
  assert.deepEqual(
    await rows(),
    stableRows,
    "stale Section assignment must leave every row unchanged"
  );

  await assert.rejects(
    () =>
      reorder(
        stableRows.map((item) => ({ id: item.id, costCode: item.cost_code })),
        [
          { id: bravo, costCode: "100000" },
          { id: charlie, costCode: "200000" },
          { id: alpha, costCode: "200000" },
        ]
      ),
    /every Estimate item exactly once/i
  );
  assert.deepEqual(await rows(), stableRows, "partial input must leave every row unchanged");

  console.log(
    "PASS: Phase 2C same-Section up/down, cross-Section move, normalized sort_order, " +
      "item fidelity, unchanged totals, and atomic stale/partial-write rejection verified."
  );
} finally {
  if (estimateId) {
    await sql`delete from public.estimate_items where estimate_id = ${estimateId}`;
    await sql`delete from public.estimate_categories where estimate_id = ${estimateId}`;
    await sql`delete from public.estimates where id = ${estimateId}`;
  }
  await sql.end();
}
