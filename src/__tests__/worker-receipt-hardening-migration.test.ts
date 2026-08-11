import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const runLocal = process.env.RUN_LOCAL_RECEIPT_HARDENING_TESTS === "1";
const postgresImage =
  process.env.LOCAL_RECEIPT_POSTGRES_IMAGE ?? "public.ecr.aws/supabase/postgres:17.6.1.063";
const postgresPassword = "receipt-hardening-local-test";
const containerName = `hh-receipt-hardening-${randomUUID().slice(0, 8)}`;

const bridgeSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260811040100_worker_receipt_legacy_bridge.sql"),
  "utf8"
);
const finalSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811040201_worker_receipt_rls_storage_hardening.sql"
  ),
  "utf8"
);
const rollbackSql = readFileSync(
  join(process.cwd(), "scripts/receipt-hardening-rollback.sql"),
  "utf8"
);
const productionBaselineSql = readFileSync(
  join(process.cwd(), "scripts/receipt-hardening-production-baseline.sql"),
  "utf8"
);
const preflightSql = readFileSync(
  join(process.cwd(), "scripts/preflight-worker-receipt-remediation.sql"),
  "utf8"
);
const verificationSql = readFileSync(
  join(process.cwd(), "scripts/verify-worker-receipt-remediation.sql"),
  "utf8"
);
const postCutoverVerifier = join(process.cwd(), "scripts/verify-worker-receipt-post-cutover.mjs");

const workerId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const receiptOneId = "30000000-0000-4000-8000-000000000001";
const receiptTwoId = "30000000-0000-4000-8000-000000000002";
const reimbursementOneId = "40000000-0000-4000-8000-000000000001";
const reimbursementTwoId = "40000000-0000-4000-8000-000000000002";
const pathOne = "uploads/50000000-0000-4000-8000-000000000001.png";
const pathTwo = "uploads/50000000-0000-4000-8000-000000000002.png";
const externalOne = "https://legacy.example.test/receipt-one.png";
const externalTwo = "https://legacy.example.test/receipt-two.png";

let db: Sql;
let localDatabaseUrl = "";

function canonicalPath(sequence: number): string {
  const suffix = String(sequence).padStart(12, "0");
  return `uploads/${String(sequence).padStart(8, "0")}-0000-4000-8000-${suffix}.png`;
}

function canonicalPublicUrl(path: string, sequence: number): string {
  return `https://project.example.test/storage/v1/object/public/worker-receipts/${path}?token=receipt-${sequence}&download=1`;
}

