-- Removing this RPC does not mutate Estimate business data. The preceding
-- migration is intentionally forward-only for any successfully saved values.

drop function if exists public.update_estimate_meta_atomic(uuid, jsonb);

notify pgrst, 'reload schema';
