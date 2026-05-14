#!/usr/bin/env bash
# Verify worker_payments exists and policies are present (read-only).
# Usage:
#   export SUPABASE_DATABASE_URL='...'
#   ./scripts/verify-worker-payments-schema.sh

set -euo pipefail

URL="${SUPABASE_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "error: set SUPABASE_DATABASE_URL or DATABASE_URL." >&2
  exit 1
fi

psql "$URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'worker_payments';

SELECT policyname, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'worker_payments'
ORDER BY policyname;
SQL
