-- ═══════════════════════════════════════════════════════════════════════════
-- E2E / staging SEED DATA — DO NOT RUN ON PRODUCTION
-- Path: `supabase/seed.sql` (local: `supabase db reset --local`; remote: `npm run db:seed:remote`).
-- Minimal subset only (no DB reset): `npm run db:seed:e2e` or Playwright `globalSetup` (tests/global-setup.ts).
-- All human-visible seed labels use an `[E2E]` prefix so they are easy to identify (and are not removed by
-- Playwright global-teardown, which only deletes rows matching PW / Playwright / Workflow Test / etc.).
--
-- TypeScript: Playwright globalSetup/teardown throw if NEXT_PUBLIC_SUPABASE_URL contains `supabase.co`.
-- Other entrypoints may use tests/e2e-supabase-url-guard.ts (E2E_ALLOW_REMOTE_SUPABASE=1 escape hatch).
-- This SQL file has no env check — do not run against production.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) Verify columns in **your** database (Supabase SQL Editor):
--
--    SELECT table_name, column_name
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN (
--        'categories', 'subcontractors', 'projects',
--        'workers', 'labor_entries', 'labor_workers',
--        'project_tasks', 'documents', 'site_photos',
--        'project_subcontractors'
--      )
--    ORDER BY table_name, ordinal_position;
--
-- 2) This script uses information_schema at **runtime** (via hh_e2e_col) so it
--    only references columns that exist. No static INSERT lists against unknown schemas.
--
-- Fixed IDs:
--   Project: 11111111-1111-1111-1111-111111111111
--   Worker:  22222222-2222-2222-2222-222222222222
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.hh_e2e_col(p_table text, p_col text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_col
  );
$$;

DO $$
DECLARE
  v_project constant uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_worker constant uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_has_tasks_is_test boolean;
  v_has_modern_labor boolean;
  v_sep text;
  v_cols text;
  v_vals text;
  v_sql text;
  v_sub_key text;
  v_date_col text;
