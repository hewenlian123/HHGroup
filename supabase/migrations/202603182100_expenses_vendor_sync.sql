-- Ensure expenses has both vendor and vendor_name so all code paths work.
-- Some envs have vendor (from RPC), others have vendor_name (from create_expenses); sync both.

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_name text;

-- Backfill: vendor_name from vendor where vendor_name is empty
UPDATE public.expenses
SET vendor_name = COALESCE(NULLIF(trim(vendor), ''), vendor_name, '')
WHERE (vendor_name IS NULL OR trim(vendor_name) = '') AND vendor IS NOT NULL AND trim(vendor) != '';

-- Backfill: vendor from vendor_name where vendor is empty
UPDATE public.expenses
SET vendor = COALESCE(NULLIF(trim(vendor_name), ''), vendor, '')
WHERE (vendor IS NULL OR trim(vendor) = '') AND vendor_name IS NOT NULL AND trim(vendor_name) != '';

