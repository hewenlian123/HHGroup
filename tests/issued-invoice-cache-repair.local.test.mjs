import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import postgres from "postgres";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260906205201_repair_issued_invoice_balance_cache.sql",
    import.meta.url
  ),
  "utf8"
);

test(
  "issued invoice cache repair is narrow, guarded, and idempotent",
  {
    skip: process.env.HH_INVOICE_CACHE_REPAIR_LOCAL_TEST !== "1",
  },
  async (t) => {
    const status = JSON.parse(
      execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
    const url = new URL(status.DB_URL);
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Local database only");
    const sql = postgres(url.href, { max: 1, onnotice: () => {} });
    const rolledBack = new Error("intentional fixture rollback");
    const snapshot = async (db) =>
      JSON.stringify(await db`select to_jsonb(i) row from public.invoices i order by id`);
    const fixture = async (db, state, balance = 0, paid = 0) => {
      const id = randomUUID();
      await db`alter table public.invoices disable trigger derive_invoice_balance`;
      await db`insert into public.invoices(id,invoice_no,status,total,subtotal,paid_total,balance_due) values(${id},${"[E2E] cache repair " + id},${state},100,100,${paid},${balance})`;
      await db`alter table public.invoices enable trigger derive_invoice_balance`;
      return id;
    };
    const transaction = async (fn) => {
      const before = await snapshot(sql);
      try {
        await sql.begin(async (db) => {
          await fn(db);
          throw rolledBack;
        });
        assert.fail("Fixture transaction must roll back");
      } catch (error) {
        assert.equal(error, rolledBack);
      }
      assert.equal(
        await snapshot(sql),
        before,
        "All pre-existing invoice rows preserved exactly after rollback"
      );
    };
    try {
      await t.test(
        "changes only one issued balance cache, excludes Draft/Void, and retries unchanged",
        () =>
          transaction(async (db) => {
            const issued = await fixture(db, "Sent"),
              draft = await fixture(db, "Draft"),
              voided = await fixture(db, "Void");
            for (const amount of [40, 100]) {
              const control = await fixture(db, "Sent", 100);
              await db`insert into public.invoice_payments(id,invoice_id,amount,paid_at,status) values(${randomUUID()},${control},${amount},now(),'Posted')`;
            }
            const before = await snapshot(db);
            const paymentsBefore = JSON.stringify(
              await db`select to_jsonb(p) row from public.invoice_payments p order by id`
            );
            await db.unsafe(migration);
            const after = await snapshot(db);
            const expected = JSON.parse(before).map(({ row }) => {
              if (row.id === issued) row.balance_due = 100;
              return { row };
            });
            const actual = JSON.parse(after);
            for (const rows of [expected, actual])
              for (const { row } of rows) delete row.updated_at;
            assert.deepEqual(actual, expected, "Only the issued invoice balance may change");
            const selected =
              await db`select id,balance_due,status from public.invoices where id in (${issued},${draft},${voided})`;
            assert.equal(Number(selected.find((r) => r.id === issued).balance_due), 100);
            assert.equal(Number(selected.find((r) => r.id === draft).balance_due), 0);
            assert.equal(Number(selected.find((r) => r.id === voided).balance_due), 0);
            assert.equal(
              JSON.stringify(
                await db`select to_jsonb(p) row from public.invoice_payments p order by id`
              ),
              paymentsBefore
            );
            await db.unsafe(migration);
            assert.equal(await snapshot(db), after, "Repeated migration changes no rows");
          })
      );
      for (const [name, setup] of [
        ["rejects a different nonzero cache discrepancy", async (db) => fixture(db, "Sent", 9)],
        ["rejects an inconsistent paid cache", async (db) => fixture(db, "Sent", 0, 1)],
        [
          "rejects an existing overallocated invoice",
          async (db) => {
            const id = await fixture(db, "Sent");
            await db`alter table public.invoice_payments disable trigger guard_invoice_allocation_balance`;
            await db`alter table public.invoices disable trigger derive_invoice_balance`;
            await db`insert into public.invoice_payments(id,invoice_id,amount,paid_at,status) values(${randomUUID()},${id},101,now(),'Posted')`;
            await db`update public.invoices set paid_total=101 where id=${id}`;
            await db`alter table public.invoices enable trigger derive_invoice_balance`;
            await db`alter table public.invoice_payments enable trigger guard_invoice_allocation_balance`;
          },
        ],
        [
          "rejects more than the confirmed one-row scope atomically",
          async (db) => {
            await fixture(db, "Sent");
            await fixture(db, "Sent");
          },
        ],
      ])
        await t.test(name, () =>
          transaction(async (db) => {
            await setup(db);
            const before = await snapshot(db);
            await assert.rejects(
              db.savepoint((sp) => sp.unsafe(migration)),
              (error) => error.code === "23514"
            );
            assert.equal(await snapshot(db), before, "Rejected repair is atomic");
          })
        );
    } finally {
      await sql.end();
    }
  }
);
