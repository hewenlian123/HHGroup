#!/usr/bin/env bash
# One-off / CI: remove schema_migrations rows for filenames that were renamed in-repo
# (see .github/workflows/ci.yml "Repair migration history"). Requires supabase CLI.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://...'
#   bash scripts/supabase-repair-renamed-migration-history.sh

set -euo pipefail
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL (postgres URI with sslmode=require)." >&2
  exit 1
fi

exec supabase migration repair --status reverted --yes \
  202603260000 202603290000 202603310000 202604020000 \
  202604081200 202604081300 202604081400 202604081500 202604081600 \
  202604111000 202604181000 \
  --db-url "$SUPABASE_DB_URL"
