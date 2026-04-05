-- Link punch list issues to site photos (optional).
DO $$
BEGIN
  IF to_regclass('public.punch_list') IS NULL OR to_regclass('public.site_photos') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.punch_list
    ADD COLUMN IF NOT EXISTS photo_id uuid NULL REFERENCES public.site_photos(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_punch_list_photo_id ON public.punch_list (photo_id);
  COMMENT ON COLUMN public.punch_list.photo_id IS 'Optional link to site_photos when issue was created from a photo';
END $$;
