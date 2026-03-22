# Company Profile + Logo + Header — 测试与验证清单

统一说明：**公司信息**来自 `company_profile`；**单据 Header** 由 `DocumentCompanyHeader` + `fetchDocumentCompanyProfile()` 在**每次请求**时读取（无长期缓存）。修改 Settings 后，**新打开**的打印页 / PDF / API 预览应看到最新数据。

---

## 自动化（推荐先跑）

```bash
cd hh-unified-web

# 单元：DTO 映射（空字段、地址行、Logo URL）
npm run test:unit -- src/__tests__/lib/document-company-profile.test.ts

# E2E：需本地 `npm run dev` + 已配置 Supabase；至少一个项目可开 Invoice
npm run test:e2e:company-branding
```

| 脚本                        | 覆盖                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `test:e2e:company-profile`  | Settings 字段、保存、持久化、Logo 正例/反例、**503/401 时走浏览器直连 fallback**                                  |
| `test:e2e:document-header`  | 仅跑 `settings-company-profile` 中 **invoice print header**（与 Profile 串行，避免争用同一 `company_profile` 行） |
| `test:e2e:company-branding` | 等同 `test:e2e:company-profile`（打印头用例已并入该文件）                                                         |

Logo E2E 若因 Storage RLS 失败会 **skip**；强制失败可设 `E2E_BRANDING_FULL=1`（见 `tests/settings-company-profile.spec.ts`）。

---

## 一、Company Profile（手动）

| 项     | 操作                                                    |
| ------ | ------------------------------------------------------- |
| 字段   | Company Name、Phone、Email、Address（多行）、License 等 |
| 保存   | 修改任意字段 → **Save Profile** → 出现 **Saved**        |
| UI     | 保存后表单与顶部状态立即一致（乐观更新）                |
| 持久化 | **刷新**页面后值仍在                                    |

---

## 二、Logo（手动）

| 项        | 操作                                     |
| --------- | ---------------------------------------- |
| PNG / JPG | 上传成功 → 预览出现                      |
| 持久化    | **刷新** Settings 后 Logo 仍在           |
| 替换      | 再传一张 → 覆盖旧图                      |
| 删除      | **Remove Logo** → 预览消失；刷新后仍无图 |

**数据库：** 若未登录、Logo API 无 session，需已执行 `20260321140000_company_profile_anon_branding.sql`（或等价 anon 策略），否则 fallback 直连 Storage 会被 RLS 拒绝。详见 `docs/supabase-company-profile-without-db-push.md`。

---

## 三、Fallback（手动 / 已由 E2E 部分覆盖）

| 场景                                    | 期望                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| API **503**（无 service role 或不可用） | 前端自动 **浏览器直连** Storage + 更新 `company_profile` |
| API **401**（服务端无 cookie 会话）     | 同上 fallback                                            |
| 无登录 + anon 策略                      | 上传仍可成功                                             |

---

## 四、Header 集成（页面清单）

以下使用 **`fetchDocumentCompanyProfile()`** + **`DocumentCompanyHeader`**（或等价 props）：

| 区域                   | 路径 / 入口                                       |
| ---------------------- | ------------------------------------------------- |
| Invoice 打印           | `/financial/invoices/[id]/print`                  |
| Estimate 打印          | `/estimates/[id]/print`                           |
| Estimate 预览          | `/estimates/[id]/preview`                         |
| Estimate 快照          | `/estimates/[id]/snapshot`                        |
| Worker Payment Receipt | `/labor/payments/[id]/receipt` 等                 |
| Receipt 打印           | `/receipt/print/[id]`                             |
| Worker Statement 打印  | `/workers/[id]/statement/print`                   |
| 材料 PDF API           | `POST /api/projects/[id]/materials/generate-pdf`  |
| Receipt 预览 API       | `/api/labor/worker-payments/[id]/receipt-preview` |

**左侧应显示（有则显示，无则不占假占位）：**

- Logo（`logo_url` 存在时）
- Company Name
- 地址行（`addressLines`，空行已压缩）
- Phone / Email（非空才渲染）
- Website、License（同上）

**验证同步：** 在 Settings 改 **公司名或 Logo** → 新开或刷新上述任一单据视图 → 应显示**最新**信息。

---

## 五、PDF / 打印（手动）

| 项                    | 检查                                               |
| --------------------- | -------------------------------------------------- |
| 浏览器打印 / 导出 PDF | Header 含 Logo（若有）+ 公司信息                   |
| 布局                  | 单页起始区域不被截断；Logo `object-contain` 不变形 |
| 与屏幕一致            | 打印样式与 `print:` 类一致                         |

（具体「下载 PDF」按钮因页面而异：Invoice/Estimate/Receipt 各自入口需在 UI 中点一次验证。）

---

## 六、异常与边界（手动）

| 场景            | 期望                                    |
| --------------- | --------------------------------------- |
| 无 Logo         | 不渲染 Logo `<img>`，**不留空白占位块** |
| 电话/邮箱等为空 | 对应行不出现，**不破坏**左侧排版        |
| 无效邮箱        | Save 前校验，**Saved** 不出现           |

---

## 七、通过标准（汇总）

- [ ] Settings **Company Profile** 保存与刷新一致
- [ ] Logo 上传 / 替换 / 删除稳定
- [ ] Logo API 异常时 **fallback** 仍可用（含 anon SQL）
- [ ] **Invoice**（及你业务常用的 Estimate / Receipt）**打印或预览** Header 与公司资料一致
- [ ] 改一次资料 → **新打开**单据即更新

组件测试锚点（E2E / 调试）：`data-testid="document-company-header"`、`document-company-name`、`document-company-logo`（仅在有 Logo 时存在）。

---

## 排错：单据有公司文字但没有 Logo

1. **多行 `company_profile`**  
   应用会按 **`updated_at` 降序** 取**最新一行**作为当前公司资料（旧逻辑曾按 `created_at` 升序取最旧一行，易导致「Settings 里上传了 Logo，单据仍读旧行」）。若库里仍有多条历史行，可在 Supabase 中合并或删除多余行，只保留一条。

2. **仅有 `logo_path`、无 `logo_url`**  
   服务端 `fetchDocumentCompanyProfile()` 会用 `logo_path` **推导公开 URL** 补全，避免单据 Header 丢图。

3. **确认 Storage**  
   `branding` 桶中存在对应文件，且 `logo_path` 与实际上传路径一致（默认 `company/logo.<ext>`）。

4. **保存后又变回「HH Group」**  
   多为保存成功后立刻 `loadProfile` + `ensureCompanyProfile` 误判「无行」再 **INSERT** 默认行。已在 Settings 页对本次保存/换 Logo 跳过 **下一次** 同步重载，并在 `ensureCompanyProfile` 对 **唯一约束冲突** 做重试读取；仍异常时请确认 RLS 对当前角色可 **SELECT** `company_profile`。
