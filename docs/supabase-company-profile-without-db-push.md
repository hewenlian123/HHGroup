# Company Profile + Logo 落地指南（不跑 `db push` / 不修 migration history）

本方案 **不依赖** `public.role_permissions`，与 `202602280007` 是否已应用无关。

---

## 一、在 Supabase 执行 SQL（必做）

1. 打开 **Supabase Dashboard** → **SQL Editor** → **New query**。
2. 将本地文件 **全文复制** 粘贴进去并 **Run**：

   `supabase/migrations/20260321120000_company_profile_auth_open.sql`

   （仓库根目录下的相对路径：`hh-unified-web/supabase/migrations/20260321120000_company_profile_auth_open.sql`）

3. **若应用未强制 Supabase 登录**（例如 middleware 不校验会话、浏览器多为 `anon`）：再执行一次：

   `supabase/migrations/20260321140000_company_profile_anon_branding.sql`

   为 `company_profile` 与 `branding` 桶补充 **`anon`** 的读写策略，否则 Logo 会走 **401** 后浏览器直连 Storage 时仍被 RLS 拦截。

4. **（推荐）单租户只保留一行 `company_profile`**：执行

   `supabase/migrations/20260321180000_company_profile_singleton.sql`

   会删除多余行并建立唯一约束，避免「多行资料」导致保存/Logo 读错行。

5. 成功标志：
   - 无报错；若有 `notice: company_profile: table missing` 说明库里还没有 `company_profile` 表，需先建表（如执行 `202602280001_company_profile_and_branding.sql` 中建表部分）。

**本脚本会：**

- 确保 **`branding`** 存储桶存在且 **public**
- **`company_profile`**：`authenticated` 可 `select / insert / update / delete`（开放策略，适合当前阶段）
- **`storage.objects`**：`authenticated` 可对 `bucket_id = 'branding'` 做 insert/update/delete
- 重建 **`branding_select_public`**（先 `drop if exists`），便于浏览器/PDF 加载公开 Logo URL

---

## 二、部署环境变量（必做）

在 **Vercel / 服务器** 与本地 **`.env.local`** 中配置：

| 变量                            | 说明                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | 已有                                                                                                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 已有                                                                                                                         |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **必填**（生产）：Logo API `POST/DELETE /api/settings/company-logo` 使用；单据服务端读 `company_profile` 也常用 service role |

从 **Supabase → Project Settings → API → service_role** 复制（**勿**提交到 Git、勿发给前端）。

未配置 service role 时：Logo API 返回 **503 + `fallback: "client"`**，前端会改走浏览器直连 Storage（依赖上一节 RLS，含 `anon` 策略时匿名也可用）。

**会话说明：** Logo API 会依次尝试 **`Authorization: Bearer <access_token>`**（前端已自动附带）与 **SSR Cookie**。若两者都没有且仍要用服务端上传，可设 **`ALLOW_COMPANY_LOGO_SERVER_WITHOUT_SESSION=1`**（仅建议单租户/内网；生产优先用真实登录或 anon 迁移）。

---

## 三、手动验证清单

在已登录状态下打开 **`/settings/company`**：

### Company Profile

- [ ] 页面能加载当前公司资料（非空白报错）
- [ ] 修改任意字段 → **Save Profile** → 出现成功提示
- [ ] **刷新页面**后修改仍存在

### Logo

- [ ] 上传 **PNG / JPG / SVG**（≤5MB）→ 预览出现 → 成功提示
- [ ] **刷新页面**后 Logo 仍在
- [ ] **Remove Logo** → 预览消失 → 刷新后仍无 Logo
- [ ] 再次上传（替换）→ 正常

### 单据 Header（与 Settings 同源）

以下页面/导出在服务端通过 **`fetchDocumentCompanyProfile()`** 读库，**每次请求**取最新行（无长期缓存）：

- Invoice 打印：`/financial/invoices/[id]/print`
- Estimate 打印 / 预览 / 快照
- Worker Payment Receipt（页面 + 打印 + 预览 API）
- Worker Statement 打印
- 材料 PDF（如使用公司头信息）

验证：修改 **Company Name** 或 Logo → 再打开上述任一单据 **新生成/新打开** 的视图，应看到 **更新后的公司信息**。

---

## 四、自动化回归（可选）

完整清单与手动步骤见 **[`docs/company-profile-logo-header-verification.md`](company-profile-logo-header-verification.md)**。

本地 **`npm run dev`** 已启动，且环境与 Supabase 已配置时：

```bash
# 单元：表单校验（邮箱、Logo 大小/类型）
npm run test:unit -- src/__tests__/lib/company-profile-form-validation.test.ts

# 单元：单据 DTO（地址行、空字段、Logo）
npm run test:unit -- src/__tests__/lib/document-company-profile.test.ts

# E2E：Company 设置 + Logo API 503/401 fallback（无 Supabase 时会 skip）
npm run test:e2e:company-profile

# E2E：改公司名 → Invoice 打印页 Header
npm run test:e2e:document-header

# 以上 E2E 一次跑完
npm run test:e2e:company-branding
```

Logo **完整**上传用例在 Storage 未开放时可能 **skip**；配置 `branding` + service role 后可将 `E2E_BRANDING_FULL=1` 设为强制失败以验收存储。

---

## 五、当前阶段刻意不做的事

- 不执行 `supabase db push`
- 不执行 `supabase migration repair`
- 不修改远端 **migration history** 表

待历史对齐后，可将同一文件纳入正常 `db push` 流程。

---

## 六、安全说明（后续收紧）

当前 RLS 对 **`company_profile` / branding** 在 **authenticated** 维度较宽，目的是 **优先保证可用**。后续若恢复 `role_permissions` 或自定义角色表，应：

1. 收紧 `company_profile_*` / `branding_*` 策略
2. 在 **`/api/settings/company-logo`** 内增加与角色一致的校验（与 RLS 对齐）
