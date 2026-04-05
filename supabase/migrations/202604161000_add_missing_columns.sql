-- Add missing columns for punch_list, project_change_orders, payments_received.
-- 1. punch_list.created_by (uuid, nullable, references workers.id)
-- 2. project_change_orders.approved_by (uuid, nullable, references workers.id)
-- 3. payments_received.project_id (uuid, nullable, references projects.id)
-- 4. payments_received.payment_method (text, nullable) — canonical schema has it; add if table was created without it.

DO $$
BEGIN
  IF to_regclass('public.punch_list') IS NOT NULL THEN
    ALTER TABLE public.punch_list
      ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.project_change_orders') IS NOT NULL THEN
    ALTER TABLE public.project_change_orders
      ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.payments_received') IS NOT NULL THEN
    ALTER TABLE public.payments_received
      ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;
    ALTER TABLE public.payments_received
      ADD COLUMN IF NOT EXISTS payment_method text NULL;
  END IF;
END $$;
