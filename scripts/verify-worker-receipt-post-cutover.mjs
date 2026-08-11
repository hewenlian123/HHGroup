#!/usr/bin/env node

/**
 * Read-only post-cutover verifier. It intentionally requires the object count
 * and post-cutover catalog fingerprint captured by the release operator; an
 * omitted or mismatched value is a failure, not a warning.
 *
 * Required environment:
 *   RECEIPT_HARDENING_DATABASE_URL
 *   RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT
 *   RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.RECEIPT_HARDENING_DATABASE_URL;
const expectedObjectCount = Number(process.env.RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT);
const expectedSecurityFingerprint = process.env.RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT;
const printSecurityFingerprint = process.argv.includes("--print-security-fingerprint");

function fail(message) {
  throw new Error(`Receipt hardening verification failed: ${message}`);
}

function requireSource(relativePath, fragments) {
  const source = readFileSync(join(process.cwd(), relativePath), "utf8");
  for (const fragment of fragments) {
    if (!source.includes(fragment)) fail(`${relativePath} is missing required guard: ${fragment}`);
  }
  return source;
}

function assertRouteGuards() {
  const sync = requireSource("src/app/api/upload-receipt/sync/route.ts", [
    "requireSupabaseOwnerOrAdmin",
    "guardDangerousMaintenanceRequest",
    "getServerSupabaseAdmin",
  ]);
  if (sync.indexOf("requireSupabaseOwnerOrAdmin") > sync.indexOf("getServerSupabaseAdmin")) {
    fail("/api/upload-receipt/sync obtains the admin client before its owner/admin guard");
  }

  for (const route of [
    "src/app/api/worker-receipts/route.ts",
    "src/app/api/worker-receipts/view/route.ts",
  ]) {
    requireSource(route, ["requireSupabaseOwnerOrAdmin", "getServerSupabaseAdmin"]);
  }

  for (const route of [
    "src/app/api/upload-receipt/upload/route.ts",
    "src/app/api/upload-receipt/submit/route.ts",
  ]) {
    const source = requireSource(route, ["getServerSupabase"]);
    if (source.includes("getServerSupabaseAdmin") || source.includes("SUPABASE_SERVICE_ROLE")) {
      fail(`${route} exposes service-role authority to public receipt intake`);
    }
  }
}

if (!databaseUrl) fail("RECEIPT_HARDENING_DATABASE_URL is required");
if (!Number.isSafeInteger(expectedObjectCount) || expectedObjectCount < 0) {
  fail("RECEIPT_HARDENING_EXPECTED_OBJECT_COUNT must be a non-negative integer");
}
if (!expectedSecurityFingerprint && !printSecurityFingerprint) {
  fail("RECEIPT_HARDENING_EXPECTED_SECURITY_FINGERPRINT is required");
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const [result] = await sql`
    with reimbursement_references as (
      select
        reimbursement.id,
        reimbursement.receipt_url,
        case
          when reimbursement.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)$'
            then reimbursement.receipt_url
          when reimbursement.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)(\\?[^#]*)?$'
            then regexp_replace(
              regexp_replace(
                reimbursement.receipt_url,
                '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/',
                '',
                'i'
              ),
              '\\?.*$',
              ''
            )
        end as storage_path,
        exists (
          select 1
          from public.worker_receipts as receipt
          where receipt.reimbursement_id = reimbursement.id
        ) as has_linked_worker_receipt,
        reimbursement.receipt_url ~* '^https?://[^/?#[:space:]]+(?:/[^[:space:]#]*)?(?:#[^[:space:]]*)?$'
          as is_valid_external_http_reference,
        reimbursement.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts(?:/|$)'
          as is_worker_receipts_storage_url
      from public.worker_reimbursements as reimbursement
      where reimbursement.receipt_url is not null
    ),
    worker_receipt_references as (
      select
        receipt.id,
        case
          when receipt.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)$'
            then receipt.receipt_url
          when receipt.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)(\\?[^#]*)?$'
            then regexp_replace(
              regexp_replace(
                receipt.receipt_url,
                '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/',
                '',
                'i'
              ),
              '\\?.*$',
              ''
            )
        end as storage_path
      from public.worker_receipts as receipt
    ),
    integrity as (
      select
        (select count(*) from storage.objects where bucket_id = 'worker-receipts')::bigint as object_count,
        (select count(*) from public.worker_receipts as receipt where receipt.receipt_url is null or not (
          receipt.receipt_url ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)$'
          or receipt.receipt_url ~* '^https?://[^/?#]+/storage/v1/object/(public|sign)/worker-receipts/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)(\\?[^#]*)?$'
        ))::bigint as incompatible_worker_receipts,
        (select count(*) from public.worker_receipts as receipt left join public.worker_reimbursements as reimbursement on reimbursement.id = receipt.reimbursement_id where receipt.reimbursement_id is not null and (reimbursement.id is null or reimbursement.receipt_url is distinct from receipt.receipt_url))::bigint as dangling_worker_receipt_links,
        (select count(*) from worker_receipt_references as receipt left join storage.objects as object on object.bucket_id = 'worker-receipts' and object.name = receipt.storage_path where receipt.storage_path is null or object.id is null)::bigint as missing_worker_receipt_objects,
        (select count(*) from reimbursement_references as reimbursement left join public.worker_receipts as receipt on receipt.reimbursement_id = reimbursement.id left join storage.objects as object on object.bucket_id = 'worker-receipts' and object.name = reimbursement.storage_path where (
          reimbursement.has_linked_worker_receipt and (reimbursement.storage_path is null or object.id is null or receipt.receipt_url is distinct from reimbursement.receipt_url)
        ) or (
          not reimbursement.has_linked_worker_receipt and not ((reimbursement.is_valid_external_http_reference and not reimbursement.is_worker_receipts_storage_url) or (reimbursement.storage_path is not null and object.id is not null))
        ))::bigint as invalid_reimbursement_references,
        (select count(*) from reimbursement_references where not has_linked_worker_receipt and storage_path is null and is_valid_external_http_reference and not is_worker_receipts_storage_url)::bigint as allowed_unlinked_external_reimbursements
    ),
    security_fingerprint as (
      select md5(jsonb_build_object(
        'bucket', (select jsonb_build_object('public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) from storage.buckets where id = 'worker-receipts'),
        'policies', coalesce((select jsonb_agg(to_jsonb(policy) order by policy.schemaname, policy.tablename, policy.policyname) from (
          select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          from pg_policies
          where (schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ilike '%worker-receipts%' or coalesce(with_check, '') ilike '%worker-receipts%'))
             or (schemaname = 'public' and tablename in ('worker_receipts', 'workers', 'projects'))
        ) as policy), '[]'::jsonb),
        'grants', coalesce((select jsonb_agg(to_jsonb(table_grant) order by table_grant.table_schema, table_grant.table_name, table_grant.grantee, table_grant.privilege_type) from (
          select table_schema, table_name, grantee, privilege_type, is_grantable
          from information_schema.role_table_grants
          where (table_schema = 'storage' and table_name in ('objects', 'buckets'))
             or (table_schema = 'public' and table_name in ('worker_receipts', 'workers', 'projects'))
        ) as table_grant), '[]'::jsonb)
        , 'column_grants', coalesce((select jsonb_agg(to_jsonb(column_grant) order by column_grant.table_schema, column_grant.table_name, column_grant.column_name, column_grant.grantee, column_grant.privilege_type) from (
          select table_schema, table_name, column_name, grantee, privilege_type, is_grantable
          from information_schema.role_column_grants
          where (table_schema = 'storage' and table_name in ('objects', 'buckets'))
             or (table_schema = 'public' and table_name in ('worker_receipts', 'workers', 'projects'))
        ) as column_grant), '[]'::jsonb)
        , 'rls', coalesce((select jsonb_agg(to_jsonb(table_rls) order by table_rls.schemaname, table_rls.tablename) from (
          select namespace.nspname as schemaname, relation.relname as tablename,
            relation.relrowsecurity, relation.relforcerowsecurity
          from pg_class as relation
          join pg_namespace as namespace on namespace.oid = relation.relnamespace
          where (namespace.nspname = 'storage' and relation.relname in ('objects', 'buckets'))
             or (namespace.nspname = 'public' and relation.relname in ('worker_receipts', 'workers', 'projects'))
        ) as table_rls), '[]'::jsonb)
      )::text) as fingerprint
    )
    select
      integrity.*,
      security_fingerprint.fingerprint,
      (select public from storage.buckets where id = 'worker-receipts') as bucket_is_public,
      (select file_size_limit from storage.buckets where id = 'worker-receipts') as file_size_limit,
      (select allowed_mime_types from storage.buckets where id = 'worker-receipts') as allowed_mime_types,
      (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and (coalesce(qual, '') ilike '%worker-receipts%' or coalesce(with_check, '') ilike '%worker-receipts%'))::bigint as worker_receipt_storage_read_policies,
      (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'worker_receipts_public_intake_insert' and cmd = 'INSERT' and roles = array['anon']::name[])::bigint as narrow_anon_upload_policy_count,
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'worker_receipts' and policyname = 'worker_receipts_public_submit' and cmd = 'INSERT' and roles = array['anon']::name[])::bigint as narrow_anon_submit_policy_count,
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'worker_receipts' and policyname in ('worker_receipts_owner_admin_select', 'worker_receipts_owner_admin_insert', 'worker_receipts_owner_admin_update', 'worker_receipts_owner_admin_delete') and roles = array['authenticated']::name[])::bigint as owner_admin_policy_count
    from integrity
    cross join security_fingerprint
  `;

  if (!result) fail("worker-receipts bucket was not found");
  if (result.bucket_is_public !== false) fail("worker-receipts bucket is public");
  if (Number(result.file_size_limit) !== 10 * 1024 * 1024) fail("unexpected file size limit");
  if (
    JSON.stringify(result.allowed_mime_types) !==
    JSON.stringify(["image/jpeg", "image/png", "image/webp", "application/pdf"])
  ) {
    fail("unexpected allowed MIME types");
  }
  if (Number(result.object_count) !== expectedObjectCount) fail("Storage object count changed");
  for (const field of [
    "incompatible_worker_receipts",
    "dangling_worker_receipt_links",
    "missing_worker_receipt_objects",
    "invalid_reimbursement_references",
  ]) {
    if (Number(result[field]) !== 0) fail(`${field} is non-zero`);
  }
  if (Number(result.worker_receipt_storage_read_policies) !== 0)
    fail("anon Storage read/list policy remains");
  if (Number(result.narrow_anon_upload_policy_count) !== 1)
    fail("narrow anon upload policy is missing");
  if (Number(result.narrow_anon_submit_policy_count) !== 1)
    fail("narrow anon submit policy is missing");
  if (Number(result.owner_admin_policy_count) !== 4)
    fail("owner/admin review policy set is incomplete");
  if (!printSecurityFingerprint && result.fingerprint !== expectedSecurityFingerprint) {
    fail("RLS/Storage/grant fingerprint mismatch");
  }

  assertRouteGuards();
  console.log(
    JSON.stringify({
      ok: true,
      objectCount: Number(result.object_count),
      allowedUnlinkedExternalReimbursements: Number(
        result.allowed_unlinked_external_reimbursements
      ),
      securityFingerprint: result.fingerprint,
    })
  );
} finally {
  await sql.end({ timeout: 5 });
}
