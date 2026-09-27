-- Pin is_period_locked so the Supabase advisor no longer reports a mutable search_path.
-- The body reads accounting_periods without a schema qualifier, so the path stays public.

alter function public.is_period_locked(date) set search_path = public;
