#!/usr/bin/env bash
# Apply ONLY scripts/sql/production-worker-payments-only.sql to production Postgres.
# Requires: psql (PostgreSQL client), SUPABASE_DATABASE_URL or DATABASE_URL.
#
# Usage:
#   export SUPABASE_DATABASE_URL='postgresql://...postgres?sslmode=require'
#   ./scripts/run-production-worker-payments-sql.sh
#
# Verify afterward:
#   ./scripts/verify-worker-payments-schema.sh
#   curl -sS https://your-app/api/schema-check

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL_FILE="$ROOT/scripts/sql/production-worker-payments-only.sql"
URL="${SUPABASE_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$URL" ]]; then
  echo "error: set SUPABASE_DATABASE_URL or DATABASE_URL (production Postgres URI)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

psql "$URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

echo "OK: applied $SQL_FILE"

echo ""
echo "Next: verify DB policies — npm run db:verify:worker-payments"
echo "Then HTTP schema-check on production:"
echo "  curl -sS \"https://<your-deployment>/api/schema-check\""
echo "Expect: {\"status\":\"ok\",\"missing\":[]}"
