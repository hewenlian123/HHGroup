-- Add missing columns for punch_list, project_change_orders, payments_received.
-- 1. punch_list.created_by (uuid, nullable, references workers.id)
-- 2. project_change_orders.approved_by (uuid, nullable, references workers.id)
-- 3. payments_received.project_id (uuid, nullable, references projects.id)
-- 4. payments_received.payment_method (text, nullable) — canonical schema has it; add if table was created without it.

ALTER TABLE public.punch_list
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;

ALTER TABLE public.project_change_orders
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES public.workers(id) ON DELETE SET NULL;

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.payments_received
  ADD COLUMN IF NOT EXISTS payment_method text NULL;
