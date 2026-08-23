import assert from "node:assert/strict";
import postgres from "postgres";

const databaseUrl =
  process.env.SUPABASE_DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsed = new URL(databaseUrl);
if (!new Set(["127.0.0.1", "localhost", "[::1]", "::1"]).has(parsed.hostname)) {
  throw new Error("Phase 2B verification is local-Supabase only.");
}
if (parsed.port !== "54322") {
  throw new Error("Phase 2B verification requires the local Supabase database port 54322.");
}

const sql = postgres(databaseUrl, { max: 1 });
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

async function seedSource(status, { comprehensive = false, overScheduled = false } = {}) {
  const label = uniqueLabel(`VERIFY-P2B-${status}`);
  const [customer] = await sql`
    insert into public.customers (name, email, phone, address)
    values (${`${label} Customer`}, ${`${label}@example.test`}, '808-555-0202', '912 Ikena Cir')
    returning id
  `;
  customerIds.push(customer.id);

  const [estimate] = await sql`
    insert into public.estimates (
      number, client, project, status, approved_at, customer_id, created_at, updated_at
    ) values (
      ${label},
      ${`${label} Customer`},
      ${`${label} Project`},
      ${status},
      ${status === "Approved" || status === "Converted" ? "2025-01-03" : null},
      ${customer.id},
      '2025-01-01T10:00:00Z',
      '2025-01-02'
    )
    returning id, number, created_at, updated_at
  `;
  estimateIds.push(estimate.id);

  await sql`
    insert into public.estimate_meta (
      estimate_id,
      client_name,
      client_phone,
      client_email,
      client_address,
      project_name,
      project_site_address,
      cost_category_names,
      tax,
      discount,
      overhead_pct,
      profit_pct,
      estimate_date,
      valid_until,
      notes,
      sales_person,
      document_notes
    ) values (
      ${estimate.id},
      ${`${label} Customer`},
      '808-555-0202',
      ${`${label}@example.test`},
      '912 Ikena Cir',
      ${`${label} Project`},
      '100 Project Way',
      ${sql.json({ __documentStyle: comprehensive ? "itemized" : "proposal" })},
      47.12,
      100,
      0,
      0,
      '2025-01-02',
      '2025-03-02',
      'Preserve internal Estimate notes.',
      'HH Estimator',
      ${sql.json([
        { id: "terms-1", type: "payment_terms", title: "Terms", body: "Net 15" },
        { id: "scope-1", type: "scope", title: "Scope", body: "Verified scope" },
      ])}
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
      (${estimate.id}, '010000', 'Included scope', 1, 'LS', 600, 0, 0, 'included', false),
      (${estimate.id}, '020000', 'Owner supplied scope', 2, 'EA', 200, 0, 1, 'owner_supplied', true)
  `;

  if (comprehensive) {
    const [project] = await sql`
      insert into public.projects (
        name, status, budget, client, customer_id, source_estimate_id
      ) values (
        ${`${label} Converted Project`}, 'Active', 947.12, ${`${label} Customer`},
        ${customer.id}, ${estimate.id}
      )
      returning id
    `;
    projectIds.push(project.id);

    const [invoice] = await sql`
      insert into public.invoices (
        invoice_no, project_id, customer_id, client_name, status,
        subtotal, tax_amount, total, paid_total, balance_due
      ) values (
        ${uniqueLabel("INV-P2B")}, ${project.id}, ${customer.id}, ${`${label} Customer`},
        'Paid', 250, 0, 250, 250, 0
      )
      returning id
    `;
    invoiceIds.push(invoice.id);

    await sql`
      insert into public.estimate_payment_schedule_items (
        estimate_id, title, description, amount, due_date, status, invoice_id, sort_order
      ) values
        (${estimate.id}, 'Deposit', 'Tax-inclusive deposit', 250, '2025-01-10', 'paid', ${invoice.id}, 0),
        (${estimate.id}, 'Completion', 'Tax-inclusive completion', 697.12, '2025-03-01', 'invoiced', ${invoice.id}, 1)
    `;

    await sql`
      insert into public.estimate_snapshots (
        estimate_id, version, status_at_snapshot, frozen_payload
      ) values (${estimate.id}, 1, 'Converted', ${sql.json({ historical: true })})
    `;
  }

  if (overScheduled) {
    // Simulate a pre-guard legacy row so the copy RPC's independent defense is
    // exercised. SET LOCAL restores trigger execution at transaction end.
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`
        insert into public.estimate_payment_schedule_items (
          estimate_id, title, amount, status, sort_order
        ) values (${estimate.id}, 'Invalid legacy schedule', 947.13, 'draft', 0)
      `;
    });
  }

  return estimate;
}

async function duplicate(sourceId) {
  const [result] = await sql`
    select * from public.duplicate_estimate_as_draft(${sourceId}::uuid)
  `;
  estimateIds.push(result.estimate_id);
  return result;
}

