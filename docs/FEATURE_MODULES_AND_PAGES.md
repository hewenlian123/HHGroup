# 功能模块与页面清单

本文档按模块列出所有页面、主要功能、路由与 API，便于整体了解系统能力。数据操作多通过 Supabase 直连或 Server Actions，部分通过下列 API 路由。

---

## 一、首页与导航

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 首页重定向 | 重定向到仪表盘 | `/` | — |
| 仪表盘 | 查：总览、快捷入口 | `/dashboard` | — |
| 仪表盘-现金流 | 查：现金流视图 | `/dashboard/cashflow` | — |
| 离线页 | 离线提示/降级 | `/offline` | — |
| 设计系统 | 查：组件/样式展示 | `/design-system` | — |

---

## 二、劳工 / Labor

### 2.1 劳工总览

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 劳工首页 | 查：劳工模块入口 | `/labor` | — |

### 2.2 工人 (Workers)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工人列表 | 增、删、改、查 | `/labor/workers` | — |
| 新建工人 | 增 | `/labor/workers/new` | — |
| 工人详情 | 查、改 | `/labor/workers/[id]` | — |
| 工人对账单 | 查 | `/labor/workers/[id]/statement` | — |
| 工人对账单打印 | 查、打印 | `/labor/workers/[id]/statement/print` | — |

### 2.3 工人报销 (Reimbursements)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工人报销列表 | 增、删、改、查；Mark as Paid；批量付款 | `/labor/reimbursements` | `GET/POST /api/worker-reimbursements` |
| — | — | — | `POST /api/worker-reimbursements/[id]/pay`（标记已付） |
| — | — | — | `POST /api/worker-reimbursements/create-payment`（批量付款） |
| — | — | — | `GET /api/worker-reimbursements/ledger/[workerId]` |
| — | — | — | `GET /api/worker-reimbursements/balances` |
| — | — | — | `POST /api/worker-reimbursements/[id]/approve`（已弃用） |

### 2.4 工人收据 (Worker Receipts)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工人收据列表 | 查、审批/拒绝、重置待审 | `/labor/receipts` | `GET/POST /api/worker-receipts` |
| — | — | — | `GET/PATCH/DELETE /api/worker-receipts/[id]` |
| — | — | — | `POST /api/worker-receipts/[id]/approve` |
| — | — | — | `POST /api/worker-receipts/[id]/reject` |
| — | — | — | `POST /api/worker-receipts/[id]/reset-pending` |

### 2.5 工时 / 考勤

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 每日考勤 | 增、删、改、查 | `/labor/daily` | — |
| 工时审核 | 查、改、删（确认/清除条目） | `/labor/review` | — |
| 工时表 | 增、删、改、查（按日录入） | `/labor/timesheets` | — |
| 工时条目 | 查、改 | `/labor/entries` | — |
| 月度工时 | 查 | `/labor/monthly` | — |

### 2.6 劳工发票 (Labor Invoices)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 劳工发票列表 | 增、删、改、查、作废 | `/labor/invoices` | — |
| 新建劳工发票 | 增 | `/labor/invoices/new` | — |
| 劳工发票详情 | 查、改 | `/labor/invoices/[id]` | — |

### 2.7 工人发票 (Worker Invoices)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工人发票列表 | 增、删、改、查、标记已付/未付 | `/labor/worker-invoices` | — |

### 2.8 劳工付款 (Payments)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 劳工付款（Pay Run） | 查、增（登记付款）、删 | `/labor/payments` | — |
| 付款收据 | 查 | `/labor/payments/[id]/receipt` | — |

### 2.9 劳工成本与工资

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工资单汇总 | 查 | `/labor/payroll` | — |
| 工资汇总 | 查 | `/labor/payroll-summary` | — |
| 成本分配 | 查、改（分配逻辑） | `/labor/cost-allocation` | — |

### 2.10 分包商 (Subcontractors)（劳工下）

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 分包商列表 | 增、删、改、查 | `/labor/subcontractors` | — |
| 分包商详情 | 查、改、关联项目、附件增删 | `/labor/subcontractors/[id]` | — |

---

## 三、财务 / Financial

### 3.1 财务总览

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 财务首页 | 查：财务模块入口 | `/financial` | — |
| 财务仪表盘 | 查 | `/financial/dashboard` | — |

### 3.2 费用 (Expenses)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 费用列表 | 查、删、分页 | `/financial/expenses` | — |
| 新建费用 | 增 | `/financial/expenses/new` | — |
| 费用详情 | 查、改（抬头/行/附件）、删行、上传收据 | `/financial/expenses/[id]` | — |
| — | — | — | `GET/POST /api/ensure-expenses-migration-202604141000`（迁移检查/执行） |

### 3.3 应收 (AR / Invoices)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 应收列表 | 查 | `/financial/ar` | — |
| 发票列表 | 增、删、改、查、作废、标记已发送、登记付款 | `/financial/invoices` | — |
| 新建发票 | 增 | `/financial/invoices/new` | — |
| 发票详情 | 查、改、作废、标记已发送、登记/作废付款、打印 | `/financial/invoices/[id]` | — |
| 发票打印 | 查、打印 | `/financial/invoices/[id]/print` | — |

