-- Direct SQL execution is intentionally disabled because a dashboard editor cannot
-- prove that it is connected to the HH Group local Docker Supabase instance.
-- Use scripts/clear-data.ts instead; it verifies the loopback CLI ports and requires
-- the exact HH_CLEAR_DATA_CONFIRM phrase for each invocation.

DO $clear_data_disabled$
BEGIN
  RAISE EXCEPTION
    'Direct clear-data SQL is disabled. Use the guarded local scripts/clear-data.ts command.';
END
$clear_data_disabled$;