try {
  for (const status of ["Draft", "Sent", "Approved", "Rejected"]) {
    const source = await seedSource(status);
    const result = await duplicate(source.id);
    const [copy] = await sql`
      select id, number, status, approved_at, customer_id, client, project, created_at, updated_at
      from public.estimates
      where id = ${result.estimate_id}
    `;
    assert.notEqual(copy.id, source.id);
    assert.notEqual(copy.number, source.number);
    assert.equal(copy.status, "Draft");
    assert.equal(copy.approved_at, null);
    assert.ok(new Date(copy.created_at).getTime() > new Date(source.created_at).getTime());
    assert.notEqual(String(copy.updated_at), String(source.updated_at));
  }

  const convertedSource = await seedSource("Converted", { comprehensive: true });
  const convertedResult = await duplicate(convertedSource.id);
  const duplicateId = convertedResult.estimate_id;

  const [sourceHeader] = await sql`select * from public.estimates where id = ${convertedSource.id}`;
  const [copyHeader] = await sql`select * from public.estimates where id = ${duplicateId}`;
  assert.equal(copyHeader.status, "Draft");
  assert.equal(copyHeader.approved_at, null);
  assert.equal(copyHeader.customer_id, sourceHeader.customer_id);
  assert.equal(copyHeader.client, sourceHeader.client);
  assert.equal(copyHeader.project, sourceHeader.project);

  const [sourceMeta] =
    await sql`select * from public.estimate_meta where estimate_id = ${convertedSource.id}`;
  const [copyMeta] =
    await sql`select * from public.estimate_meta where estimate_id = ${duplicateId}`;
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
    assert.equal(String(copyMeta[key] ?? ""), String(sourceMeta[key] ?? ""), key);
  }
  assert.equal(isoDate(sourceMeta.estimate_date), "2025-01-02");
  assert.equal(isoDate(sourceMeta.valid_until), "2025-03-02");
  assert.equal(isoDate(copyMeta.estimate_date), new Date().toISOString().slice(0, 10));
  assert.equal(copyMeta.valid_until, null);
  assert.deepEqual(copyMeta.cost_category_names, sourceMeta.cost_category_names);
  assert.deepEqual(copyMeta.document_notes, sourceMeta.document_notes);

  const sourceCategories = await sql`
    select cost_code, display_name, order_index
    from public.estimate_categories where estimate_id = ${convertedSource.id}
    order by order_index, cost_code
  `;
  const copyCategories = await sql`
    select cost_code, display_name, order_index
    from public.estimate_categories where estimate_id = ${duplicateId}
    order by order_index, cost_code
  `;
  assert.deepEqual(copyCategories, sourceCategories);

  const sourceItems = await sql`
    select id, cost_code, "desc", qty, unit, unit_cost, markup_pct, sort_order, status, hide_amount_on_pdf
    from public.estimate_items where estimate_id = ${convertedSource.id}
    order by sort_order, id
  `;
  const copyItems = await sql`
    select id, cost_code, "desc", qty, unit, unit_cost, markup_pct, sort_order, status, hide_amount_on_pdf
    from public.estimate_items where estimate_id = ${duplicateId}
    order by sort_order, id
  `;
  assert.deepEqual(
    copyItems.map(({ id: _id, ...row }) => row),
    sourceItems.map(({ id: _id, ...row }) => row)
  );
  assert.ok(copyItems.every((row, index) => row.id !== sourceItems[index].id));

  const sourceSchedule = await sql`
    select id, title, description, amount, due_date, status, invoice_id, sort_order
    from public.estimate_payment_schedule_items where estimate_id = ${convertedSource.id}
    order by sort_order, id
  `;
  const copySchedule = await sql`
    select id, title, description, amount, due_date, status, invoice_id, sort_order
    from public.estimate_payment_schedule_items where estimate_id = ${duplicateId}
    order by sort_order, id
  `;
  assert.deepEqual(
    copySchedule.map(
      ({ id: _id, due_date: _dueDate, status: _status, invoice_id: _invoiceId, ...row }) => row
    ),
    sourceSchedule.map(
      ({ id: _id, due_date: _dueDate, status: _status, invoice_id: _invoiceId, ...row }) => row
    )
  );
  assert.ok(copySchedule.every((row, index) => row.id !== sourceSchedule[index].id));
  assert.ok(sourceSchedule.every((row) => row.due_date !== null));
  assert.ok(copySchedule.every((row) => row.due_date === null));
  assert.ok(copySchedule.every((row) => row.status === "draft" && row.invoice_id === null));

  const [links] = await sql`
    select
      (select count(*)::int from public.projects where source_estimate_id = ${duplicateId}) as project_count,
      (select count(*)::int from public.estimate_snapshots where estimate_id = ${duplicateId}) as snapshot_count,
      (select count(*)::int from public.estimate_payment_schedule_items
        where estimate_id = ${duplicateId} and (invoice_id is not null or status <> 'draft')) as protected_schedule_count
  `;
  assert.deepEqual(links, {
    project_count: 0,
    snapshot_count: 0,
    protected_schedule_count: 0,
  });

  const invalidSource = await seedSource("Draft", { overScheduled: true });
  const [{ count: beforeCount }] = await sql`select count(*)::int as count from public.estimates`;
  await assert.rejects(
    () => sql`select * from public.duplicate_estimate_as_draft(${invalidSource.id}::uuid)`,
    /cannot exceed Estimate final total/i
  );
  const [{ count: afterCount }] = await sql`select count(*)::int as count from public.estimates`;
  assert.equal(afterCount, beforeCount, "over-schedule rejection must not leave a partial Draft");

  console.log(
    "PASS: Phase 2B.1 Draft duplication, fresh Estimate dates, cleared validity/milestone dates, " +
      "content fidelity, downstream reset, and atomic over-schedule rejection verified."
  );
} finally {
  if (estimateIds.length > 0) {
    await sql`
      delete from public.estimate_payment_schedule_items
      where estimate_id = any(${estimateIds}::uuid[])
    `;
  }
  if (invoiceIds.length > 0) {
    await sql`delete from public.invoices where id = any(${invoiceIds}::uuid[])`;
  }
  if (projectIds.length > 0) {
    await sql`delete from public.projects where id = any(${projectIds}::uuid[])`;
  }
  if (estimateIds.length > 0) {
    await sql`delete from public.estimates where id = any(${estimateIds}::uuid[])`;
  }
  if (customerIds.length > 0) {
    await sql`delete from public.customers where id = any(${customerIds}::uuid[])`;
  }
  await sql.end();
}
