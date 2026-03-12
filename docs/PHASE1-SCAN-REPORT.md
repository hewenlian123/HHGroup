# 阶段一：全局扫描报告 — HH 工程项目管理 Web App

**扫描时间**: 基于当前代码库静态分析  
**技术栈**: Next.js 14 (App Router), React 18, Supabase, TypeScript

---

## 1. 路由与页面清单

### 1.1 侧栏模块与路由对应

| 侧栏模块 | 主路由 | 是否存在 page.tsx | 备注 |
|---------|--------|-------------------|------|
| Dashboard | `/dashboard` | ✅ | dashboard/page.tsx |
| Projects | `/projects` | ✅ | projects/page.tsx, projects/[id]/page.tsx, projects/new/page.tsx |
| Estimates | `/estimates` | ✅ | estimates/page.tsx, estimates/[id]/page.tsx, estimates/new/page.tsx |
| Invoices | `/financial/invoices` | ✅ | financial/invoices/page.tsx, [id], new, [id]/print |
| Bills | `/bills` | ✅ | bills/page.tsx, bills/[id], bills/new, bills/[id]/edit |
| Expenses | `/financial/expenses` | ✅ | financial/expenses/page.tsx, [id] |
| Labor | `/labor` | ✅ | labor/page.tsx（入口），labor/entries, daily, monthly, payroll, payroll-summary, workers, invoices, payments, cost-allocation, review, timesheets |
| Subcontractors | `/subcontractors` | ✅ | subcontractors/page.tsx, [id] |
| Cost Allocation | `/labor/cost-allocation` | ✅ | labor/cost-allocation/page.tsx |
| Documents | `/documents` | ✅ | documents/page.tsx |
| Settings | `/settings` | ✅ | settings/page.tsx → redirect /settings/company；子路由 company, account, categories, lists, users, permissions, subcontractors |

### 1.2 其他可访问路由（非侧栏直接入口）

- `/` — 根页面
- `/login`, `/logout`, `/auth/callback` — 认证
- `/dashboard/cashflow` — 现金流
- `/financial` — 财务入口
- `/financial/dashboard` — 财务仪表盘
- `/financial/ar` — 应收账款
- `/financial/bank` — 银行对账
- `/financial/bills`, `/financial/bills/[id]`, `/financial/bills/new` — **另一套 Bills 页面**（与侧栏 `/bills` 不同）
- `/financial/payments`, `/financial/vendors` — 付款/供应商
- `/labor/subcontractors`, `/labor/subcontractors/[id]` — 劳工分包（与顶层 subcontractors 不同）
- `/estimates/[id]/preview`, `/estimates/[id]/print`, `/estimates/[id]/snapshot`, `/estimates/[id]/snapshot/[version]` — 报价预览/打印/快照
- `/estimating/cost-codes` — 成本编码
- `/procurement/purchase-orders` — 采购单（占位）
- `/projects/documents`, `/projects/daily-logs`, `/projects/schedule` — 项目子入口
- `/projects/[id]/labor`, `/projects/[id]/profit`, `/projects/[id]/subcontracts`, `/projects/[id]/subcontracts/[subId]/bills` — 项目内 Labor/利润/分包/分包账单
- `/projects/[id]/change-orders/new`, `[coId]`, `[coId]/edit` — 变更单
- `/customers`, `/customers/[id]` — 客户
- `/design-system` — 设计系统
- `/owner` — Owner 视图

### 1.3 路由与死链检查

- **Bills 双入口**：侧栏为 `/bills`（ap_bills 应付款），应用内另有 `/financial/bills`（另一套账单列表/新建/详情）。两套路由均存在对应 page.tsx，非死链，但功能可能重叠，需业务上区分。
- **Subcontractors 双入口**：`/subcontractors` 与 `/labor/subcontractors` 均有列表与 [id] 页面，需确认是否为同一数据源。
- 上述列出的主路由经 `**/page.tsx` 扫描均存在，**未发现 404 死链**（仅基于文件存在性；实际 404 需运行时或 E2E 验证）。

---

## 2. 各模块现有功能清单

### Dashboard
- 项目健康表：Project, Revenue, Cost, Profit, Margin, Status（Excellent/Good/Warning/Risk）
- 摘要卡片：Outstanding Bills, Overdue Bills, Bills Due This Week, Labor Cost This Week, Expenses This Month, Project Profit Summary
- 待处理分包、Bills (AP) 区块、Financial Overview（总项目/预算/利润）、Budget usage 条、Recent Activity
- 使用数据：getDashboardStats, getProjectRiskOverview, getProjects, getCanonicalProjectProfit, getApBillsSummary, getLaborCostThisWeek, getExpensesThisMonth 等；**Recent Activity 来自 getRecentTransactions()，当前恒为 []**

