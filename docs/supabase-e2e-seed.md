# Supabase 测试环境种子数据（E2E / Staging）

## 原则

- **绝不在生产 Supabase 项目执行** 下面的 SQL。
- 使用 **单独的 Staging / Dev 项目**（Dashboard URL 与生产不同）。
- 种子脚本可 **重复执行**：会先按固定 UUID / `[E2E]` 前缀删掉上一轮种子，再插入。

## 脚本位置（Supabase CLI 官方）

- **`supabase/seed.sql`** — 由 `supabase db reset --local` 与 `supabase db execute --file ...` 使用（见 `supabase/config.toml` → `[db.seed]`）。

## 覆盖的数据

| 表                                       | 说明                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| `categories`                             | `[E2E] Materials` / `[E2E] Equipment` / `[E2E] Test income`     |
| `subcontractors`                         | `[E2E] Test Subcontractor`（可选写入 `project_subcontractors`） |
| `project_tasks`                          | 两条任务，`is_test = true`（若列存在）                          |
| `documents`                              | 一条元数据（`notes = E2E_SEED`，无实际上传文件）                |
| `labor_entries`                          | 一条与种子项目/工人关联的工时（按当前库列自动选插入形态）       |
| `site_photos`                            | 一条占位图 URL（picsum）                                        |
| `projects` / `workers` / `labor_workers` | 支撑上述外键的固定种子行                                        |

固定 ID（便于清理）：

- Project: `11111111-1111-1111-1111-111111111111`
- Worker: `22222222-2222-2222-2222-222222222222`

项目名称：`E2E Seed — HH Unified`

## 本地（CLI）

```bash
# 需已安装 Supabase CLI；首次：`brew install supabase/tap/supabase`
npm run db:seed
# 等价：在仓库根目录执行 `supabase db reset --local`（迁移 + seed.sql）
```

## 远程 Staging（CLI）

在 `.env.local` 设置 `SUPABASE_PROJECT_REF=<staging 项目 ref>`，并先 `supabase login`（或设置 `SUPABASE_ACCESS_TOKEN`）：

```bash
export SUPABASE_PROJECT_REF=your-staging-ref   # 或写入 .env.local 后自行 export
npm run db:seed:remote
```

## 执行步骤（Dashboard 粘贴，可选）

1. 打开 **Staging** 项目 → **SQL Editor**。
2. 再次确认浏览器地址栏是 staging 项目。
3. 将 **`supabase/seed.sql` 全文**粘贴并运行。

可选：在脚本顶部取消注释 `app.allow_e2e_seed` 检查块后，需先在会话中执行：

```sql
SET app.allow_e2e_seed = 'true';
```

再运行其余内容（防止误在生产执行）。

## 本地用 `psql`（可选）

仅当 `DATABASE_URL` / `SUPABASE_DATABASE_URL` 指向 **staging** 数据库时：

```bash
export ALLOW_E2E_SEED=1   # 人为确认
psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

## CI（GitHub Actions）

工作流在 E2E 前会执行（**仅当你配置了以下 secrets，且指向 staging**）：

- `SUPABASE_PROJECT_REF` — 项目 ref
- `SUPABASE_ACCESS_TOKEN` — [Supabase CLI 访问令牌](https://supabase.com/docs/guides/cli/getting-started)（用于 `db execute`）

## 仅删除种子（不重新插入）

在 **同一 staging 项目** 执行：

```sql
BEGIN;

DELETE FROM public.labor_entries
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
   OR worker_id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM public.site_photos WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid;
DELETE FROM public.documents WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid OR notes = 'E2E_SEED';
DELETE FROM public.project_tasks WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid;

DELETE FROM public.project_subcontractors WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid;

DELETE FROM public.projects WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;
DELETE FROM public.workers WHERE id = '22222222-2222-2222-2222-222222222222'::uuid;

DELETE FROM public.categories WHERE name LIKE '[E2E] %';
DELETE FROM public.subcontractors WHERE display_name LIKE '[E2E] %';

COMMIT;
```

## 与 Playwright 的关系

种子项目会出现在项目列表；`project_tasks.is_test = true` 的任务可被 `DELETE FROM project_tasks WHERE is_test = true` 类脚本清理（见迁移 `202604151000_project_tasks_is_test.sql`）。

## `labor_entries` 未插入时的排查

若日志出现 `labor_entries: skipped` 或 `unrecognized column set`，说明当前库结构与最新应用不一致。请在 **staging** 上先执行仓库内 `supabase/migrations` 的迁移（例如 `npm run db:migrate` / `supabase db push`），再重新跑种子脚本。
