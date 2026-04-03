-- Allow both anon and authenticated PostgREST roles (JWT) to use commission tables.

DROP POLICY IF EXISTS commissions_all_anon ON public.commissions;
CREATE POLICY commissions_all_anon ON public.commissions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS commission_payments_all_anon ON public.commission_payments;
CREATE POLICY commission_payments_all_anon ON public.commission_payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