### Projects
- 列表：Project Name, Client, Status, Risk, Budget, Spent, Progress, Start, End, Actions（删除）
- 筛选：All / Active / Closed；搜索（name, id, clientName）
- 新建项目（/projects/new）：name, budget, status
- 详情：Overview, Financial, Budget, Expenses, Documents, Activity, Change Orders, Labor, Subcontracts, Bills
- Financial 标签：Revenue（Budget + Approved CO）, Cost（Labor/Expenses/Subcontract）, Profit, Margin；Revenue vs Cost 图、Cost 分解图
- 删除：列表行删除 + 详情页删除，带二次确认

### Estimates
- 列表、新建、详情、预览、打印、快照
- 行项目增删改、小计/税率/总价计算（estimates-db computeSummary）
- 状态与流转（具体枚举需看 estimates-db）
- **转化为 Project**：Convert to Project Drawer（convertToProjectWithSetupAction）；**无「转化为 Invoice」功能**

### Invoices（/financial/invoices）
- 列表、新建、详情、打印
- 关联项目、支付状态、记录付款
- 发票编号等规则在 invoices-db / data 层

### Bills
- **/bills**：AP 账单列表、新建、详情、编辑、添加付款；状态 Draft/Pending/Partially Paid/Paid/Void；paid_amount/balance_amount 由 ap_bill_payments 汇总
- **/financial/bills**：另一套列表/新建/详情（可能为旧或并行模块）

### Expenses（/financial/expenses）
- 费用列表、详情、录入（金额、类别、日期、附件）、关联项目
- 费用类别/供应商在 Settings（categories, vendors）管理
- 项目 Spent 汇总通过 getExpenseTotalsByProject + getProjectDetailFinancial 计入

### Labor
- 入口页链接：Timesheet Approval（/labor/entries）, Daily Log（/labor/daily）, Payroll Summary, Cost Allocation
- 工时录入、工人/角色、时薪×工时、关联项目；labor_entries 含 status（Draft/Submitted/Approved/Locked），仅 Approved/Locked 计入成本（profit-engine 与 labor-db getLaborAllocatedByProject）
- 项目 Labor 成本：getLaborActualByProject（labor_entries + 可选 labor invoices）

### Subcontractors
- 分包商 CRUD、关联项目、分包合同与账单（subcontract_bills）、付款状态
- 项目内：/projects/[id]/subcontracts 及 [subId]/bills

### Cost Allocation（/labor/cost-allocation）
- 使用 costCodeMaster（mock-data 成本编码表）+ 数据层；成本在项目/成本编码间分配逻辑在 lib/data 与 forecast

### Documents
- 列表、上传、关联项目、预览/下载（signed URL）、删除
- 表 documents + 可选 projects(name) 关联；缺失表/列时降级返回 []，不 500

### Settings
- /settings → redirect /settings/company
- 公司信息、账户、类别、列表、用户、权限、分包商（settings/subcontractors）等

---

## 3. TODO / FIXME / console / 未处理 catch / any

### TODO / FIXME / XXX / HACK
- **无**：全库 grep 未发现 TODO、FIXME、XXX、HACK。

### console.*
- **1 处**：`src/lib/profit-engine.ts` 第 36 行，`console.warn` 仅在开发环境 `isDev` 时输出，用于 profit-engine 查询失败日志，**可保留**。

### 未处理的 catch（空 catch 或仅注释）
- **dashboard/page.tsx**：多处 `catch { }` 用于表不存在时降级（subcontracts, bills, payments, ap_bills, labor/expenses, getCanonicalProjectProfit），**属防御性处理**。
- **documents-db.ts**：`catch { return []; }` / `return null`，**防御性**。
- **sidebar.tsx, topbar.tsx, app-shell.tsx**：`catch { }` 忽略公司信息加载失败，**保留默认品牌**。
- **estimates/[id]/actions.ts**：大量 `catch { // no-op }` 或 `return { ok: false }`，错误未反馈给用户，**建议后续改为返回 error 或统一 toast**。
- **project-cash-flow-chart.tsx**：`catch { return d; }` 降级返回原数据。
- 其余 catch 均将 `e.message` 或等价信息 setState 给 UI 或 return `{ error: message }`，**已处理**。

