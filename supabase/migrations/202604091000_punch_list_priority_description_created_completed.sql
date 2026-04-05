-- Punch list: add priority, description, created_by, completed_at.
-- Normalize status to open | assigned | completed.

DO $$
BEGIN
  IF to_regclass('public.punch_list') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS description text NULL;
  ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium';
  ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS created_by text NULL;
  ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

  UPDATE public.punch_list SET description = notes WHERE description IS NULL AND notes IS NOT NULL;

  UPDATE public.punch_list SET status = 'assigned' WHERE status = 'in_progress';
  UPDATE public.punch_list SET status = 'completed' WHERE status = 'resolved';

  COMMENT ON COLUMN public.punch_list.priority IS 'Low, Medium, High, Urgent';
  COMMENT ON COLUMN public.punch_list.description IS 'Detailed description of the issue';
  COMMENT ON COLUMN public.punch_list.completed_at IS 'When the issue was marked completed';
END $$;
