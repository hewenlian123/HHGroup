-- One-off cleanup for duplicate integration-test workers (Flow2 Worker (Integration Test)).
-- Local Supabase example:
--   docker exec supabase_db_hh-unified-web psql -U postgres -d postgres -f - < scripts/cleanup-flow2-integration-test-workers.sql
-- Or:
--   docker exec supabase_db_hh-unified-web psql -U postgres -d postgres -c "
--   DELETE FROM workers WHERE name ILIKE '%Flow2%' OR name ILIKE '%Integration Test%';
--   DELETE FROM labor_workers WHERE name ILIKE '%Flow2%' OR name ILIKE '%Integration Test%';
--   "

DELETE FROM labor_workers WHERE name ILIKE '%Flow2%' OR name ILIKE '%Integration Test%';
DELETE FROM workers WHERE name ILIKE '%Flow2%' OR name ILIKE '%Integration Test%';
