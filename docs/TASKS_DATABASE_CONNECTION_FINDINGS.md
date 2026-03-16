# Tasks: Which database each operation uses

## Summary

- **GET /api/operations/tasks** (list shown in UI) uses the **Supabase JS client from `@/lib/supabase`** (anon key), created at **module load time** with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **DELETE /api/tasks/[id]** uses the **Supabase JS client from `@/lib/supabase-server`** via `getServerSupabaseAdmin()` (service_role key), with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Both use **the same URL** from `NEXT_PUBLIC_SUPABASE_URL`. There is **no second Supabase project** in code; **no code path** uses `SUPABASE_DATABASE_URL` or direct Postgres for reading/writing `project_tasks`.

---

## 1. Hardcoded Supabase URLs / connection strings

- **None found** for project-specific URLs. The only hardcoded examples are in `.env.example` and `.env.test.example` as placeholders (`https://your-project.supabase.co`).
- All runtime usage reads from env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_DATABASE_URL` / `DATABASE_URL` for **direct Postgres** (schema/DDL/scripts only, see below).

---

## 2. Second Supabase client or database connection

- **Supabase JS (REST API):**
  - **`@/lib/supabase`** – singleton `supabase` = `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`. Used by **project-tasks-db** (and thus by **GET /api/operations/tasks** via `getAllTasksWithProject()`).
  - **`@/lib/supabase-server`** – `getServerSupabase()` (anon) and `getServerSupabaseAdmin()` (service_role), both use `NEXT_PUBLIC_SUPABASE_URL`; admin uses `SUPABASE_SERVICE_ROLE_KEY`. **DELETE /api/tasks/[id]** uses **only** `getServerSupabaseAdmin()`.

- **Direct PostgreSQL:**
  - **`SUPABASE_DATABASE_URL` or `DATABASE_URL`** is used only for:
    - Schema/DDL: `ensure-construction-schema.ts`, `ensure-schema-auto-repair.ts`, `ensure-expenses-source-columns.ts`, `ensure-labor-tables.ts`, `ensure-project-tasks.ts` (scripts), and API routes like `/api/ensure-schema`, `/api/system/integrity`, `/api/system/integrity/cleanup`, `/api/schema-check`, `/api/ensure-expenses-migration-*`.
  - **None of these** are used to **read or write task rows** for the tasks list or delete. Task list and delete use **only** the Supabase JS client (see above).

So there is no second “tasks” database in the app; only one `project_tasks` table, accessed via the Supabase JS clients above.

---

## 3. SUPABASE_DATABASE_URL in .env.local

- In your `.env.local`, `SUPABASE_DATABASE_URL` is:
  - `postgresql://postgres.rzublljldebswurgdqxp:...@aws-1-us-east-2.pooler.supabase.com:6543/postgres`
- Project ref in that string: **`rzublljldebswurgdqxp`**.
- `NEXT_PUBLIC_SUPABASE_URL` in the same file is:
  - `https://rzublljldebswurgdqxp.supabase.co`
- So **both point to the same Supabase project** (`rzublljldebswurgdqxp`). The direct Postgres URL is **not** used for GET/DELETE tasks; it’s only used for schema/DDL and integrity/cleanup scripts.

---

## 4. Which connection GET vs DELETE use

| Operation | Handler | Client / source | URL | Key |
|-----------|--------|------------------|-----|-----|
| **GET /api/operations/tasks** | `src/app/api/operations/tasks/route.ts` | `getAllTasksWithProject()` → `projectTasksDb.getAllTasksWithProject()` → `client()` in `project-tasks-db.ts` → **`supabase`** from **`@/lib/supabase`** | `NEXT_PUBLIC_SUPABASE_URL` (read when **lib/supabase** is first loaded) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **DELETE /api/tasks/[id]** | `src/app/api/tasks/[id]/route.ts` | **`getServerSupabaseAdmin()`** from **`@/lib/supabase-server`** | `NEXT_PUBLIC_SUPABASE_URL` (read when the handler runs) | `SUPABASE_SERVICE_ROLE_KEY` |

So:

- **GET** uses the **anon** client from **lib/supabase**, which is created **once at module load** with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **DELETE** uses the **service_role** client from **lib/supabase-server**, built at **request time** with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

If the UI shows task IDs that don’t exist in the DB that DELETE talks to, possible causes are:

1. **Different env at module load vs at request time**  
   The process that serves GET might have loaded **lib/supabase** when a different `NEXT_PUBLIC_SUPABASE_URL` (or different env) was in effect (e.g. another .env file or build-time inlining). Then GET would use that URL, while DELETE uses the current `process.env.NEXT_PUBLIC_SUPABASE_URL` when the request runs.

2. **Caching**  
   Some layer (CDN, proxy, or Next.js) might be returning an old GET response from another deployment or env. (You already use `dynamic = "force-dynamic"` on the GET route to reduce this.)

3. **Same URL, different project keys**  
   If `NEXT_PUBLIC_SUPABASE_ANON_KEY` were from project A and `SUPABASE_SERVICE_ROLE_KEY` from project B (same URL by mistake), then anon (GET) would hit A and service_role (DELETE) would hit B. Unlikely if both keys came from the same Supabase project settings.

---

## Runtime logging added

- **GET /api/operations/tasks** now logs:  
  `[GET /api/operations/tasks] Connection: NEXT_PUBLIC_SUPABASE_URL = <value> (source: getAllTasksWithProject → lib/supabase anon client)`
- **DELETE /api/tasks/[id]** already logs:  
  `[DELETE /api/tasks/:id] Supabase client: { url: <value>, keyType: "service_role" }`

Compare these two URLs when reproducing the issue. If they differ, the GET path is using a different project (or env) than the DELETE path.
