import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedUrl = new URL(databaseUrl);
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsedUrl.hostname)) {
  throw new Error("Concurrency test is local-only; refusing a non-local database URL.");
}

const sql = postgres(databaseUrl, { max: 4, idle_timeout: 2 });
const bankIds = [randomUUID(), randomUUID()];
const sourceIds = bankIds.map(String);

const lines = [{ projectId: null, category: "Other", memo: "Concurrent line", amount: 25 }];
const expensePayload = {
  expenseDate: "2026-08-30",
  vendorName: "Concurrent Expense Vendor",
  paymentMethod: "ACH",
  sourceType: "company",
  status: "pending",
  groups: [{ projectId: null, lines }],
  deduction: null,
};
const callCreateExpense = (executor, key) => executor`
  select public.create_expense_atomic(${key}::text, ${sql.json(expensePayload)}::jsonb) as result
`;
const callReconcile = (executor, key, bankId) => executor`
  select public.reconcile_bank_transaction_expense_atomic(
    ${key}::text,
    ${bankId}::uuid,
    ${"Concurrent Vendor"}::text,
    ${"ACH"}::text,
    ${sql.json(lines)}::jsonb
  ) as result
`;

try {
  const expenseKey = `expense-concurrency:${randomUUID()}`;
  let releaseExpenseLock;
  const expenseLockHeld = new Promise((resolve) => {
    releaseExpenseLock = resolve;
  });
  const firstExpense = sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${expenseKey}, 0))`;
    releaseExpenseLock();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return callCreateExpense(tx, expenseKey);
  });
  await expenseLockHeld;
  const secondExpense = callCreateExpense(sql, expenseKey);
  const [firstExpenseRows, secondExpenseRows] = await Promise.all([firstExpense, secondExpense]);
  assert.equal(firstExpenseRows[0].result.expense_id, secondExpenseRows[0].result.expense_id);
  assert.deepEqual(
    new Set([
      Boolean(firstExpenseRows[0].result.replayed),
      Boolean(secondExpenseRows[0].result.replayed),
    ]),
    new Set([false, true])
  );
  const [expenseCount] = await sql`
    select count(*)::integer as count from public.expenses where idempotency_key = ${expenseKey}
  `;
  assert.equal(expenseCount.count, 1);

  await sql`
    insert into public.bank_transactions (id, txn_date, description, amount, status)
    values
      (${bankIds[0]}::uuid, current_date, 'Concurrent same-key bank row', -25, 'unmatched'),
      (${bankIds[1]}::uuid, current_date, 'Concurrent different-key bank row', -25, 'unmatched')
  `;

  const sameKey = `bank-concurrency-same:${bankIds[0]}`;
  let releaseFirstLock;
  const firstLockHeld = new Promise((resolve) => {
    releaseFirstLock = resolve;
  });
  const first = sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${sameKey}, 0))`;
    await tx`select id from public.bank_transactions where id = ${bankIds[0]}::uuid for update`;
    releaseFirstLock();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return callReconcile(tx, sameKey, bankIds[0]);
  });
  await firstLockHeld;
  const second = callReconcile(sql, sameKey, bankIds[0]);
  const [firstRows, secondRows] = await Promise.all([first, second]);
  const firstResult = firstRows[0].result;
  const secondResult = secondRows[0].result;
  assert.equal(firstResult.expense_id, secondResult.expense_id);
  assert.deepEqual(
    new Set([Boolean(firstResult.replayed), Boolean(secondResult.replayed)]),
    new Set([false, true])
  );
  const [sameKeyCount] = await sql`
    select count(*)::integer as count
    from public.expenses
    where source = 'bank_transaction' and source_id = ${sourceIds[0]}
  `;
  assert.equal(sameKeyCount.count, 1);

  const differentResults = await Promise.allSettled([
    callReconcile(sql, `bank-concurrency-a:${bankIds[1]}`, bankIds[1]),
    callReconcile(sql, `bank-concurrency-b:${bankIds[1]}`, bankIds[1]),
  ]);
  assert.equal(differentResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(differentResults.filter((result) => result.status === "rejected").length, 1);
  const [differentKeyCount] = await sql`
    select count(*)::integer as count
    from public.expenses
    where source = 'bank_transaction' and source_id = ${sourceIds[1]}
  `;
  assert.equal(differentKeyCount.count, 1);

  process.stdout.write(
    "PASS: concurrent Expense create and Bank reconcile retries each produced one canonical Expense.\n"
  );
} finally {
  await sql`delete from public.bank_transactions where id in (${bankIds[0]}::uuid, ${bankIds[1]}::uuid)`;
  await sql`delete from public.expenses where source = 'bank_transaction' and source_id in (${sourceIds[0]}, ${sourceIds[1]})`;
  await sql`delete from public.expenses where vendor_name = 'Concurrent Expense Vendor' and idempotency_key like 'expense-concurrency:%'`;
  await sql.end({ timeout: 2 });
}
