# Claude / AI — HH Unified Web

**Project rules (including database schema verification) are defined in [CURSOR_RULES.md](./CURSOR_RULES.md).** Read that file before changing Supabase queries or migrations.

### Database queries — summary

- Never assume column names exist.
- Before adding or modifying a query, run:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'your_table_name'
ORDER BY ordinal_position;
```

- Implement queries only after confirming columns in the result.