function fixtureId(prefix: "3" | "4", sequence: number): string {
  return `${prefix}${String(sequence).padStart(7, "0")}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

async function waitForDatabase(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await db`select 1`;
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Timed out waiting for isolated receipt-hardening PostgreSQL.");
}

async function resetDatabase({
  applyBridge = true,
}: { applyBridge?: boolean } = {}): Promise<void> {
  await db.unsafe(`
    drop schema if exists private cascade;
    drop schema if exists storage cascade;
    drop schema if exists auth cascade;
    drop schema if exists public cascade;
    create schema public;
    create schema storage;
    create schema auth;

    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
    end
    $$;

    create function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$ select '{"app_metadata":{"role":"owner"}}'::jsonb $$;

    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key,
      bucket_id text not null,
      name text not null,
      metadata jsonb not null default '{}'::jsonb
    );
    alter table storage.objects enable row level security;

    create table public.workers (
      id uuid primary key,
      name text not null,
      status text not null
    );
    create table public.projects (
      id uuid primary key,
      name text not null,
      status text not null
    );
    create table public.worker_reimbursements (
      id uuid primary key,
      receipt_url text
    );
    create table public.worker_receipts (
      id uuid primary key,
      worker_id uuid,
      project_id uuid,
      amount numeric,
      receipt_url text,
      status text not null default 'Pending',
      rejection_reason text,
      reimbursement_id uuid,
      worker_name text,
      expense_type text,
      notes text,
      vendor text,
      description text,
      receipt_date date
    );

    insert into storage.buckets (id, name, public)
    values ('worker-receipts', 'worker-receipts', true);
  `);

  await db.unsafe(productionBaselineSql);
  if (applyBridge) await db.unsafe(bridgeSql);
  await db`
    insert into public.workers (id, name, status)
    values (${workerId}, 'Receipt Migration Test Worker', 'active')
  `;
  await db`
    insert into public.projects (id, name, status)
    values (${projectId}, 'Receipt Migration Test Project', 'active')
  `;
}

async function addObject(path: string): Promise<void> {
  await db`
    insert into storage.objects (id, bucket_id, name)
    values (${randomUUID()}, 'worker-receipts', ${path})
  `;
}

async function addReceipt(
  receiptId: string,
  receiptUrl: string,
  reimbursementId: string | null,
  reimbursementUrl: string | null
): Promise<void> {
  if (reimbursementId) {
    await db`
      insert into public.worker_reimbursements (id, receipt_url)
      values (${reimbursementId}, ${reimbursementUrl})
    `;
  }

  await db`
    insert into public.worker_receipts (
      id, worker_id, worker_name, project_id, expense_type, amount,
      receipt_url, receipt_date, reimbursement_id
    )
    values (
      ${receiptId}, ${workerId}, 'Receipt Migration Test Worker', ${projectId}, 'Other', 25,
      ${receiptUrl}, '2026-08-10', ${reimbursementId}
    )
  `;
}

async function applyFinal(): Promise<void> {
  await db.unsafe(finalSql);
}

async function expectFinalToFail(message: RegExp): Promise<void> {
  let failure = "";
  try {
    await applyFinal();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (failure) await db.unsafe("rollback");
  expect(failure).toMatch(message);
}

async function bucketIsPublic(): Promise<boolean> {
  const [bucket] = await db<{ public: boolean }[]>`
    select public from storage.buckets where id = 'worker-receipts'
  `;
  return Boolean(bucket?.public);
}

async function productionBaselineFingerprint(): Promise<string> {
  const [result] = await db<{ fingerprint: unknown }[]>`
    select jsonb_build_object(
      'bucket', (
        select jsonb_build_object(
          'public', public,
          'file_size_limit', file_size_limit,
          'allowed_mime_types', allowed_mime_types
        )
        from storage.buckets
        where id = 'worker-receipts'
      ),
      'policies', coalesce((
        select jsonb_agg(to_jsonb(policy) order by policy.schemaname, policy.tablename, policy.policyname)
        from (
          select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          from pg_policies
          where (schemaname = 'storage' and tablename = 'objects' and (
            coalesce(qual, '') ilike '%worker-receipts%'
            or coalesce(with_check, '') ilike '%worker-receipts%'
          ))
          or (schemaname = 'public' and tablename in ('worker_receipts', 'workers', 'projects'))
        ) as policy
      ), '[]'::jsonb),
      'grants', coalesce((
        select jsonb_agg(to_jsonb(table_grant) order by table_grant.table_schema, table_grant.table_name, table_grant.grantee, table_grant.privilege_type)
        from (
          select table_schema, table_name, grantee, privilege_type, is_grantable
          from information_schema.role_table_grants
          where (table_schema = 'storage' and table_name in ('objects', 'buckets'))
             or (table_schema = 'public' and table_name in ('worker_receipts', 'workers', 'projects'))
        ) as table_grant
      ), '[]'::jsonb),
      'column_grants', coalesce((
        select jsonb_agg(to_jsonb(column_grant) order by column_grant.table_schema, column_grant.table_name, column_grant.column_name, column_grant.grantee, column_grant.privilege_type)
        from (
          select table_schema, table_name, column_name, grantee, privilege_type, is_grantable
          from information_schema.role_column_grants
          where (table_schema = 'storage' and table_name in ('objects', 'buckets'))
             or (table_schema = 'public' and table_name in ('worker_receipts', 'workers', 'projects'))
        ) as column_grant
      ), '[]'::jsonb),
      'rls', coalesce((
        select jsonb_agg(to_jsonb(table_rls) order by table_rls.schemaname, table_rls.tablename)
        from (
          select namespace.nspname as schemaname, relation.relname as tablename,
            relation.relrowsecurity, relation.relforcerowsecurity
          from pg_class as relation
          join pg_namespace as namespace on namespace.oid = relation.relnamespace
          where (namespace.nspname = 'storage' and relation.relname in ('objects', 'buckets'))
             or (namespace.nspname = 'public' and relation.relname in ('worker_receipts', 'workers', 'projects'))
        ) as table_rls
      ), '[]'::jsonb)
    ) as fingerprint
  `;
  return JSON.stringify(result?.fingerprint);
}

function runPostCutoverVerifier(
  args: string[],
  fingerprint?: string,
  expectedObjectCount = 1
): string {
  return execFileSync(process.execPath, [postCutoverVerifier, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      RECEIPT_HARDENING_DATABASE_URL: localDatabaseUrl,
      RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT: String(expectedObjectCount),
      ...(fingerprint ? { RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT: fingerprint } : {}),
    },
  }).trim();
}

const localDescribe = runLocal ? describe : describe.skip;

localDescribe("worker receipt final hardening migration (local Docker)", () => {
  beforeAll(async () => {
    docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--env",
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "--publish",
      "127.0.0.1::5432",
      postgresImage,
    ]);
    const port = Number(docker(["port", containerName, "5432/tcp"]).match(/:(\d+)$/m)?.[1]);
    if (!port) throw new Error("Unable to determine isolated PostgreSQL port.");
    db = postgres({
      host: "127.0.0.1",
      port,
      database: "postgres",
      username: "supabase_admin",
      password: postgresPassword,
      max: 1,
    });
    localDatabaseUrl = `postgres://supabase_admin:${postgresPassword}@127.0.0.1:${port}/postgres`;
    await waitForDatabase();
  }, 30_000);

  afterAll(async () => {
    await db?.end({ timeout: 5 });
    try {
      docker(["rm", "--force", containerName]);
    } catch {
      // The container uses --rm and may already be gone after a failed startup.
    }
  });

  test("passes after two legacy rows receive valid remediation evidence", async () => {
    await resetDatabase();
    await addObject(pathOne);
    await addObject(pathTwo);
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);
    await addReceipt(receiptTwoId, externalTwo, reimbursementTwoId, externalTwo);

    await db`select * from private.remediate_worker_receipt_reference(${receiptOneId}, ${externalOne}, ${pathOne})`;
    await db`select * from private.remediate_worker_receipt_reference(${receiptTwoId}, ${externalTwo}, ${pathTwo})`;

    await applyFinal();
    expect(await bucketIsPublic()).toBe(false);
    const [{ count }] = await db<{ count: string }[]>`
      select count(*)::text as count from public.worker_receipt_reference_remediations
    `;
    expect(count).toBe("2");
  });

  test("passes repeatedly after owner-approved deletion leaves no incompatible or dangling links", async () => {
    await resetDatabase();
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);
    await addReceipt(receiptTwoId, externalTwo, reimbursementTwoId, externalTwo);
    await db`
      delete from public.worker_receipts
      where id in (${receiptOneId}, ${receiptTwoId})
    `;
    await db`
      update public.worker_reimbursements
      set receipt_url = null
      where id in (${reimbursementOneId}, ${reimbursementTwoId})
    `;

    await addObject(pathOne);
    await addReceipt(receiptOneId, pathOne, null, null);

    await applyFinal();
    await applyFinal();

    expect(await bucketIsPublic()).toBe(false);
    const [{ count }] = await db<{ count: string }[]>`
      select count(*)::text as count from public.worker_receipt_reference_remediations
    `;
    expect(count).toBe("0");
  });

  test("allows valid unlinked external reimbursement evidence outside worker-receipt Storage", async () => {
    await resetDatabase();
    await db`
      insert into public.worker_reimbursements (id, receipt_url)
      values (${reimbursementOneId}, ${externalOne})
    `;

    await db.unsafe(preflightSql);
    await applyFinal();
    await applyFinal();

    expect(await bucketIsPublic()).toBe(false);
  });

  test("preserves canonical public receipt paths while accounting for 35 linked reimbursements, 48 receipts, and 63 objects", async () => {
    await resetDatabase();

    for (let sequence = 1; sequence <= 63; sequence += 1) {
      await addObject(canonicalPath(sequence));
    }

    for (let sequence = 1; sequence <= 48; sequence += 1) {
      const receiptUrl = canonicalPublicUrl(canonicalPath(sequence), sequence);
      const reimbursementId = sequence <= 35 ? fixtureId("4", sequence) : null;
      await addReceipt(
        fixtureId("3", sequence),
        receiptUrl,
        reimbursementId,
        reimbursementId ? receiptUrl : null
      );
    }

    try {
      await db.unsafe(preflightSql);
      await applyFinal();
      await db.unsafe(verificationSql);

      const [counts] = await db<
        {
          worker_receipt_count: string;
          linked_reimbursement_count: string;
          object_count: string;
        }[]
      >`
        select
          (select count(*)::text from public.worker_receipts) as worker_receipt_count,
          (select count(*)::text from public.worker_reimbursements) as linked_reimbursement_count,
          (select count(*)::text from storage.objects where bucket_id = 'worker-receipts') as object_count
      `;
      expect(counts).toEqual({
        worker_receipt_count: "48",
        linked_reimbursement_count: "35",
        object_count: "63",
      });

      const captured = JSON.parse(
        runPostCutoverVerifier(["--print-security-fingerprint"], undefined, 63)
      ) as { securityFingerprint: string };
      const verified = JSON.parse(runPostCutoverVerifier([], captured.securityFingerprint, 63)) as {
        ok: boolean;
        objectCount: number;
        allowedUnlinkedExternalReimbursements: number;
      };
      expect(verified).toMatchObject({
        ok: true,
        objectCount: 63,
        allowedUnlinkedExternalReimbursements: 0,
      });
    } finally {
      await db.unsafe("rollback");
    }
  });

  test("fails closed when incompatible rows remain without remediation evidence", async () => {
    await resetDatabase();
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);

    await expectFinalToFail(
      /incompatible receipt references remain without valid remediation evidence/i
    );
    expect(await bucketIsPublic()).toBe(true);
  });

  test("fails closed when a deleted worker receipt leaves a dangling worker-receipts reference", async () => {
    await resetDatabase();
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);
    await db`delete from public.worker_receipts where id = ${receiptOneId}`;
    await db`
      update public.worker_reimbursements
      set receipt_url = ${pathOne}
      where id = ${reimbursementOneId}
    `;

    await expectFinalToFail(
      /reimbursement receipt links are malformed, missing their worker-receipts object, or detached/i
    );
    expect(await bucketIsPublic()).toBe(true);

    await resetDatabase();
    await db`
      insert into public.worker_reimbursements (id, receipt_url)
      values (
        ${reimbursementOneId},
        'https://project.example.test/storage/v1/object/public/worker-receipts/not-canonical.gif'
      )
    `;

    await expectFinalToFail(
      /reimbursement receipt links are malformed, missing their worker-receipts object, or detached/i
    );
    expect(await bucketIsPublic()).toBe(true);
  });

  test("fails closed when remediation evidence is stale or its canonical object is missing", async () => {
    await resetDatabase();
    await addObject(pathOne);
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);
    await db`
      insert into public.worker_receipt_reference_remediations (
        worker_receipt_id, reimbursement_id, old_receipt_url,
        old_reimbursement_receipt_url, replacement_storage_path
      )
      values (${receiptOneId}, ${reimbursementOneId}, ${externalOne}, ${externalOne}, ${pathOne})
    `;

    await expectFinalToFail(
      /remediation audit rows are incomplete, stale, or missing their replacement object/i
    );
    expect(await bucketIsPublic()).toBe(true);

    await resetDatabase();
    await addReceipt(receiptOneId, pathOne, null, null);

    await expectFinalToFail(/referenced receipt objects are missing/i);
    expect(await bucketIsPublic()).toBe(true);
  });

  test("fails closed for malformed references and dangling reimbursement links", async () => {
    await resetDatabase();
    await addReceipt(receiptOneId, "uploads/not-a-canonical-receipt.gif", null, null);

    await expectFinalToFail(
      /incompatible receipt references remain without valid remediation evidence/i
    );
    expect(await bucketIsPublic()).toBe(true);

    await resetDatabase();
    await addObject(pathOne);
    await addObject(pathTwo);
    await addReceipt(receiptOneId, pathOne, reimbursementOneId, pathTwo);

    await expectFinalToFail(
      /reimbursement links are dangling or reference a different receipt object/i
    );
    expect(await bucketIsPublic()).toBe(true);

    await resetDatabase();
    await db`
      insert into public.worker_reimbursements (id, receipt_url)
      values (${reimbursementOneId}, 'not a receipt reference')
    `;

    await expectFinalToFail(
      /reimbursement receipt links are malformed, missing their worker-receipts object, or detached/i
    );
    expect(await bucketIsPublic()).toBe(true);
  });

  test("restores the verified Production baseline exactly after bridge and final hardening", async () => {
    await resetDatabase({ applyBridge: false });
    const baselineFingerprint = await productionBaselineFingerprint();

    await db.unsafe(bridgeSql);
    await addObject(pathOne);
    await addReceipt(receiptOneId, pathOne, reimbursementOneId, pathOne);
    await applyFinal();

    await db.unsafe(rollbackSql);

    expect(await bucketIsPublic()).toBe(true);
    expect(await productionBaselineFingerprint()).toBe(baselineFingerprint);
  });

  test("runs post-cutover verification for the approved cleanup state", async () => {
    await resetDatabase();
    await addReceipt(receiptOneId, externalOne, reimbursementOneId, externalOne);
    await db`delete from public.worker_receipts where id = ${receiptOneId}`;
    await addObject(pathOne);
    await addReceipt(receiptTwoId, pathOne, null, null);
    await applyFinal();

    await db.unsafe(verificationSql);

    const captured = JSON.parse(runPostCutoverVerifier(["--print-security-fingerprint"])) as {
      securityFingerprint: string;
    };
    const verified = JSON.parse(runPostCutoverVerifier([], captured.securityFingerprint)) as {
      ok: boolean;
      objectCount: number;
      allowedUnlinkedExternalReimbursements: number;
    };
    expect(verified).toMatchObject({
      ok: true,
      objectCount: 1,
      allowedUnlinkedExternalReimbursements: 1,
    });

    const [integrity] = await db<
      {
        incompatible: string;
        dangling: string;
        missing: string;
      }[]
    >`
      with resolved_receipts as (
        select receipt.receipt_url as storage_path
        from public.worker_receipts as receipt
      )
      select
        count(*) filter (where receipt.receipt_url is null or receipt.receipt_url !~ '^uploads/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$')::text as incompatible,
        count(*) filter (
          where receipt.reimbursement_id is not null
            and (reimbursement.id is null or reimbursement.receipt_url is distinct from receipt.receipt_url)
        )::text as dangling,
        count(*) filter (where receipt_object.id is null)::text as missing
      from public.worker_receipts as receipt
      left join public.worker_reimbursements as reimbursement on reimbursement.id = receipt.reimbursement_id
      left join resolved_receipts on resolved_receipts.storage_path = receipt.receipt_url
      left join storage.objects as receipt_object
        on receipt_object.bucket_id = 'worker-receipts'
        and receipt_object.name = resolved_receipts.storage_path
    `;
    expect(integrity).toEqual({ incompatible: "0", dangling: "0", missing: "0" });
  });
});