### 3.4 应付 / 账单 (Bills)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 账单列表（根） | 增、删、改、查 | `/bills` | — |
| 账单详情（根） | 查、改 | `/bills/[id]` | — |
| 账单编辑（根） | 改 | `/bills/[id]/edit` | — |
| 新建账单（根） | 增 | `/bills/new` | — |
| 财务-账单列表 | 查、增、删、改 | `/financial/bills` | — |
| 新建账单 | 增 | `/financial/bills/new` | — |
| 账单详情 | 查、改 | `/financial/bills/[id]` | — |

### 3.5 供应商与分类

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 供应商列表 | 增、删、改、查 | `/financial/vendors` | — |
| 分类列表（设置） | 增、删、改、查 | `/settings/categories` | — |

### 3.6 银行与账户

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 银行交易 | 查、导入 CSV、核销、关联/取消关联费用 | `/financial/bank` | — |
| 账户列表 | 增、删、改、查 | `/financial/accounts` | — |

### 3.7 其他财务

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 收款/存款 | 查、增 | `/financial/deposits` | — |
| 付款记录 | 查 | `/financial/payments` | — |
| 佣金 | 查、改、登记付款 | `/financial/commissions` | — |
| 报销（财务视角） | 查、标记已报销 | `/financial/reimbursements` | — |
| 财务-工人列表 | 查 | `/financial/workers` | — |

---

## 四、项目 / Projects

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 项目列表 | 增、删、改、查 | `/projects` | — |
| 新建项目 | 增 | `/projects/new` | — |
| 项目详情 | 查、改 | `/projects/[id]` | — |
| 项目-劳工 | 查、改 | `/projects/[id]/labor` | — |
| 项目-利润 | 查 | `/projects/[id]/profit` | — |
| 项目-分包 | 查、增、删、改 | `/projects/[id]/subcontracts` | — |
| 分包详情 | 查、改 | `/projects/[id]/subcontracts/[subId]` | — |
| 分包账单 | 查、增、删、改 | `/projects/[id]/subcontracts/[subId]/bills` | — |
| 变更单列表 | 查 | `/projects/[id]/change-orders`（通过 change-orders 模块） | — |
| 新建变更单 | 增 | `/projects/[id]/change-orders/new` | — |
| 变更单详情 | 查、改 | `/projects/[id]/change-orders/[coId]` | — |
| 变更单编辑 | 改 | `/projects/[id]/change-orders/[coId]/edit` | — |
| 项目-每日日志 | 查 | `/projects/daily-logs` | — |
| 项目-文档 | 查 | `/projects/documents` | — |
| 项目-进度 | 查 | `/projects/schedule` | — |
| — | — | — | `GET/POST /api/projects/[id]/tab` |
| — | — | — | `GET/POST /api/projects/[id]/commissions` |
| — | — | — | `GET/PATCH/DELETE /api/projects/[id]/commissions/[commissionId]` |
| — | — | — | `GET/POST /api/projects/[id]/commissions/[commissionId]/payments` |
| — | — | — | `GET /api/projects/[id]/materials` |
| — | — | — | `POST /api/projects/[id]/materials/generate-pdf` |
| — | — | — | `GET/POST /api/projects/[id]/closeout/punch` |
| — | — | — | `GET/POST /api/projects/[id]/closeout/completion` |
| — | — | — | `GET/POST /api/projects/[id]/closeout/warranty` |
| — | — | — | `POST /api/projects/[id]/closeout/generate-punch-pdf` |
| — | — | — | `POST /api/projects/[id]/closeout/generate-completion-pdf` |
| — | — | — | `POST /api/projects/[id]/closeout/generate-final-invoice-pdf` |

---

## 五、估算 / Estimates

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 估算列表 | 增、删、改、查 | `/estimates` | — |
| 新建估算 | 增 | `/estimates/new` | — |
| 估算详情 | 查、改 | `/estimates/[id]` | — |
| 估算预览 | 查 | `/estimates/[id]/preview` | — |
| 估算打印 | 查、打印 | `/estimates/[id]/print` | — |
| 快照列表 | 查 | `/estimates/[id]/snapshot` | — |
| 快照版本 | 查 | `/estimates/[id]/snapshot/[version]` | — |

---

## 六、变更单 / Change Orders（独立入口）

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 变更单列表 | 查 | `/change-orders` | — |

---

## 七、运营 / Operations（现场与任务）

### 7.1 任务 (Tasks)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 任务列表 | 增、删、改、查、切换完成状态 | `/tasks` | — |
| 新建任务 | 增 | `/tasks/new` | — |
| — | — | — | `GET/POST/PATCH/DELETE /api/operations/tasks` |

### 7.2 进度 (Schedule)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 进度表 | 查、改 | `/schedule` | — |
| — | — | — | `GET/POST/PATCH/DELETE /api/operations/schedule` |

