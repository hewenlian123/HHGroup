-- Case-insensitive unique name among active expense categories.
-- Skip when public.categories is absent (some remotes never had this table).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'categories'
  ) THEN
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS categories_expense_active_lower_name_uidx
        ON public.categories (lower(btrim(name)))
        WHERE type = 'expense'
          AND status = 'active'
    $idx$;
  END IF;
END $$;
