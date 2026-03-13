-- Storage bucket for punch list photos (private; app uses signed URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('punch-photos', 'punch-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "punch_photos_read" ON storage.objects;
CREATE POLICY "punch_photos_read" ON storage.objects FOR SELECT USING (bucket_id = 'punch-photos');

DROP POLICY IF EXISTS "punch_photos_insert" ON storage.objects;
CREATE POLICY "punch_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'punch-photos');

DROP POLICY IF EXISTS "punch_photos_delete" ON storage.objects;
CREATE POLICY "punch_photos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'punch-photos');
