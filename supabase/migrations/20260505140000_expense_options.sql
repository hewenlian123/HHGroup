-- Unified dropdown options for expenses (methods, accounts, sources, categories).

CREATE TABLE IF NOT EXISTS public.expense_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL
    CHECK (type IN ('payment_method', 'payment_account', 'payment_source', 'category')),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, key)
);

CREATE INDEX IF NOT EXISTS expense_options_type_active_sort_idx
  ON public.expense_options (type, active, sort_order, name);

DROP TRIGGER IF EXISTS trg_expense_options_updated_at ON public.expense_options;
CREATE TRIGGER trg_expense_options_updated_at
  BEFORE UPDATE ON public.expense_options
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS expense_options_one_default_per_type_idx
  ON public.expense_options (type)
  WHERE is_default = true;

COMMENT ON TABLE public.expense_options IS 'Configurable expense dropdowns; key is stable (category id, account uuid, source_type value, or slug).';

ALTER TABLE public.expense_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_options_select_all ON public.expense_options;
CREATE POLICY expense_options_select_all
  ON public.expense_options FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS expense_options_insert_all ON public.expense_options;
CREATE POLICY expense_options_insert_all
  ON public.expense_options FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS expense_options_update_all ON public.expense_options;
CREATE POLICY expense_options_update_all
  ON public.expense_options FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Allow bank_import as payment source (dropdown-only; stored on expenses.source_type).
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_source_type_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN ('company', 'reimbursement', 'receipt_upload', 'bank_import')
  );

COMMENT ON COLUMN public.expenses.source_type IS 'company | reimbursement | receipt_upload | bank_import';

-- ── Seed categories from existing expense categories (skip if legacy table missing).
DO $seed_categories$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
    SELECT
      'category',
      c.id::text,
      trim(c.name),
      COALESCE(c.status, 'active') = 'active',
      false,
      false,
      row_number() OVER (ORDER BY trim(c.name))
    FROM public.categories c
    WHERE c.type = 'expense'
      AND trim(c.name) <> ''
    ON CONFLICT (type, key) DO NOTHING;
  END IF;
END $seed_categories$;

INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
SELECT v.type, v.key, v.name, v.active, v.is_default, v.is_system, v.sort_order
FROM (
  VALUES
    ('category'::text, 'seed_materials'::text, 'Materials'::text, true, false, false, 10),
    ('category', 'seed_labor', 'Labor', true, false, false, 20),
    ('category', 'seed_equipment', 'Equipment', true, false, false, 30),
    ('category', 'seed_permit', 'Permit', true, false, false, 40),
    ('category', 'seed_fuel', 'Fuel', true, false, false, 50),
    ('category', 'seed_vehicle', 'Vehicle', true, false, false, 60),
    ('category', 'seed_meals', 'Meals', true, false, false, 70),
    ('category', 'seed_office', 'Office', true, false, false, 80),
    ('category', 'seed_subcontractor', 'Subcontractor', true, false, false, 90),
    ('category', 'seed_other', 'Other', true, false, false, 100)
) AS v(type, key, name, active, is_default, is_system, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_options WHERE type = 'category')
ON CONFLICT (type, key) DO NOTHING;

-- ── Payment methods: copy legacy rows if table exists; canonical seeds follow.
DO $seed_payment_methods$
BEGIN
  IF to_regclass('public.payment_methods') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'payment_methods'
        AND column_name = 'status'
    ) THEN
      INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
      SELECT
        'payment_method',
        lower(regexp_replace(trim(pm.name), '[^a-zA-Z0-9]+', '_', 'g')),
        trim(pm.name),
        COALESCE(pm.status, 'active') = 'active',
        false,
        false,
        100 + row_number() OVER (ORDER BY trim(pm.name))
      FROM public.payment_methods pm
      WHERE trim(pm.name) <> ''
      ON CONFLICT (type, key) DO NOTHING;
    ELSE
      INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
      SELECT
        'payment_method',
        lower(regexp_replace(trim(pm.name), '[^a-zA-Z0-9]+', '_', 'g')),
        trim(pm.name),
        true,
        false,
        false,
        100 + row_number() OVER (ORDER BY trim(pm.name))
      FROM public.payment_methods pm
      WHERE trim(pm.name) <> ''
      ON CONFLICT (type, key) DO NOTHING;
    END IF;
  END IF;
END $seed_payment_methods$;

INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
VALUES
  ('payment_method', 'amex', 'Amex', true, false, false, 1),
  ('payment_method', 'visa', 'Visa', true, false, false, 2),
  ('payment_method', 'cash', 'Cash', true, false, false, 3),
  ('payment_method', 'company', 'Company', true, false, false, 4)
ON CONFLICT (type, key) DO NOTHING;

-- ── Payment accounts: seed labels + mirror into expense_options when table exists.
DO $seed_payment_accounts$
BEGIN
  IF to_regclass('public.payment_accounts') IS NOT NULL THEN
    INSERT INTO public.payment_accounts (name, type)
    VALUES
      ('Visa', 'card'),
      ('Company', 'bank')
    ON CONFLICT (name) DO NOTHING;

    INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
    SELECT
      'payment_account',
      pa.id::text,
      trim(pa.name),
      true,
      false,
      false,
      row_number() OVER (ORDER BY trim(pa.name))
    FROM public.payment_accounts pa
    WHERE trim(pa.name) <> ''
    ON CONFLICT (type, key) DO NOTHING;
  END IF;
END $seed_payment_accounts$;

-- ── Payment sources (keys match expenses.source_type).
INSERT INTO public.expense_options (type, key, name, active, is_default, is_system, sort_order)
VALUES
  ('payment_source', 'company', 'Manual', true, true, true, 1),
  ('payment_source', 'receipt_upload', 'Receipt upload', true, false, true, 2),
  ('payment_source', 'reimbursement', 'Worker reimbursement', true, false, true, 3),
  ('payment_source', 'bank_import', 'Bank import', true, false, true, 4)
ON CONFLICT (type, key) DO UPDATE
SET name = EXCLUDED.name,
    is_system = EXCLUDED.is_system;
