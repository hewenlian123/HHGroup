#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDirectory = `${root}/supabase/migrations`;
const localDatabaseUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(localDatabaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!localHosts.has(parsedDatabaseUrl.hostname) || parsedDatabaseUrl.port !== "54322") {
  throw new Error(
    "Project PDF migration checks are restricted to local Docker Supabase on port 54322."
  );
}

const migrationFile = (await readdir(migrationsDirectory)).find((candidate) =>
  candidate.endsWith("_project_pdf_documents_expand.sql")
);
if (!migrationFile) throw new Error("Project PDF documents expand migration is missing.");
const migrationSql = await readFile(`${migrationsDirectory}/${migrationFile}`, "utf8");

const LEGACY_PROJECT_ID = "88888888-8888-4888-8888-888888888888";
const LEGACY_DOCUMENT_ID = "99999999-9999-4999-8999-999999999999";
const LEGACY_FILE_PATH = `projects/${LEGACY_PROJECT_ID}/legacy/legacy-document.pdf`;
const rollbackProbe = new Error("PROJECT_PDF_EXPAND_PROBE_COMPLETE");

const sql = postgres(localDatabaseUrl, {
  max: 1,
  onnotice: () => {},
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function databaseFingerprint(connection) {
  const [fingerprint] = await connection`
    select
      (
        select md5(coalesce(string_agg(
          column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''),
          ',' order by ordinal_position
        ), ''))
        from information_schema.columns
        where table_schema = 'public' and table_name = 'documents'
      ) as schema_hash,
      (
        select count(*)::integer from public.documents
      ) as document_count,
      (
        select md5(coalesce(string_agg(row_to_json(document)::text, '' order by id), ''))
        from public.documents document
      ) as document_hash,
      (
        select count(*)::integer from storage.objects where bucket_id = 'attachments'
      ) as object_count,
      (
        select md5(coalesce(string_agg(name || ':' || coalesce(metadata::text, ''), '' order by name), ''))
        from storage.objects where bucket_id = 'attachments'
      ) as object_hash,
      (
        select public from storage.buckets where id = 'attachments'
      ) as bucket_public
  `;
  return fingerprint;
}

try {
  const before = await databaseFingerprint(sql);
  invariant(before.object_count === 0, "Local attachments must be empty before legacy probe.");

  try {
    await sql.begin(async (transaction) => {
      await transaction.unsafe(`
        delete from public.documents;

        alter table public.documents
          drop constraint if exists documents_size_bytes_nonnegative,
          drop constraint if exists documents_file_type_check,
          drop constraint if exists documents_project_id_fkey;

        alter table public.documents
          drop column if exists file_name cascade,
          drop column if exists file_path cascade,
          drop column if exists file_type cascade,
          drop column if exists mime_type cascade,
          drop column if exists size_bytes cascade,
          drop column if exists related_module cascade,
          drop column if exists related_id cascade,
          drop column if exists uploaded_by cascade,
          drop column if exists uploaded_at cascade,
          drop column if exists notes cascade;

        alter table public.documents add column if not exists name text;
        revoke select, insert, update, delete on table public.documents from service_role;
        update public.role_permissions
        set perms = perms - 'projects.update' - 'finance.manage'
        where role in ('admin', 'assistant');
        update storage.buckets
        set id = 'attachments_probe_baseline', name = 'attachments_probe_baseline'
        where id = 'attachments';
      `);

      await transaction`
        insert into public.projects (id, name)
        values (${LEGACY_PROJECT_ID}::uuid, '[P0 Probe] Legacy Project')
      `;
      await transaction`
        insert into public.documents (
          id, project_id, name, file_url, category, created_at
        ) values (
          ${LEGACY_DOCUMENT_ID}::uuid,
          ${LEGACY_PROJECT_ID}::uuid,
          'Legacy Document.pdf',
          ${LEGACY_FILE_PATH},
          'Invoice',
          '2026-08-01T08:00:00.000Z'::timestamptz
        )
      `;

      const [policiesBefore] = await transaction`
        select
          count(*)::integer as count,
          md5(coalesce(string_agg(
            policyname || ':' || cmd || ':' || roles::text || ':' ||
            coalesce(qual, '') || ':' || coalesce(with_check, ''),
            '' order by policyname
          ), '')) as hash
        from pg_policies
        where (schemaname = 'public' and tablename = 'documents')
           or (
             schemaname = 'storage'
             and tablename = 'objects'
             and (
               coalesce(qual, '') like '%bucket_id = ''attachments''%'
               or coalesce(with_check, '') like '%bucket_id = ''attachments''%'
             )
           )
      `;

      await transaction.unsafe(migrationSql);

      const columns = await transaction`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'documents'
        order by ordinal_position
      `;
      const canonicalColumns = new Map(columns.map((column) => [column.column_name, column]));
      for (const column of [
        "file_name",
        "file_path",
        "file_type",
        "mime_type",
        "size_bytes",
        "related_module",
        "related_id",
        "uploaded_by",
        "uploaded_at",
        "notes",
      ]) {
        invariant(canonicalColumns.has(column), `Missing canonical documents.${column}.`);
      }
      for (const requiredColumn of ["file_name", "file_path", "file_type", "uploaded_at"]) {
        invariant(
          canonicalColumns.get(requiredColumn)?.is_nullable === "NO",
          `documents.${requiredColumn} must be NOT NULL.`
        );
      }

      const [legacyDocument] = await transaction`
        select
          id, project_id, name, file_url, category, created_at,
          file_name, file_path, file_type, uploaded_at
        from public.documents
        where id = ${LEGACY_DOCUMENT_ID}::uuid
      `;
      invariant(
        legacyDocument?.id === LEGACY_DOCUMENT_ID,
        "Legacy document row was not preserved."
      );
      invariant(
        legacyDocument.project_id === LEGACY_PROJECT_ID,
        "Legacy project reference changed."
      );
      invariant(legacyDocument.name === "Legacy Document.pdf", "Legacy name changed.");
      invariant(legacyDocument.file_url === LEGACY_FILE_PATH, "Legacy file_url changed.");
      invariant(legacyDocument.category === "Invoice", "Legacy category changed.");
      invariant(legacyDocument.file_name === "Legacy Document.pdf", "file_name backfill failed.");
      invariant(legacyDocument.file_path === LEGACY_FILE_PATH, "file_path backfill failed.");
      invariant(
        legacyDocument.uploaded_at?.toISOString() === legacyDocument.created_at?.toISOString(),
        "uploaded_at backfill failed."
      );
      invariant(legacyDocument.file_type === "Invoice", "file_type backfill failed.");

      const constraints = await transaction`
        select conname, pg_get_constraintdef(oid) as definition
        from pg_constraint
        where conrelid = 'public.documents'::regclass
      `;
      const constraintDefinitions = new Map(
        constraints.map((constraint) => [constraint.conname, constraint.definition])
      );
      invariant(
        constraintDefinitions.get("documents_project_id_fkey")?.includes("ON DELETE SET NULL"),
        "Project foreign key is not ON DELETE SET NULL."
      );
      invariant(
        constraintDefinitions.has("documents_size_bytes_nonnegative"),
        "Missing size_bytes constraint."
      );
      invariant(
        constraintDefinitions.has("documents_file_type_check"),
        "Missing file_type constraint."
      );

      const indexes = await transaction`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public' and tablename = 'documents'
      `;
      const indexDefinitions = new Map(indexes.map((index) => [index.indexname, index.indexdef]));
      for (const index of [
        "idx_documents_project_id",
        "idx_documents_file_type",
        "idx_documents_related",
        "idx_documents_uploaded_at",
        "idx_documents_file_name_lower",
        "ux_documents_file_path_not_null",
      ]) {
        invariant(indexDefinitions.has(index), `Missing documents index ${index}.`);
      }
      invariant(
        indexDefinitions.get("ux_documents_file_path_not_null")?.includes("UNIQUE INDEX"),
        "file_path index is not unique."
      );

      const [bucket] = await transaction`
        select public, file_size_limit, allowed_mime_types
        from storage.buckets
        where id = 'attachments'
      `;
      invariant(bucket?.public === false, "attachments bucket is not private.");
      invariant(bucket.file_size_limit === null, "Unexpected attachments size restriction.");
      invariant(bucket.allowed_mime_types === null, "Unexpected attachments MIME restriction.");

      const [attachmentPolicies] = await transaction`
        select count(*)::integer as count
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and (
            coalesce(qual, '') like '%bucket_id = ''attachments''%'
            or coalesce(with_check, '') like '%bucket_id = ''attachments''%'
          )
      `;
      invariant(attachmentPolicies.count === 0, "attachments bucket gained a client policy.");

      const [policiesAfter] = await transaction`
        select
          count(*)::integer as count,
          md5(coalesce(string_agg(
            policyname || ':' || cmd || ':' || roles::text || ':' ||
            coalesce(qual, '') || ':' || coalesce(with_check, ''),
            '' order by policyname
          ), '')) as hash
        from pg_policies
        where (schemaname = 'public' and tablename = 'documents')
           or (
             schemaname = 'storage'
             and tablename = 'objects'
             and (
               coalesce(qual, '') like '%bucket_id = ''attachments''%'
               or coalesce(with_check, '') like '%bucket_id = ''attachments''%'
             )
           )
      `;
      invariant(
        policiesAfter.count === policiesBefore.count && policiesAfter.hash === policiesBefore.hash,
        "Immediate expand migration changed compatibility policies."
      );

      const [serviceGrant] = await transaction`
        select count(*)::integer as count
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'documents'
          and grantee = 'service_role'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      `;
      invariant(serviceGrant.count === 4, "documents service-role grants are incomplete.");

      const serviceReadDependencies = await transaction`
        select table_name
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee = 'service_role'
          and privilege_type = 'SELECT'
          and table_name in (
            'project_material_selections',
            'material_catalog',
            'project_closeout_completion',
            'project_closeout_punch',
            'invoices',
            'invoice_items',
            'invoice_payments',
            'project_change_orders',
            'subcontract_bills',
            'labor_entries',
            'expense_lines',
            'expenses',
            'commissions',
            'project_commissions'
          )
      `;
      invariant(
        serviceReadDependencies.length === 14,
        "Project PDF service-role read grants are incomplete."
      );

      for (const [role, projectsUpdate, financeManage] of [
        ["owner", true, true],
        ["admin", false, false],
        ["assistant", false, false],
      ]) {
        await transaction`
          select set_config(
            'request.jwt.claims',
            ${JSON.stringify({ sub: LEGACY_DOCUMENT_ID, app_metadata: { role } })},
            true
          )
        `;
        const [permissions] = await transaction`
          select
            public.has_perm('projects.update') as projects_update,
            public.has_perm('finance.manage') as finance_manage
        `;
        invariant(
          permissions.projects_update === projectsUpdate,
          `${role} projects.update result is incorrect.`
        );
        invariant(
          permissions.finance_manage === financeManage,
          `${role} finance.manage result is incorrect.`
        );
      }

      const [beforeRepeat] = await transaction`
        select
          count(*)::integer as row_count,
          md5(coalesce(string_agg(row_to_json(document)::text, '' order by id), '')) as row_hash,
          (select count(*)::integer from storage.objects where bucket_id = 'attachments') as object_count
        from public.documents document
      `;

      await transaction.unsafe(migrationSql);

      const [afterRepeat] = await transaction`
        select
          count(*)::integer as row_count,
          md5(coalesce(string_agg(row_to_json(document)::text, '' order by id), '')) as row_hash,
          (select count(*)::integer from storage.objects where bucket_id = 'attachments') as object_count
        from public.documents document
      `;
      invariant(
        JSON.stringify(afterRepeat) === JSON.stringify(beforeRepeat),
        "Repeated migration execution changed rows or objects."
      );

      throw rollbackProbe;
    });
  } catch (error) {
    if (error !== rollbackProbe) throw error;
  }

  const after = await databaseFingerprint(sql);
  invariant(
    JSON.stringify(after) === JSON.stringify(before),
    "Transaction-scoped migration probe did not restore the local baseline."
  );

  console.log(
    `Project PDF expand migration check passed (${migrationFile}): legacy upgrade, repeat execution, permissions, policies, grants, bucket, constraints, indexes, counts, and hashes.`
  );
} finally {
  await sql.end();
}
