-- Punch list: add priority, description, created_by, completed_at.
-- Normalize status to open | assigned | completed.

ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS description text NULL;
ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'Medium';
ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS created_by text NULL;
ALTER TABLE public.punch_list ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Backfill description from notes if description is null
UPDATE public.punch_list SET description = notes WHERE description IS NULL AND notes IS NOT NULL;

-- Normalize status: in_progress -> assigned, resolved -> completed
UPDATE public.punch_list SET status = 'assigned' WHERE status = 'in_progress';
UPDATE public.punch_list SET status = 'completed' WHERE status = 'resolved';

COMMENT ON COLUMN public.punch_list.priority IS 'Low, Medium, High, Urgent';
COMMENT ON COLUMN public.punch_list.description IS 'Detailed description of the issue';
COMMENT ON COLUMN public.punch_list.completed_at IS 'When the issue was marked completed';
