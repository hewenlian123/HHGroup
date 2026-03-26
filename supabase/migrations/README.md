# Supabase 迁移

## 数据库规范（强制）

- **所有数据库结构改动**必须通过 **migration 文件**（`supabase/migrations/` 下新的时间戳 SQL），禁止在 Supabase Dashboard 里手改表结构（DDL）。
- **禁止**依赖 SQL Editor 做结构演进；Dashboard 仅用于查询或经审批的一次性数据修复，不作为 schema 来源。
- **每次改完 schema** 必须在本地执行 **`npx supabase db reset`**（项目目录、Docker 已启动）验证迁移 + `seed.sql` 能从头跑通。
- **已提交的 migration 文件不允许再改**（不编辑、不重命名）；需要修正时 **只能新建** 一条迁移。

---

请通过 Supabase 迁移创建和更新表；除下方历史说明外，不要在 SQL Editor 里执行 DDL。

## 自动建表（推荐）

在项目根目录的 `.env.local` 中配置 **Supabase 直连数据库 URL** 后，访问任意劳工相关页面（如 `/labor`、`/labor/reimbursements`、`/labor/worker-invoices`）时，服务端会自动执行 DDL，创建缺失的 `daily_work_entries`、`worker_reimbursements`、`worker_invoices` 表（若不存在）。

- 环境变量：`SUPABASE_DATABASE_URL` 或 `DATABASE_URL`
- 取值：Supabase 控制台 → Project Settings → Database → Connection string（URI，建议用 Transaction pooler）
- 若创建后接口仍报「schema cache」，请在 Project Settings → API 中点击 **Reload schema cache** 一次。

## 使用迁移文件执行

在项目目录下使用 Supabase CLI（需已 link 到当前项目）：

```bash
supabase db push
```

执行后在 Supabase 控制台：**Project Settings** → **API** → **Schema cache** → **Reload**，重新加载 schema 缓存。

## 劳工模块相关表

迁移文件 `202603120001_create_labor_tables.sql`（或服务端自动建表逻辑）会创建：

- **daily_work_entries**（每日考勤）：id、worker_id、project_id、work_date、day_type、daily_rate、ot_hours、total_pay、notes、created_at
- **worker_reimbursements**（工人报销）：id、worker_id、project_id、amount、description、receipt_url、status、created_at
- **worker_invoices**（工人发票）：id、worker_id、project_id、amount、invoice_file、status、created_at

上述表均使用 `CREATE TABLE IF NOT EXISTS`，在存在 `workers`、`projects` 表时会自动加外键，并为 anon 角色配置 RLS 策略。
