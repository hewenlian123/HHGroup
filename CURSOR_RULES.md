# Cursor / AI development rules — HH Unified Web

## Database queries (mandatory)

For **any** change that adds or modifies **database queries** (Supabase client `.from()` / `.select()` / RPC args, raw SQL, migrations that reference columns):

1. **Do not assume column names exist.** Schema can differ between local, staging, and production.
2. **Before writing or changing the query**, confirm the table’s actual columns (against the target environment you are coding for—usually local Supabase or the linked project).

Run in the SQL editor or via MCP / `psql`:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'your_table_name'
ORDER BY ordinal_position;
```

3. Only after verified column names appear in the result, implement the `.select(...)`, filters, inserts, or RPC parameters.
4. Prefer matching **existing** patterns in the codebase (dynamic column lists, fallbacks) when the repo already handles multiple schema variants.

This avoids runtime errors such as `column ... does not exist` and PostgREST schema-cache issues.

---

_Add other project-wide rules below as needed._
