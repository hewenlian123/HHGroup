-- Restore the canonical one-project-per-labor-entry contract without guessing
-- historical attribution. Existing ordinary project_id values are preserved.
-- Legacy AM/PM/OT values are backfilled only when every non-null legacy project
-- column on the row identifies the same existing project.

DO $$
DECLARE
  v_column_type text;
  v_generated "char";
BEGIN
  IF to_regclass('public.labor_entries') IS NULL THEN
    RAISE EXCEPTION 'public.labor_entries must exist before project attribution repair';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod), a.attgenerated
  INTO v_column_type, v_generated
  FROM pg_attribute a
  WHERE a.attrelid = 'public.labor_entries'::regclass
    AND a.attname = 'project_id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public.labor_entries ADD COLUMN project_id uuid;
  ELSIF v_column_type <> 'uuid' THEN
    RAISE EXCEPTION 'public.labor_entries.project_id must be uuid, found %', v_column_type;
  ELSIF v_generated <> '' THEN
    -- The former COALESCE-generated column could assign a split AM/PM row to
    -- only one project. Materialize it as a writable column, clear those
    -- potentially lossy values, and rebuild only deterministic attribution.
    ALTER TABLE public.labor_entries ALTER COLUMN project_id DROP EXPRESSION;
    UPDATE public.labor_entries SET project_id = NULL;
  END IF;
END $$;