### 7.3 整改清单 (Punch List)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 整改清单列表 | 增、删、改、查 | `/punch-list` | — |
| 新建整改项 | 增 | `/punch-list/new` | — |
| — | — | — | `GET/POST/PATCH/DELETE /api/operations/punch-list` |
| — | — | — | `GET /api/operations/punch-list/photo` |
| — | — | — | `POST /api/operations/punch-list/upload` |
| — | — | — | `POST /api/seed/operations`（种子数据含 punch list） |

### 7.4 现场照片 (Site Photos)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 现场照片列表 | 增、删、改、查、批量删 | `/site-photos` | — |
| 现场照片上传 | 增（上传） | `/site-photos/upload` | — |
| — | — | — | `GET/POST /api/operations/site-photos` |
| — | — | — | `GET/PATCH/DELETE /api/operations/site-photos/[id]` |
| — | — | — | `GET /api/operations/site-photos/photo` |
| — | — | — | `POST /api/operations/site-photos/upload` |

### 7.5 检查日志 (Inspection Log)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 检查日志列表 | 增、删、改、查 | `/inspection-log` | — |
| — | — | — | `GET/POST /api/operations/inspection-log` |
| — | — | — | `GET/PATCH/DELETE /api/operations/inspection-log/[id]` |

---

## 八、材料 / Materials

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 材料目录 | 增、删、改、查、上传图片 | `/materials/catalog` | — |
| — | — | — | `GET/POST /api/materials/catalog` |
| — | — | — | `GET /api/materials/catalog/photo` |
| — | — | — | `POST /api/materials/catalog/upload` |

---

## 九、采购 / Procurement

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 采购订单 | 查、增、改 | `/procurement/purchase-orders` | — |

---

## 十、客户 / Customers

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 客户列表 | 增、删、改、查 | `/customers` | — |
| 客户详情 | 查、改 | `/customers/[id]` | — |

---

## 十一、分包商（根路径）

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 分包商列表 | 查 | `/subcontractors` | — |
| 分包商详情 | 查、改 | `/subcontractors/[id]` | — |

---

## 十二、财务（Finance 路径，与 Financial 部分重叠）

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 财务首页 | 查 | `/finance` | — |
| 发票 | 查 | `/finance/invoices` | — |
| 账单 | 查 | `/finance/bills` | — |
| 费用 | 查 | `/finance/expenses` | — |
| 劳工成本 | 查 | `/finance/labor-cost` | — |
| 成本分配 | 查 | `/finance/cost-allocation` | — |

---

## 十三、估算相关 (Estimating)

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 成本编码 | 查、增、改 | `/estimating/cost-codes` | — |

---

## 十四、设置 / Settings

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 设置首页 | 查、导航 | `/settings` | — |
| 公司信息 | 查、改 | `/settings/company` | — |
| 账户 | 查、改 | `/settings/account` | — |
| 用户 | 查、改（权限等） | `/settings/users` | — |
| 权限 | 查、改 | `/settings/permissions` | — |
| 列表（分类/供应商等） | 查、增、删、改 | `/settings/lists` | — |
| 分包商 | 查、改 | `/settings/subcontractors` | — |

---

## 十五、文档 / Documents

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 文档中心 | 查、增、删 | `/documents` | — |

---

## 十六、收据上传（公共）

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 上传收据 | 上传、提交（OCR 等） | `/upload-receipt` | — |
| 收据页 | 查 | `/receipt` | — |
| — | — | — | `GET /api/upload-receipt/options` |
| — | — | — | `POST /api/upload-receipt/upload` |
| — | — | — | `POST /api/upload-receipt/submit` |
| — | — | — | `POST /api/ocr-receipt` |

---

## 十七、认证与账户

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 登录 | 登录 | `/login` | — |
| 登出 | 登出 | `/logout` | — |
| Auth 回调 | OAuth 回调 | `/auth/callback` | — |

---

## 十八、其他

| 页面名称 | 主要功能 | 路由 (URL) | API 路由 |
|----------|----------|------------|----------|
| 工人（根） | 查 | `/workers` | — |
| 业主 | 查 | `/owner` | — |
| — | — | — | `POST /api/ensure-schema`（确保 DB 表存在） |
| — | — | — | `POST /api/seed-workers`（种子工人数据） |

---

## 说明

- **增删改查**：指该页面上可直接进行的列表/表单级操作；不少页面通过 Supabase 客户端或 Server Actions 直接写库，未单独列出 API。
- **路由**：基于 `src/app` 下 `page.tsx` 的文件路径；`[id]`、`[coId]` 等为动态段。
- **API 路由**：仅列出 `src/app/api` 下存在的 `route.ts`；同一路径的 `GET/POST/PATCH/DELETE` 以方法前缀区分。
- 若同一业务既有 `/financial/*` 又有 `/finance/*` 或既有 `/labor/subcontractors` 又有 `/subcontractors`，可能是多入口或历史路径，以实际菜单/链接为准。