BEGIN
  -- ─── Tear down ───
  IF to_regclass('public.labor_entries') IS NOT NULL THEN
    IF pg_temp.hh_e2e_col('labor_entries', 'project_id')
       AND pg_temp.hh_e2e_col('labor_entries', 'worker_id') THEN
      EXECUTE format(
        'DELETE FROM public.labor_entries WHERE project_id = %L::uuid OR worker_id = %L::uuid',
        v_project,
        v_worker
      );
    ELSIF pg_temp.hh_e2e_col('labor_entries', 'project_id') THEN
      EXECUTE format('DELETE FROM public.labor_entries WHERE project_id = %L::uuid', v_project);
    ELSIF pg_temp.hh_e2e_col('labor_entries', 'worker_id') THEN
      EXECUTE format('DELETE FROM public.labor_entries WHERE worker_id = %L::uuid', v_worker);
    ELSE
      RAISE NOTICE 'labor_entries: tear-down skipped (no project_id/worker_id columns).';
    END IF;
  END IF;

  IF to_regclass('public.site_photos') IS NOT NULL
     AND pg_temp.hh_e2e_col('site_photos', 'project_id') THEN
    EXECUTE format('DELETE FROM public.site_photos WHERE project_id = %L::uuid', v_project);
  END IF;

  IF to_regclass('public.documents') IS NOT NULL
     AND pg_temp.hh_e2e_col('documents', 'project_id') THEN
    EXECUTE format('DELETE FROM public.documents WHERE project_id = %L::uuid', v_project);
  END IF;

  IF to_regclass('public.project_tasks') IS NOT NULL
     AND pg_temp.hh_e2e_col('project_tasks', 'project_id') THEN
    EXECUTE format('DELETE FROM public.project_tasks WHERE project_id = %L::uuid', v_project);
  END IF;

  IF to_regclass('public.project_subcontractors') IS NOT NULL
     AND pg_temp.hh_e2e_col('project_subcontractors', 'project_id') THEN
    EXECUTE format('DELETE FROM public.project_subcontractors WHERE project_id = %L::uuid', v_project);
  END IF;

  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE format('DELETE FROM public.projects WHERE id = %L::uuid', v_project);
  END IF;

  IF to_regclass('public.workers') IS NOT NULL THEN
    EXECUTE format('DELETE FROM public.workers WHERE id = %L::uuid', v_worker);
  END IF;

  IF to_regclass('public.categories') IS NOT NULL AND pg_temp.hh_e2e_col('categories', 'name') THEN
    EXECUTE $d$DELETE FROM public.categories WHERE name LIKE '[E2E] %'$d$;
  END IF;

  IF to_regclass('public.subcontractors') IS NOT NULL THEN
    IF pg_temp.hh_e2e_col('subcontractors', 'display_name') THEN
      EXECUTE $d$DELETE FROM public.subcontractors WHERE display_name LIKE '[E2E] %'$d$;
    ELSIF pg_temp.hh_e2e_col('subcontractors', 'name') THEN
      EXECUTE $d$DELETE FROM public.subcontractors WHERE name LIKE '[E2E] %'$d$;
    END IF;
  END IF;

  -- ─── categories ───
  IF to_regclass('public.categories') IS NOT NULL AND pg_temp.hh_e2e_col('categories', 'name') THEN
    EXECUTE format('INSERT INTO public.categories (name) VALUES (%L)', '[E2E] Materials');
    EXECUTE format('INSERT INTO public.categories (name) VALUES (%L)', '[E2E] Equipment');
    EXECUTE format('INSERT INTO public.categories (name) VALUES (%L)', '[E2E] Test income');
  END IF;

  -- ─── customers (Playwright integration: list + detail link) ───
  IF to_regclass('public.customers') IS NOT NULL AND pg_temp.hh_e2e_col('customers', 'name') THEN
    EXECUTE $d$DELETE FROM public.customers WHERE id = '33333333-3333-3333-3333-333333333333'::uuid OR name = '[E2E] Test Customer'$d$;
    IF pg_temp.hh_e2e_col('customers', 'id') THEN
      EXECUTE $cust$
        INSERT INTO public.customers (id, name, email)
        VALUES (
          '33333333-3333-3333-3333-333333333333'::uuid,
          '[E2E] Test Customer',
          'e2e-customer@example.test'
        )
      $cust$;
    ELSE
      EXECUTE format(
        'INSERT INTO public.customers (name, email) VALUES (%L, %L)',
        '[E2E] Test Customer',
        'e2e-customer@example.test'
      );
    END IF;
  END IF;

  -- ─── subcontractors ───
  IF to_regclass('public.subcontractors') IS NOT NULL THEN
    IF pg_temp.hh_e2e_col('subcontractors', 'display_name') THEN
      v_cols := quote_ident('display_name');
      v_vals := quote_literal('[E2E] Test Subcontractor');
      IF pg_temp.hh_e2e_col('subcontractors', 'legal_name') THEN
        v_cols := v_cols || ', ' || quote_ident('legal_name');
        v_vals := v_vals || ', ' || quote_literal('[E2E] Test Sub LLC');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'contact_name') THEN
        v_cols := v_cols || ', ' || quote_ident('contact_name');
        v_vals := v_vals || ', ' || quote_literal('Seed Contact');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'phone') THEN
        v_cols := v_cols || ', ' || quote_ident('phone');
        v_vals := v_vals || ', ' || quote_literal('555-0100');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'email') THEN
        v_cols := v_cols || ', ' || quote_ident('email');
        v_vals := v_vals || ', ' || quote_literal('e2e-sub@example.test');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'status') THEN
        v_cols := v_cols || ', ' || quote_ident('status');
        v_vals := v_vals || ', ' || quote_literal('active');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'notes') THEN
        v_cols := v_cols || ', ' || quote_ident('notes');
        v_vals := v_vals || ', ' || quote_literal('[E2E] SEED');
      END IF;
      EXECUTE format('INSERT INTO public.subcontractors (%s) VALUES (%s)', v_cols, v_vals);
    ELSIF pg_temp.hh_e2e_col('subcontractors', 'name') THEN
      v_cols := quote_ident('name');
      v_vals := quote_literal('[E2E] Test Subcontractor');
      IF pg_temp.hh_e2e_col('subcontractors', 'phone') THEN
        v_cols := v_cols || ', ' || quote_ident('phone');
        v_vals := v_vals || ', ' || quote_literal('555-0100');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'email') THEN
        v_cols := v_cols || ', ' || quote_ident('email');
        v_vals := v_vals || ', ' || quote_literal('e2e-sub@example.test');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'active') THEN
        v_cols := v_cols || ', ' || quote_ident('active');
        v_vals := v_vals || ', true';
      ELSIF pg_temp.hh_e2e_col('subcontractors', 'status') THEN
        v_cols := v_cols || ', ' || quote_ident('status');
        v_vals := v_vals || ', ' || quote_literal('active');
      END IF;
      IF pg_temp.hh_e2e_col('subcontractors', 'address') THEN
        v_cols := v_cols || ', ' || quote_ident('address');
        v_vals := v_vals || ', ' || quote_literal('100 Seed Lane');
      END IF;
      EXECUTE format('INSERT INTO public.subcontractors (%s) VALUES (%s)', v_cols, v_vals);
    END IF;
  END IF;

  -- ─── workers (half_day_rate/role vs daily_rate/trade) ───
  IF to_regclass('public.workers') IS NOT NULL AND pg_temp.hh_e2e_col('workers', 'name') THEN
    v_sep := '';
    v_cols := '';
    v_vals := '';
    IF pg_temp.hh_e2e_col('workers', 'id') THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L::uuid', v_worker);
      v_sep := ', ';
    END IF;
    v_cols := v_cols || v_sep || quote_ident('name');
    v_vals := v_vals || v_sep || quote_literal('[E2E] Seed Worker');
    v_sep := ', ';
    IF pg_temp.hh_e2e_col('workers', 'role') THEN
      v_cols := v_cols || v_sep || quote_ident('role');
      v_vals := v_vals || v_sep || quote_literal('Carpenter');
      v_sep := ', ';
    ELSIF pg_temp.hh_e2e_col('workers', 'trade') THEN
      v_cols := v_cols || v_sep || quote_ident('trade');
      v_vals := v_vals || v_sep || quote_literal('Carpenter');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('workers', 'phone') THEN
      v_cols := v_cols || v_sep || quote_ident('phone');
      v_vals := v_vals || v_sep || quote_literal('555-0200');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('workers', 'half_day_rate') THEN
      v_cols := v_cols || v_sep || quote_ident('half_day_rate');
      v_vals := v_vals || v_sep || '100';
      v_sep := ', ';
    ELSIF pg_temp.hh_e2e_col('workers', 'daily_rate') THEN
      v_cols := v_cols || v_sep || quote_ident('daily_rate');
      v_vals := v_vals || v_sep || '200';
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('workers', 'status') THEN
      v_cols := v_cols || v_sep || quote_ident('status');
      v_vals := v_vals || v_sep || quote_literal('active');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('workers', 'notes') THEN
      v_cols := v_cols || v_sep || quote_ident('notes');
      v_vals := v_vals || v_sep || quote_literal('[E2E] SEED');
    END IF;
    EXECUTE format('INSERT INTO public.workers (%s) VALUES (%s)', v_cols, v_vals);
  END IF;

  IF to_regclass('public.labor_workers') IS NOT NULL
     AND pg_temp.hh_e2e_col('labor_workers', 'id')
     AND pg_temp.hh_e2e_col('labor_workers', 'name') THEN
    EXECUTE format(
      'INSERT INTO public.labor_workers (id, name) VALUES (%L::uuid, %L) ON CONFLICT (id) DO UPDATE SET name = excluded.name',
      v_worker,
      '[E2E] Seed Worker'
    );
  END IF;

  -- ─── projects ───
  IF to_regclass('public.projects') IS NOT NULL AND pg_temp.hh_e2e_col('projects', 'name') THEN
    v_sep := '';
    v_cols := '';
    v_vals := '';
    IF pg_temp.hh_e2e_col('projects', 'id') THEN
      v_cols := v_cols || quote_ident('id');
      v_vals := v_vals || format('%L::uuid', v_project);
      v_sep := ', ';
    END IF;
    v_cols := v_cols || v_sep || quote_ident('name');
    v_vals := v_vals || v_sep || quote_literal('[E2E] Seed — HH Unified');
    v_sep := ', ';
    IF pg_temp.hh_e2e_col('projects', 'status') THEN
      v_cols := v_cols || v_sep || quote_ident('status');
      v_vals := v_vals || v_sep || quote_literal('active');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('projects', 'budget') THEN
      v_cols := v_cols || v_sep || quote_ident('budget');
      v_vals := v_vals || v_sep || '100000';
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('projects', 'spent') THEN
      v_cols := v_cols || v_sep || quote_ident('spent');
      v_vals := v_vals || v_sep || '0';
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('projects', 'client') THEN
      v_cols := v_cols || v_sep || quote_ident('client');
      v_vals := v_vals || v_sep || quote_literal('[E2E] Client');
      v_sep := ', ';
    ELSIF pg_temp.hh_e2e_col('projects', 'client_name') THEN
      v_cols := v_cols || v_sep || quote_ident('client_name');
      v_vals := v_vals || v_sep || quote_literal('[E2E] Client');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('projects', 'address') THEN
      v_cols := v_cols || v_sep || quote_ident('address');
      v_vals := v_vals || v_sep || quote_literal('100 Seed Lane, Testville');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('projects', 'notes') THEN
      v_cols := v_cols || v_sep || quote_ident('notes');
      v_vals := v_vals || v_sep || quote_literal('[E2E] SEED — safe to delete; recreated by supabase/seed.sql');
    END IF;
    EXECUTE format('INSERT INTO public.projects (%s) VALUES (%s)', v_cols, v_vals);
    -- Link seed project to E2E customer so list/detail resolve Client when only customer_id is set.
    IF pg_temp.hh_e2e_col('projects', 'customer_id') THEN
      EXECUTE format(
        'UPDATE public.projects SET customer_id = %L::uuid WHERE id = %L::uuid',
        '33333333-3333-3333-3333-333333333333'::uuid,
        v_project
      );
    END IF;
  END IF;

  -- ─── project_subcontractors ───
  IF to_regclass('public.project_subcontractors') IS NOT NULL
     AND pg_temp.hh_e2e_col('project_subcontractors', 'project_id')
     AND pg_temp.hh_e2e_col('project_subcontractors', 'subcontractor_id') THEN
    IF pg_temp.hh_e2e_col('subcontractors', 'display_name') THEN
      v_sub_key := 'display_name';
    ELSIF pg_temp.hh_e2e_col('subcontractors', 'name') THEN
      v_sub_key := 'name';
    ELSE
      v_sub_key := NULL;
    END IF;
    IF v_sub_key IS NOT NULL AND to_regclass('public.subcontractors') IS NOT NULL THEN
      v_sql := format(
        'INSERT INTO public.project_subcontractors (project_id, subcontractor_id, role)
         SELECT %L::uuid, s.id, %L FROM public.subcontractors s WHERE s.%I = %L LIMIT 1
         ON CONFLICT (project_id, subcontractor_id) DO NOTHING',
        v_project,
        'General',
        v_sub_key,
        '[E2E] Test Subcontractor'
      );
      EXECUTE v_sql;
    END IF;
  END IF;

  -- ─── project_tasks ───
  IF to_regclass('public.project_tasks') IS NOT NULL
     AND pg_temp.hh_e2e_col('project_tasks', 'project_id')
     AND pg_temp.hh_e2e_col('project_tasks', 'title')
     AND pg_temp.hh_e2e_col('project_tasks', 'status')
     AND pg_temp.hh_e2e_col('project_tasks', 'priority') THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_tasks'
        AND column_name = 'is_test'
    ) INTO v_has_tasks_is_test;

    IF v_has_tasks_is_test AND pg_temp.hh_e2e_col('project_tasks', 'description') THEN
      EXECUTE format(
        $t$INSERT INTO public.project_tasks (project_id, title, description, status, priority, is_test) VALUES
        (%L::uuid, %L, %L, %L, %L, true),
        (%L::uuid, %L, %L, %L, %L, true)$t$,
        v_project,
        '[E2E] Task — setup',
        '[E2E] Seeded for manual QA',
        'todo',
        'medium',
        v_project,
        '[E2E] Task — in progress',
        'Seeded row',
        'in_progress',
        'high'
      );
    ELSIF v_has_tasks_is_test THEN
      EXECUTE format(
        $t$INSERT INTO public.project_tasks (project_id, title, status, priority, is_test) VALUES
        (%L::uuid, %L, %L, %L, true),
        (%L::uuid, %L, %L, %L, true)$t$,
        v_project,
        '[E2E] Task — setup',
        'todo',
        'medium',
        v_project,
        '[E2E] Task — in progress',
        'in_progress',
        'high'
      );
    ELSIF pg_temp.hh_e2e_col('project_tasks', 'description') THEN
      EXECUTE format(
        $t$INSERT INTO public.project_tasks (project_id, title, description, status, priority) VALUES
        (%L::uuid, %L, %L, %L, %L),
        (%L::uuid, %L, %L, %L, %L)$t$,
        v_project,
        '[E2E] Task — setup',
        '[E2E] Seeded for manual QA',
        'todo',
        'medium',
        v_project,
        '[E2E] Task — in progress',
        'Seeded row',
        'in_progress',
        'high'
      );
    ELSE
      EXECUTE format(
        $t$INSERT INTO public.project_tasks (project_id, title, status, priority) VALUES
        (%L::uuid, %L, %L, %L),
        (%L::uuid, %L, %L, %L)$t$,
        v_project,
        '[E2E] Task — setup',
        'todo',
        'medium',
        v_project,
        '[E2E] Task — in progress',
        'in_progress',
        'high'
      );
    END IF;
  END IF;

  -- ─── documents (only columns that exist) ───
  IF to_regclass('public.documents') IS NOT NULL
     AND pg_temp.hh_e2e_col('documents', 'file_name')
     AND pg_temp.hh_e2e_col('documents', 'file_path') THEN
    v_sep := '';
    v_cols := '';
    v_vals := '';
    v_cols := quote_ident('file_name');
    v_vals := quote_literal('[E2E] seed-readme.txt');
    v_sep := ', ';
    v_cols := v_cols || v_sep || quote_ident('file_path');
    v_vals := v_vals || v_sep || quote_literal('e2e-seed/placeholder.txt');
    v_sep := ', ';
    IF pg_temp.hh_e2e_col('documents', 'file_type') THEN
      v_cols := v_cols || v_sep || quote_ident('file_type');
      v_vals := v_vals || v_sep || quote_literal('Other');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'mime_type') THEN
      v_cols := v_cols || v_sep || quote_ident('mime_type');
      v_vals := v_vals || v_sep || quote_literal('text/plain');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'size_bytes') THEN
      v_cols := v_cols || v_sep || quote_ident('size_bytes');
      v_vals := v_vals || v_sep || '42';
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'project_id') THEN
      v_cols := v_cols || v_sep || quote_ident('project_id');
      v_vals := v_vals || v_sep || format('%L::uuid', v_project);
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'related_module') THEN
      v_cols := v_cols || v_sep || quote_ident('related_module');
      v_vals := v_vals || v_sep || quote_literal('e2e_seed');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'uploaded_by') THEN
      v_cols := v_cols || v_sep || quote_ident('uploaded_by');
      v_vals := v_vals || v_sep || quote_literal('e2e_seed');
    END IF;
    IF pg_temp.hh_e2e_col('documents', 'notes') THEN
      v_cols := v_cols || ', ' || quote_ident('notes');
      v_vals := v_vals || ', ' || quote_literal('[E2E] SEED');
    END IF;
    EXECUTE format('INSERT INTO public.documents (%s) VALUES (%s)', v_cols, v_vals);
  END IF;

  -- ─── site_photos ───
  IF to_regclass('public.site_photos') IS NOT NULL
     AND pg_temp.hh_e2e_col('site_photos', 'project_id')
     AND pg_temp.hh_e2e_col('site_photos', 'photo_url') THEN
    v_sep := '';
    v_cols := '';
    v_vals := '';
    v_cols := quote_ident('project_id');
    v_vals := format('%L::uuid', v_project);
    v_sep := ', ';
    v_cols := v_cols || v_sep || quote_ident('photo_url');
    v_vals := v_vals || v_sep || quote_literal('https://picsum.photos/seed/hh-e2e/800/600');
    v_sep := ', ';
    IF pg_temp.hh_e2e_col('site_photos', 'description') THEN
      v_cols := v_cols || v_sep || quote_ident('description');
      v_vals := v_vals || v_sep || quote_literal('[E2E] Seeded site photo');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('site_photos', 'tags') THEN
      v_cols := v_cols || v_sep || quote_ident('tags');
      v_vals := v_vals || v_sep || quote_literal('e2e,seed');
      v_sep := ', ';
    END IF;
    IF pg_temp.hh_e2e_col('site_photos', 'uploaded_by') THEN
      v_cols := v_cols || v_sep || quote_ident('uploaded_by');
      v_vals := v_vals || v_sep || quote_literal('e2e_seed');
    END IF;
    EXECUTE format('INSERT INTO public.site_photos (%s) VALUES (%s)', v_cols, v_vals);
  END IF;

  -- ─── labor_entries ───
  IF to_regclass('public.labor_entries') IS NOT NULL THEN
    SELECT pg_temp.hh_e2e_col('labor_entries', 'project_id')
      AND (
        pg_temp.hh_e2e_col('labor_entries', 'work_date')
        OR pg_temp.hh_e2e_col('labor_entries', 'entry_date')
      )
    INTO v_has_modern_labor;

    v_date_col := NULL;
    IF pg_temp.hh_e2e_col('labor_entries', 'work_date') THEN
      v_date_col := 'work_date';
    ELSIF pg_temp.hh_e2e_col('labor_entries', 'entry_date') THEN
      v_date_col := 'entry_date';
    END IF;

    IF v_has_modern_labor AND v_date_col IS NOT NULL THEN
      IF pg_temp.hh_e2e_col('labor_entries', 'hours')
         AND pg_temp.hh_e2e_col('labor_entries', 'morning')
         AND pg_temp.hh_e2e_col('labor_entries', 'afternoon')
         AND pg_temp.hh_e2e_col('labor_entries', 'cost_amount')
         AND pg_temp.hh_e2e_col('labor_entries', 'worker_id') THEN
        v_cols := quote_ident('worker_id');
        v_vals := format('%L::uuid', v_worker);
        v_cols := v_cols || ', ' || quote_ident('project_id');
        v_vals := v_vals || ', ' || format('%L::uuid', v_project);
        v_cols := v_cols || ', ' || quote_ident(v_date_col);
        v_vals := v_vals || ', ' || format('%L::date', CURRENT_DATE - 1);
        v_cols := v_cols || ', ' || quote_ident('hours');
        v_vals := v_vals || ', 8';
        IF pg_temp.hh_e2e_col('labor_entries', 'cost_code') THEN
          v_cols := v_cols || ', ' || quote_ident('cost_code');
          v_vals := v_vals || ', ' || quote_literal('[E2E]');
        END IF;
        IF pg_temp.hh_e2e_col('labor_entries', 'notes') THEN
          v_cols := v_cols || ', ' || quote_ident('notes');
          v_vals := v_vals || ', ' || quote_literal('[E2E] SEED');
        END IF;
        v_cols := v_cols || ', ' || quote_ident('cost_amount');
        v_vals := v_vals || ', 200';
        v_cols := v_cols || ', ' || quote_ident('morning');
        v_vals := v_vals || ', true';
        v_cols := v_cols || ', ' || quote_ident('afternoon');
        v_vals := v_vals || ', true';
        IF pg_temp.hh_e2e_col('labor_entries', 'status') THEN
          v_cols := v_cols || ', ' || quote_ident('status');
          v_vals := v_vals || ', ' || quote_literal('Draft');
        END IF;
        EXECUTE format('INSERT INTO public.labor_entries (%s) VALUES (%s)', v_cols, v_vals);
      ELSIF pg_temp.hh_e2e_col('labor_entries', 'cost_amount')
        AND pg_temp.hh_e2e_col('labor_entries', 'worker_id')
        AND pg_temp.hh_e2e_col('labor_entries', 'project_id') THEN
        v_cols := quote_ident('worker_id');
        v_vals := format('%L::uuid', v_worker);
        v_cols := v_cols || ', ' || quote_ident('project_id');
        v_vals := v_vals || ', ' || format('%L::uuid', v_project);
        v_cols := v_cols || ', ' || quote_ident(v_date_col);
        v_vals := v_vals || ', ' || format('%L::date', CURRENT_DATE - 1);
        IF pg_temp.hh_e2e_col('labor_entries', 'cost_code') THEN
          v_cols := v_cols || ', ' || quote_ident('cost_code');
          v_vals := v_vals || ', ' || quote_literal('[E2E]');
        END IF;
        IF pg_temp.hh_e2e_col('labor_entries', 'notes') THEN
          v_cols := v_cols || ', ' || quote_ident('notes');
          v_vals := v_vals || ', ' || quote_literal('[E2E] SEED');
        END IF;
        v_cols := v_cols || ', ' || quote_ident('cost_amount');
        v_vals := v_vals || ', 200';
        IF pg_temp.hh_e2e_col('labor_entries', 'status') THEN
          v_cols := v_cols || ', ' || quote_ident('status');
          v_vals := v_vals || ', ' || quote_literal('Draft');
        END IF;
        EXECUTE format('INSERT INTO public.labor_entries (%s) VALUES (%s)', v_cols, v_vals);
      ELSE
        RAISE NOTICE 'labor_entries: modern shape missing cost_amount; skipped.';
      END IF;
    ELSIF pg_temp.hh_e2e_col('labor_entries', 'work_date')
      AND pg_temp.hh_e2e_col('labor_entries', 'project_am_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'project_pm_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'worker_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'day_rate')
      AND pg_temp.hh_e2e_col('labor_entries', 'ot_amount')
      AND pg_temp.hh_e2e_col('labor_entries', 'total') THEN
      EXECUTE format(
        $l$INSERT INTO public.labor_entries (worker_id, work_date, project_am_id, project_pm_id, day_rate, ot_amount, total)
        VALUES (%L::uuid, %L::date, %L::uuid, %L::uuid, 200, 0, 200)$l$,
        v_worker,
        (CURRENT_DATE - 1),
        v_project,
        v_project
      );
    ELSIF pg_temp.hh_e2e_col('labor_entries', 'date')
      AND pg_temp.hh_e2e_col('labor_entries', 'worker_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'am_project_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'pm_project_id')
      AND pg_temp.hh_e2e_col('labor_entries', 'half_day_rate')
      AND pg_temp.hh_e2e_col('labor_entries', 'total')
      AND pg_temp.hh_e2e_col('labor_entries', 'status') THEN
      EXECUTE format(
        $l$INSERT INTO public.labor_entries (date, worker_id, am_project_id, pm_project_id, half_day_rate, total, status)
        VALUES (%L::date, %L::uuid, %L::uuid, %L::uuid, 100, 200, 'draft')$l$,
        (CURRENT_DATE - 1),
        v_worker,
        v_project,
        v_project
      );
    ELSE
      RAISE NOTICE 'labor_entries: skipped (unrecognized column set). Apply migrations or use app ensure-schema.';
    END IF;
  END IF;

  -- ─── E2E rows for Playwright delete-catalog / list surfaces (empty table → skip) ───
  -- Fixed UUIDs (non-overlapping with v_project / v_worker / E2E customer).
  IF to_regclass('public.vendors') IS NOT NULL AND pg_temp.hh_e2e_col('vendors', 'name') THEN
    EXECUTE $d$DELETE FROM public.vendors WHERE name = '[E2E] Seed Vendor'$d$;
    IF pg_temp.hh_e2e_col('vendors', 'status') THEN
      EXECUTE $d$INSERT INTO public.vendors (name, status) VALUES ('[E2E] Seed Vendor', 'active')$d$;
    ELSE
      EXECUTE $d$INSERT INTO public.vendors (name) VALUES ('[E2E] Seed Vendor')$d$;
    END IF;
  END IF;

  IF to_regclass('public.accounts') IS NOT NULL
     AND pg_temp.hh_e2e_col('accounts', 'name')
     AND pg_temp.hh_e2e_col('accounts', 'type') THEN
    EXECUTE $d$DELETE FROM public.accounts WHERE name = '[E2E] Seed Cash' OR id = '44444444-4444-4444-4444-444444444442'::uuid$d$;
    EXECUTE $d$INSERT INTO public.accounts (id, name, type) VALUES ('44444444-4444-4444-4444-444444444442'::uuid, '[E2E] Seed Cash', 'Cash')$d$;
  END IF;

  IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.expense_lines') IS NOT NULL THEN
    EXECUTE $d$DELETE FROM public.expense_lines WHERE expense_id = '44444444-4444-4444-4444-444444444441'::uuid$d$;
    EXECUTE $d$DELETE FROM public.expenses WHERE id = '44444444-4444-4444-4444-444444444441'::uuid$d$;
    IF pg_temp.hh_e2e_col('expenses', 'status') THEN
      IF pg_temp.hh_e2e_col('expenses', 'amount') THEN
        EXECUTE $d$INSERT INTO public.expenses (id, expense_date, vendor_name, payment_method, reference_no, total, line_count, status, amount)
        VALUES ('44444444-4444-4444-4444-444444444441'::uuid, CURRENT_DATE, '[E2E] Seed expense', 'Cash', 'SEED-E1', 99.5, 1, 'approved', 99.5)$d$;
      ELSE
        EXECUTE $d$INSERT INTO public.expenses (id, expense_date, vendor_name, payment_method, reference_no, total, line_count, status)
        VALUES ('44444444-4444-4444-4444-444444444441'::uuid, CURRENT_DATE, '[E2E] Seed expense', 'Cash', 'SEED-E1', 99.5, 1, 'approved')$d$;
      END IF;
    ELSIF pg_temp.hh_e2e_col('expenses', 'amount') THEN
      EXECUTE $d$INSERT INTO public.expenses (id, expense_date, vendor_name, payment_method, reference_no, total, line_count, amount)
      VALUES ('44444444-4444-4444-4444-444444444441'::uuid, CURRENT_DATE, '[E2E] Seed expense', 'Cash', 'SEED-E1', 99.5, 1, 99.5)$d$;
    ELSE
      EXECUTE $d$INSERT INTO public.expenses (id, expense_date, vendor_name, payment_method, reference_no, total, line_count)
      VALUES ('44444444-4444-4444-4444-444444444441'::uuid, CURRENT_DATE, '[E2E] Seed expense', 'Cash', 'SEED-E1', 99.5, 1)$d$;
    END IF;
    IF pg_temp.hh_e2e_col('expense_lines', 'project_id') THEN
      EXECUTE format(
        $d$INSERT INTO public.expense_lines (expense_id, project_id, amount) VALUES ('44444444-4444-4444-4444-444444444441'::uuid, %L::uuid, 99.5)$d$,
        v_project
      );
    ELSE
      EXECUTE $d$INSERT INTO public.expense_lines (expense_id, amount) VALUES ('44444444-4444-4444-4444-444444444441'::uuid, 99.5)$d$;
    END IF;
  END IF;

  IF to_regclass('public.ap_bills') IS NOT NULL THEN
    EXECUTE $d$DELETE FROM public.ap_bills WHERE id = '44444444-4444-4444-4444-444444444443'::uuid$d$;
    EXECUTE format(
      $d$INSERT INTO public.ap_bills (id, vendor_name, project_id, status, amount, balance_amount, issue_date)
      VALUES ('44444444-4444-4444-4444-444444444443'::uuid, '[E2E] Seed AP bill', %L::uuid, 'Draft', 150, 150, CURRENT_DATE)$d$,
      v_project
    );
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL AND to_regclass('public.payments_received') IS NOT NULL THEN
    EXECUTE $d$DELETE FROM public.payments_received WHERE id = '44444444-4444-4444-4444-444444444448'::uuid$d$;
    EXECUTE $d$DELETE FROM public.invoice_items WHERE invoice_id = '44444444-4444-4444-4444-444444444447'::uuid$d$;
    EXECUTE $d$DELETE FROM public.invoices WHERE id = '44444444-4444-4444-4444-444444444447'::uuid$d$;
    EXECUTE format(
      $d$INSERT INTO public.invoices (id, invoice_no, project_id, customer_id, client_name, status, subtotal, tax_pct, tax_amount, total, paid_total, balance_due, issue_date, due_date)
      VALUES (
        '44444444-4444-4444-4444-444444444447'::uuid,
        '[E2E]-INV-SEED-001',
        %L::uuid,
        '33333333-3333-3333-3333-333333333333'::uuid,
        '[E2E] Test Customer',
        'Sent',
        100,
        0,
        0,
        100,
        0,
        100,
        CURRENT_DATE,
        CURRENT_DATE
      )$d$,
      v_project
    );
    EXECUTE format(
      $d$INSERT INTO public.payments_received (id, invoice_id, project_id, customer_name, payment_date, amount, payment_method)
      VALUES (
        '44444444-4444-4444-4444-444444444448'::uuid,
        '44444444-4444-4444-4444-444444444447'::uuid,
        %L::uuid,
        '[E2E] Test Customer',
        CURRENT_DATE,
        25,
        'Check'
      )$d$,
      v_project
    );
  END IF;

  IF to_regclass('public.labor_invoices') IS NOT NULL
     AND pg_temp.hh_e2e_col('labor_invoices', 'invoice_no')
     AND pg_temp.hh_e2e_col('labor_invoices', 'worker_id') THEN
    EXECUTE $d$DELETE FROM public.labor_invoices WHERE invoice_no = '[E2E]-LI-001'$d$;
    EXECUTE format(
      $d$INSERT INTO public.labor_invoices (invoice_no, worker_id, invoice_date, amount, memo, status, project_splits, checklist)
      VALUES ('[E2E]-LI-001', %L::uuid, CURRENT_DATE, 75, '[E2E] seed', 'draft', '[]'::jsonb, '{"verifiedWorker":false,"verifiedAmount":false,"verifiedAllocation":false,"verifiedAttachment":false}'::jsonb)$d$,
      v_worker
    );
  END IF;

  IF to_regclass('public.worker_reimbursements') IS NOT NULL
     AND pg_temp.hh_e2e_col('worker_reimbursements', 'worker_id') THEN
    IF pg_temp.hh_e2e_col('worker_reimbursements', 'notes') THEN
      EXECUTE $d$DELETE FROM public.worker_reimbursements WHERE notes = '[E2E] SEED reimb'$d$;
      EXECUTE format(
        $d$INSERT INTO public.worker_reimbursements (worker_id, project_id, amount, notes, reimbursement_date) VALUES (%L::uuid, %L::uuid, 42, '[E2E] SEED reimb', CURRENT_DATE)$d$,
        v_worker,
        v_project
      );
    ELSIF pg_temp.hh_e2e_col('worker_reimbursements', 'note') THEN
      EXECUTE $d$DELETE FROM public.worker_reimbursements WHERE note = '[E2E] SEED reimb'$d$;
      EXECUTE format(
        $d$INSERT INTO public.worker_reimbursements (worker_id, project_id, amount, note, reimbursement_date) VALUES (%L::uuid, %L::uuid, 42, '[E2E] SEED reimb', CURRENT_DATE)$d$,
        v_worker,
        v_project
      );
    END IF;
  END IF;

  IF to_regclass('public.worker_invoices') IS NOT NULL
     AND pg_temp.hh_e2e_col('worker_invoices', 'worker_id')
     AND pg_temp.hh_e2e_col('worker_invoices', 'amount') THEN
    EXECUTE $d$DELETE FROM public.worker_invoices WHERE id = '44444444-4444-4444-4444-444444444446'::uuid$d$;
    IF pg_temp.hh_e2e_col('worker_invoices', 'invoice_number')
       AND pg_temp.hh_e2e_col('worker_invoices', 'invoice_date') THEN
      EXECUTE format(
        $d$INSERT INTO public.worker_invoices (id, worker_id, project_id, invoice_number, invoice_date, amount, status, attachment_url) VALUES ('44444444-4444-4444-4444-444444444446'::uuid, %L::uuid, %L::uuid, '[E2E]-WI-001', CURRENT_DATE, 60, 'Unpaid', '')$d$,
        v_worker,
        v_project
      );
    ELSE
      EXECUTE format(
        $d$INSERT INTO public.worker_invoices (id, worker_id, project_id, amount, invoice_file, status) VALUES ('44444444-4444-4444-4444-444444444446'::uuid, %L::uuid, %L::uuid, 60, '', 'unpaid')$d$,
        v_worker,
        v_project
      );
    END IF;
  END IF;

  IF to_regclass('public.estimates') IS NOT NULL
     AND to_regclass('public.estimate_meta') IS NOT NULL
     AND pg_temp.hh_e2e_col('estimates', 'number') THEN
    EXECUTE $d$DELETE FROM public.estimate_meta WHERE estimate_id = '44444444-4444-4444-4444-444444444449'::uuid$d$;
    IF to_regclass('public.estimate_items') IS NOT NULL THEN
      EXECUTE $d$DELETE FROM public.estimate_items WHERE estimate_id = '44444444-4444-4444-4444-444444444449'::uuid$d$;
    END IF;
    EXECUTE $d$DELETE FROM public.estimates WHERE id = '44444444-4444-4444-4444-444444444449'::uuid$d$;
    EXECUTE $d$INSERT INTO public.estimates (id, number, client, project, status) VALUES ('44444444-4444-4444-4444-444444444449'::uuid, '[E2E]-EST-001', 'Seed Client', 'Seed Job', 'Draft')$d$;
    EXECUTE $d$INSERT INTO public.estimate_meta (estimate_id, client_name, project_name) VALUES ('44444444-4444-4444-4444-444444444449'::uuid, 'Seed Client', 'Seed Job')$d$;
  END IF;

  -- worker_payments: intentionally not seeded — payment E2E creates/deletes rows; a seed row can steal the Delete target.
END $$;

DROP FUNCTION IF EXISTS pg_temp.hh_e2e_col(text, text);

COMMIT;