WITH legacy_candidates AS (
  SELECT le.id, kv.value::uuid AS project_id
  FROM public.labor_entries le
  CROSS JOIN LATERAL jsonb_each_text(to_jsonb(le)) AS kv(key, value)
  WHERE kv.key = ANY (
    ARRAY[
      'project_am_id',
      'project_pm_id',
      'am_project_id',
      'pm_project_id',
      'ot_project_id'
    ]
  )
    AND kv.value IS NOT NULL
    AND kv.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
deterministic_legacy_attribution AS (
  SELECT
    id,
    (array_agg(DISTINCT project_id))[1] AS project_id
  FROM legacy_candidates
  GROUP BY id
  HAVING count(DISTINCT project_id) = 1
)
UPDATE public.labor_entries le
SET project_id = deterministic.project_id
FROM deterministic_legacy_attribution deterministic
JOIN public.projects p ON p.id = deterministic.project_id
WHERE le.id = deterministic.id
  AND le.project_id IS NULL;

-- Never erase or rewrite a pre-existing direct project_id. If it is orphaned,
-- fail the migration so an owner can review the corrupt reference explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.labor_entries le
    LEFT JOIN public.projects p ON p.id = le.project_id
    WHERE le.project_id IS NOT NULL
      AND p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'labor_entries contains project_id values that do not reference public.projects';
  END IF;
END $$;

DO $$
DECLARE
  v_fk_name text;
  v_fk_target regclass;
  v_fk_delete "char";
  v_fk_parent_column text;
BEGIN
  SELECT c.conname, c.confrelid, c.confdeltype, parent_att.attname
  INTO v_fk_name, v_fk_target, v_fk_delete, v_fk_parent_column
  FROM pg_constraint c
  JOIN pg_attribute child_att
    ON child_att.attrelid = c.conrelid
   AND child_att.attnum = c.conkey[1]
  JOIN pg_attribute parent_att
    ON parent_att.attrelid = c.confrelid
   AND parent_att.attnum = c.confkey[1]
  WHERE c.contype = 'f'
    AND c.conrelid = 'public.labor_entries'::regclass
    AND array_length(c.conkey, 1) = 1
    AND child_att.attname = 'project_id'
  LIMIT 1;

  IF v_fk_name IS NULL THEN
    ALTER TABLE public.labor_entries
      ADD CONSTRAINT labor_entries_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE NO ACTION
      NOT VALID;
    v_fk_name := 'labor_entries_project_id_fkey';
  ELSIF v_fk_target <> 'public.projects'::regclass
     OR v_fk_parent_column <> 'id'
     OR v_fk_delete <> 'a' THEN
    RAISE EXCEPTION 'existing labor_entries.project_id foreign key % has an incompatible contract', v_fk_name;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.labor_entries VALIDATE CONSTRAINT %I',
    v_fk_name
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_labor_entries_project_id
  ON public.labor_entries (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_labor_entries_unattributed
  ON public.labor_entries (id)
  WHERE project_id IS NULL;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO v_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.labor_entries'::regclass
    AND c.conname = 'labor_entries_project_id_required';

  IF v_definition IS NULL THEN
    ALTER TABLE public.labor_entries
      ADD CONSTRAINT labor_entries_project_id_required
      CHECK (project_id IS NOT NULL)
      NOT VALID;
  ELSIF v_definition !~* 'CHECK \(\(project_id IS NOT NULL\)\)'
    AND v_definition !~* 'CHECK \(project_id IS NOT NULL\)' THEN
    RAISE EXCEPTION 'labor_entries_project_id_required has an incompatible definition: %', v_definition;
  END IF;

  -- NOT VALID preserves explicitly unattributed historical rows but still
  -- rejects new NULL writes. Validate immediately when no historical NULLs
  -- remain, as on a fresh database.
  IF NOT EXISTS (
    SELECT 1 FROM public.labor_entries WHERE project_id IS NULL
  ) THEN
    ALTER TABLE public.labor_entries
      VALIDATE CONSTRAINT labor_entries_project_id_required;
  END IF;
END $$;

COMMENT ON COLUMN public.labor_entries.project_id IS
  'Canonical direct project attribution for labor cost. NULL identifies a preserved historical row whose project cannot be proven; new writes must provide a valid project.';

-- The remote-schema snapshot retained these legacy RPC names after dropping
-- project_am_id/project_pm_id. Keep their accounting-period and projects.spent
-- behavior, but make the allocation source the canonical direct project and
-- cost_amount fields. Canonical profit continues to read labor_entries directly.
CREATE OR REPLACE FUNCTION public.allocate_labor_cost(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_entry public.labor_entries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_entry
  FROM public.labor_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor entry not found';
  END IF;
  IF public.is_period_locked(v_entry.work_date) THEN
    RAISE EXCEPTION 'This accounting period is locked.';
  END IF;
  IF v_entry.project_id IS NULL THEN
    RAISE EXCEPTION 'Labor entry has unresolved project attribution.';
  END IF;
  IF v_entry.cost_amount IS NULL THEN
    RAISE EXCEPTION 'Labor entry has unresolved cost amount.';
  END IF;

  UPDATE public.projects
  SET spent = coalesce(spent, 0) + v_entry.cost_amount
  WHERE id = v_entry.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor entry project not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_labor_cost(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_entry public.labor_entries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_entry
  FROM public.labor_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor entry not found';
  END IF;
  IF public.is_period_locked(v_entry.work_date) THEN
    RAISE EXCEPTION 'This accounting period is locked.';
  END IF;
  IF v_entry.project_id IS NULL THEN
    RAISE EXCEPTION 'Labor entry has unresolved project attribution.';
  END IF;
  IF v_entry.cost_amount IS NULL THEN
    RAISE EXCEPTION 'Labor entry has unresolved cost amount.';
  END IF;

  UPDATE public.projects
  SET spent = coalesce(spent, 0) - v_entry.cost_amount
  WHERE id = v_entry.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Labor entry project not found';
  END IF;
END;
$$;

-- The legacy one-argument reallocation signature cannot safely reverse an old
-- project or cost after the row has already changed. Fail explicitly instead
-- of reporting success after subtracting and adding the same current values.
CREATE OR REPLACE FUNCTION public.reallocate_labor_cost(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'Labor cost reallocation requires explicit previous attribution; update labor entry % through the canonical application write path.',
    p_entry_id;
END;
$$;

-- These state-changing RPCs are not anonymous application entry points.
-- CREATE OR REPLACE preserves historical ACLs, so close them explicitly.
REVOKE EXECUTE ON FUNCTION public.allocate_labor_cost(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_labor_cost(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reallocate_labor_cost(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.allocate_labor_cost(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_labor_cost(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reallocate_labor_cost(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
