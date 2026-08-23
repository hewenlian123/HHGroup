import assert from "node:assert/strict";
import postgres from "postgres";

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsed = new URL(databaseUrl);
if (!new Set(["127.0.0.1", "localhost", "[::1]", "::1"]).has(parsed.hostname)) {
  throw new Error("Phase 3A verification is local-Supabase only.");
}
if (parsed.port !== "54322") {
  throw new Error("Phase 3A verification requires local Supabase port 54322.");
}

const sql = postgres(databaseUrl, { max: 4 });
const estimateIds = [];
const customerIds = [];
const projectIds = [];
const invoiceIds = [];

function uniqueLabel(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

async function seedSource(status, { comprehensive = false } = {}) {
  const label = uniqueLabel(`VERIFY-P3A-${status}`);
  const [customer] = await sql`
    insert into public.customers (name, email, phone, address)
    values (${`${label} Customer`}, ${`${label}@example.test`}, '808-555-0303', '100 Revision Way')
    returning id
  `;
  customerIds.push(customer.id);

  const [estimate] = await sql`
    insert into public.estimates (
      number, client, project, status, approved_at, customer_id, created_at, updated_at
    ) values (
      ${label}, ${`${label} Customer`}, ${`${label} Project`}, ${status},
      ${status === "Approved" || status === "Converted" ? "2025-01-03" : null},
      ${customer.id}, '2025-01-01T10:00:00Z', '2025-01-02'
    )
    returning *
  `;
  estimateIds.push(estimate.id);

  await sql`
    insert into public.estimate_meta (
      estimate_id, client_name, client_phone, client_email, client_address,
      project_name, project_site_address, cost_category_names, tax, discount,
      overhead_pct, profit_pct, estimate_date, valid_until, notes, sales_person,
      document_notes
    ) values (
      ${estimate.id}, ${`${label} Customer`}, '808-555-0303', ${`${label}@example.test`},
      '100 Revision Way', ${`${label} Project`}, '100 Revision Way',
      ${sql.json({ __documentStyle: "itemized" })}, 47.12, 100, 0, 0,
      '2025-01-02', '2025-03-02', 'Preserve revision notes.', 'HH Estimator',
      ${sql.json([{ id: "terms-1", type: "payment_terms", title: "Terms", body: "Net 15" }])}
    )
  `;
  await sql`
    insert into public.estimate_categories (estimate_id, cost_code, display_name, order_index)
    values
      (${estimate.id}, '010000', 'General Requirements', 0),
      (${estimate.id}, '020000', 'Selective Demolition', 1)
  `;
  await sql`
    insert into public.estimate_items (
      estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct,
      sort_order, status, hide_amount_on_pdf
    ) values
      (${estimate.id}, '010000', 'Included revision scope', 1, 'LS', 600, 0, 0, 'included', false),
      (${estimate.id}, '020000', 'Hidden owner supplied scope', 2, 'EA', 200, 0, 1, 'owner_supplied', true)
  `;

  let projectId = null;
  let invoiceId = null;
  if (comprehensive) {
    const [project] = await sql`
      insert into public.projects (name, status, budget, customer_id, source_estimate_id)
      values (${`${label} Converted Project`}, 'Active', 947.12, ${customer.id}, ${estimate.id})
      returning id
    `;
    projectId = project.id;
    projectIds.push(project.id);
    const [invoice] = await sql`
      insert into public.invoices (
        invoice_no, project_id, customer_id, client_name, status,
        subtotal, tax_amount, total, paid_total, balance_due
      ) values (
        ${uniqueLabel("INV-P3A")}, ${project.id}, ${customer.id}, ${`${label} Customer`},
        'Paid', 250, 0, 250, 250, 0
      ) returning id
    `;
    invoiceId = invoice.id;
    invoiceIds.push(invoice.id);
    await sql`
      insert into public.estimate_snapshots (
        estimate_id, version, status_at_snapshot, frozen_payload
      ) values (${estimate.id}, 1, 'Converted', ${sql.json({ historical: true })})
    `;
  }

  await sql`
    insert into public.estimate_payment_schedule_items (
      estimate_id, title, description, amount, due_date, status, invoice_id, sort_order
    ) values
      (${estimate.id}, 'Deposit', 'Tax-inclusive deposit', 250, '2025-01-10',
        ${invoiceId ? "paid" : "draft"}, ${invoiceId}, 0),
      (${estimate.id}, 'Completion', 'Tax-inclusive completion', 697.12, '2025-03-01',
        ${invoiceId ? "invoiced" : "draft"}, ${invoiceId}, 1)
  `;

  return { ...estimate, projectId, invoiceId };
}

async function createRevision(sourceId) {
  const [revision] = await sql`
    select * from public.create_estimate_revision(${sourceId}::uuid)
  `;
  estimateIds.push(revision.estimate_id);
  return revision;
}

async function estimateFinancialTotal(estimateId) {
  const [row] = await sql`
    select round(
      coalesce((select sum(qty * unit_cost) from public.estimate_items where estimate_id = ${estimateId}), 0)
      + coalesce((select tax - discount from public.estimate_meta where estimate_id = ${estimateId}), 0),
      2
    ) as total
  `;
  return Number(row.total);
}

try {
  for (const status of ["Approved", "Rejected", "Converted"]) {
    const source = await seedSource(status);
    const revision = await createRevision(source.id);
    const [created] = await sql`select * from public.estimates where id = ${revision.estimate_id}`;
    assert.equal(created.number, source.number);
    assert.equal(created.status, "Draft");
    assert.equal(created.approved_at, null);
    assert.equal(created.revision_root_id, source.id);
    assert.equal(created.revision_number, 1);
    assert.equal(created.previous_revision_id, source.id);
    const [unchanged] =
      await sql`select status, approved_at from public.estimates where id = ${source.id}`;
    assert.equal(unchanged.status, status);
    assert.equal(String(unchanged.approved_at ?? ""), String(source.approved_at ?? ""));
  }

  for (const status of ["Draft", "Sent"]) {
    const source = await seedSource(status);
    const [{ count: beforeCount }] = await sql`select count(*)::int as count from public.estimates`;
    await assert.rejects(
      () => sql`select * from public.create_estimate_revision(${source.id}::uuid)`,
      /only be created from an Approved, Rejected, or Converted/i
    );
    const [{ count: afterCount }] = await sql`select count(*)::int as count from public.estimates`;
    assert.equal(afterCount, beforeCount);
  }

  const source = await seedSource("Converted", { comprehensive: true });
  const sourceHeaderBefore = (await sql`select * from public.estimates where id = ${source.id}`)[0];
  const sourceMetaBefore = (
    await sql`select * from public.estimate_meta where estimate_id = ${source.id}`
  )[0];
  const sourceItemsBefore = await sql`
    select * from public.estimate_items where estimate_id = ${source.id} order by sort_order, id
  `;
  const sourceCategoriesBefore = await sql`
    select cost_code, display_name, order_index from public.estimate_categories
    where estimate_id = ${source.id} order by order_index, cost_code
  `;
  const sourceScheduleBefore = await sql`
    select * from public.estimate_payment_schedule_items
    where estimate_id = ${source.id} order by sort_order, id
  `;
  const sourceTotal = await estimateFinancialTotal(source.id);

  const revision = await createRevision(source.id);
  const revisionId = revision.estimate_id;
  const [revisionHeader] = await sql`select * from public.estimates where id = ${revisionId}`;
  const [revisionMeta] =
    await sql`select * from public.estimate_meta where estimate_id = ${revisionId}`;
  const revisionItems = await sql`
    select * from public.estimate_items where estimate_id = ${revisionId} order by sort_order, id
  `;
  const revisionCategories = await sql`
    select cost_code, display_name, order_index from public.estimate_categories
    where estimate_id = ${revisionId} order by order_index, cost_code
  `;
  const revisionSchedule = await sql`
    select * from public.estimate_payment_schedule_items
    where estimate_id = ${revisionId} order by sort_order, id
  `;

  assert.equal(revisionHeader.customer_id, sourceHeaderBefore.customer_id);
  assert.equal(revisionHeader.client, sourceHeaderBefore.client);
  assert.equal(revisionHeader.project, sourceHeaderBefore.project);
  for (const key of [
    "client_name",
    "client_phone",
    "client_email",
    "client_address",
    "project_name",
    "project_site_address",
    "tax",
    "discount",
    "overhead_pct",
    "profit_pct",
    "notes",
    "sales_person",
  ]) {
    assert.equal(String(revisionMeta[key] ?? ""), String(sourceMetaBefore[key] ?? ""), key);
  }
  assert.deepEqual(revisionMeta.cost_category_names, sourceMetaBefore.cost_category_names);
  assert.deepEqual(revisionMeta.document_notes, sourceMetaBefore.document_notes);
  assert.equal(revisionMeta.valid_until, null);
  assert.equal(isoDate(revisionMeta.estimate_date), new Date().toISOString().slice(0, 10));
  assert.deepEqual(revisionCategories, sourceCategoriesBefore);
  assert.deepEqual(
    revisionItems.map(({ id: _id, estimate_id: _estimateId, ...row }) => row),
    sourceItemsBefore.map(({ id: _id, estimate_id: _estimateId, ...row }) => row)
  );
  assert.ok(revisionItems.every((row, index) => row.id !== sourceItemsBefore[index].id));
  assert.deepEqual(
    revisionSchedule.map(
      ({
        id: _id,
        estimate_id: _estimateId,
        due_date: _dueDate,
        status: _status,
        invoice_id: _invoiceId,
        created_at: _created,
        updated_at: _updated,
        ...row
      }) => row
    ),
    sourceScheduleBefore.map(
      ({
        id: _id,
        estimate_id: _estimateId,
        due_date: _dueDate,
        status: _status,
        invoice_id: _invoiceId,
        created_at: _created,
        updated_at: _updated,
        ...row
      }) => row
    )
  );
  assert.ok(revisionSchedule.every((row, index) => row.id !== sourceScheduleBefore[index].id));
  assert.ok(revisionSchedule.every((row) => row.due_date === null));
  assert.ok(revisionSchedule.every((row) => row.status === "draft" && row.invoice_id === null));
  assert.equal(await estimateFinancialTotal(revisionId), sourceTotal);

  const [reset] = await sql`
    select
      (select count(*)::int from public.projects where source_estimate_id = ${revisionId}) project_count,
      (select count(*)::int from public.estimate_snapshots where estimate_id = ${revisionId}) snapshot_count,
      (select count(*)::int from public.estimate_payment_schedule_items
        where estimate_id = ${revisionId} and (invoice_id is not null or status <> 'draft')) linked_schedule_count
  `;
  assert.deepEqual(reset, { project_count: 0, snapshot_count: 0, linked_schedule_count: 0 });
  assert.deepEqual(
    (await sql`select * from public.estimates where id = ${source.id}`)[0],
    sourceHeaderBefore
  );
  assert.deepEqual(
    (await sql`select * from public.estimate_meta where estimate_id = ${source.id}`)[0],
    sourceMetaBefore
  );
  assert.deepEqual(
    await sql`select * from public.estimate_items where estimate_id = ${source.id} order by sort_order, id`,
    sourceItemsBefore
  );
  assert.deepEqual(
    await sql`select * from public.estimate_payment_schedule_items
      where estimate_id = ${source.id} order by sort_order, id`,
    sourceScheduleBefore
  );

  await assert.rejects(
    () => sql`update public.estimates set revision_number = 99 where id = ${revisionId}`,
    /lineage is immutable/i
  );
  await assert.rejects(
    () => sql`select * from public.create_estimate_revision(${source.id}::uuid)`,
    /latest revision/i
  );

  const concurrentSource = await seedSource("Approved");
  const attempts = await Promise.allSettled([
    sql`select * from public.create_estimate_revision(${concurrentSource.id}::uuid)`,
    sql`select * from public.create_estimate_revision(${concurrentSource.id}::uuid)`,
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  const concurrentRevisions = await sql`
    select id, revision_number from public.estimates
    where revision_root_id = ${concurrentSource.id}
    order by revision_number
  `;
  for (const row of concurrentRevisions) {
    if (!estimateIds.includes(row.id)) estimateIds.push(row.id);
  }
  assert.deepEqual(
    concurrentRevisions.map((row) => row.revision_number),
    [0, 1]
  );

  console.log(
    "PASS: Phase 3A allowed/blocked states, immutable lineage, numbering, concurrency, " +
      "content and financial fidelity, schedule reset, downstream reset, and source immutability verified."
  );
} finally {
  if (estimateIds.length > 0) {
    await sql`delete from public.estimate_payment_schedule_items where estimate_id = any(${estimateIds}::uuid[])`;
    await sql`delete from public.estimate_snapshots where estimate_id = any(${estimateIds}::uuid[])`;
  }
  if (invoiceIds.length > 0)
    await sql`delete from public.invoices where id = any(${invoiceIds}::uuid[])`;
  if (projectIds.length > 0)
    await sql`delete from public.projects where id = any(${projectIds}::uuid[])`;
  if (estimateIds.length > 0) {
    const rows = await sql`
      select id from public.estimates where id = any(${estimateIds}::uuid[])
      order by revision_number desc
    `;
    for (const row of rows) await sql`delete from public.estimates where id = ${row.id}`;
  }
  if (customerIds.length > 0)
    await sql`delete from public.customers where id = any(${customerIds}::uuid[])`;
  await sql.end();
}