### any 类型
- **0 处**：grep `: any\b` 与 `as any` 无匹配，**未发现显式 any**。

---

## 4. Mock / 硬编码数据检查

### 已接入真实数据的模块
- Projects, Estimates, Invoices, Bills (ap_bills), Expenses, Labor, Subcontractors, Change Orders, Documents, Dashboard 主要 KPI、公司信息等均从 Supabase 或 data 层读取。

### 硬编码 / 非实时数据
- **getRecentTransactions()**（`src/lib/data/index.ts`）：**恒返回 `[]`**，Dashboard「Recent Activity」始终为空，属于**未接入真实数据的占位**。
- **costCodeMaster**（`src/lib/mock-data.ts`）：成本编码主数据为**静态数组**（约 12 条），用于 Cost Allocation 与估算；非财务流水，可视为参考数据，非 mock 业务数据。
- **getProjectDetailFinancial** 中 `totalRevenue = fromEstimate ? totalBudget : totalBudget * 1.1`：无 estimate 时收入按 budget 的 1.1 倍**硬编码**，为业务假设，建议配置化或标注。

### 其他
- 无发现将「假数据」当作真实 Bills/Expenses/Invoices 使用；financial 数据来源为 Supabase + 各 *-db 与 data/index。

---

## 5. 数据模型与关键逻辑摘要

### 5.1 项目「Spent」与成本口径
- **projects.spent**：数据库字段，可通过 updateProject 写入；**当前未见在新增 Expense/Labor/Subcontract 时自动更新该字段**。
- **getProjectDetailFinancial**：  
  `actualCost = project.spent + laborAllocated + expenseTotalForProject`，返回的 `totalSpent` 实为该 `actualCost`。  
  即列表/详情中的「Spent」= 库中 `project.spent` + 劳工 + 费用，**不是**仅从 Bills+Expenses+Labor 实时汇总的单一口径。
- **profit-engine（getCanonicalProjectProfit）**：  
  `actualCost = laborCost + expenseCost + subcontractCost`（**不含** project.spent）。  
  即 **Dashboard 项目健康表、Project Financial 标签** 使用 canonical 口径；**项目列表/部分详情** 使用 getProjectDetailFinancial 口径，两者**不一致**。
- **建议**：统一 Spent 口径（例如全部以 profit-engine 为准，或明确 project.spent 仅作手动调整并文档化）。

### 5.2 项目列表字段与数据来源
- **clientName**：当前固定传 `null`（projects/page.tsx），列表显示「—」；Project 类型有 `client`，**未传入 rows**。
- **startDate / endDate**：同样固定 `null`，未从 `project.startDate` / `project.endDate` 传入。
- **Progress**：`progressPct = budget > 0 ? (spent / budget) * 100 : 0`，**自动计算**，spent 来自 getProjectDetailFinancial.totalSpent。
- **Risk**：由 getProjectForecastRisk 的 forecastMarginPct 与 anyCostCodeVarianceOver10Pct 计算，非枚举存储。

### 5.3 API 与数据层
- **无 Next.js Route Handlers**：未发现 `**/route.ts`，数据通过 Server Components + Server Actions + 直接调用 lib/*-db 与 lib/data 获取。
- 数据层：`lib/data/index.ts` 聚合各 *-db；`lib/profit-engine.ts` 为项目利润/成本的权威计算之一。

---

## 6. 小结与建议（阶段一）

| 项目 | 状态 |
|------|------|
| 路由完整性 | 侧栏与主要业务路由均有对应 page，无发现死链 |
| TODO/FIXME | 无 |
| console | 仅 1 处 dev-only warn，可保留 |
| any 类型 | 无 |
| Mock/空数据 | getRecentTransactions 恒为 []；project 列表 client/start/end 未接真实字段 |
| 数据一致性风险 | project.spent 与 canonical 成本口径不一致；两套 Bills 入口需厘清 |
| 静默 catch | estimates actions 多处 no-op，建议返回错误信息或统一提示 |

**建议优先在阶段二/三处理**：  
1）项目列表传入 `client`、`startDate`、`endDate`；  
2）统一项目 Spent 口径（或明确双口径用途）；  
3）Recent Activity 接入真实交易或移除/标注占位；  
4）Estimates actions 的 catch 改为返回 error 或 toast。

---

*报告由阶段一全局扫描生成，供阶段二逐模块测试与阶段三数据一致性检查使用。*
