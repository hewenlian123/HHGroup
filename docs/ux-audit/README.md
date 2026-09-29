# HH Group 设计系统与体验一致性审计

审计基准：GitHub `main`，提交 `f4c30a205da0ae2299347917a1850a761e963628`（含已合并的 PR #4 navy-brass、PR #6 项目详情、PR #9 发票详情、PR #11 费用收件箱与客户报销）。  
范围：只读审计，不改产品代码。视觉部分在本文件。点击变慢的调查在 [PERFORMANCE.md](./PERFORMANCE.md)。  
产品截图：未附。这些页面都在登录壳内，本环境没有可用的本地会话，渲染出来的会是登录墙。结论以当前 `main` 源码为准。

另有一份会话附件，不在仓库里，只作已批准方向的历史意图：`DESIGN-SPEC.md`（Navy + Brass v3），以及五张稿（发票详情桌面/手机、项目详情桌面/手机、设计系统板）。规格自述来自 mockup CSS。下面凡是和 `main` 不一致的，以已经上线的发票详情、项目详情和 `tokens.css` 为准，不按稿重做一版。

仓库里已有的设计说明当作对照，不当作现行视觉权威：

- `docs/architecture/HH_GROUP_GLOBAL_UI_UX_BASELINE.md`（2026-09-02 冻结）仍把 `hh-design-system-v2.css`、蓝色强调色和 Estimate V3 / Revenue & AR V2 写成视觉权威。PR #4 之后，线上主按钮已经是黄铜渐变，这份冻结文档落后于 `main`。
- `src/components/base/README.md`、`src/lib/typography.ts`、`src/components/ui/*` 是旧运营层的组件合同，多数列表页仍在用。
- `src/app/estimates/estimate-tokens.css` 明确写成「只服务 Estimate」，但会在模块内改写全局 `--hh-*`。
- `src/app/financial/expenses/expenses-ui-theme.css`（3198 行）自称组合现有设计系统，实际是费用模块自己的一层皮肤。

---

## 结论

产品已经有一套该沿用的视觉，不需要第三套配色。

**唯一系统：Navy + Brass。** 颜色以 `src/styles/tokens.css` 为唯一色值来源。版式以发票详情 `InvoiceDetailLayout`（PR #9）为详情页样板，以项目概览卡片 `project-detail-redesign.tsx`（PR #6）为同一套卡片语言。列表、表单、收件箱都接到这套卡片、标题和金额上，而不是再发明一套。

现在用户觉得「每页不一样」，是因为四代界面叠在同一个壳里：

| 代 | 在哪里 | 用户看到的 |
| --- | --- | --- |
| 生成 token | `src/styles/design-tokens.generated.css` | 标题 22px、面板圆角 10px、顶栏高度 48/52 |
| 冻结 v2 | `src/styles/hh-design-system-v2.css` | 标题 24/600、卡片圆角 8px、强调色 `#2563eb`、字体 Geist |
| Navy + Brass | `src/styles/tokens.css`（后加载，双写 `data-hh-theme` 选择器压过 v2 颜色） | 页底 `#f6f7f9`、墨色 `#0b1526`、海军蓝侧栏、黄铜主按钮、Inter |
| 页面私货 | 发票/项目详情、Estimate CSS、费用 3198 行 CSS、打印纸、离线页 | 标题 29px、卡片 12px + `shadow-card`、另一套金色、硬编码 hex |

`globals.css` 的引入顺序是 generated → v2 → `tokens.css`。黄铜主按钮已经全局生效（`.hh-btn-primary`）。标题大小、圆角、卡片阴影没有一起生效，所以列表页仍是 24px 标题 + 8px 圆角，发票页是 29px 标题 + 12px 阴影卡片。

---

## 对照 DESIGN-SPEC 与已上线页面

色板不用再选。`tokens.css` 里的 hex、阴影、渐变和规格第 1 节是同一套：页底 `#F6F7F9`、墨色 `#0B1526`、海军蓝 `#13233A`、黄铜 `#C49A4A → #A87A2E`、链接 `#1F3F66`、警告橙 `#D97706`（不是黄铜）。PR #4 还带了规格第 8 节的原始色检查（`eslint-rules/no-raw-color.js`、`scripts/raw-color-lib.cjs`），黄铜工具类只允许出现在 `button.tsx`、`sidebar.tsx`、`bottom-nav.tsx`、`floating-action-button.tsx`。

已经按稿落在 `main` 上、后续页面应照抄的结构：

| 稿 / 规格 | `main` 上的实现 |
| --- | --- |
| 侧栏 240px、海军蓝渐变、3px 黄铜激活条、六边形字标、Cormorant 字标 | `tokens.css` 的 `.neo-sidebar`、`.hh-logo-mark`、`.hh-wordmark`；激活条是 `a[aria-current="page"]::before` |
| 顶栏 56px、白底 92% + blur | `[data-app-topbar]` 同一段 |
| 底栏激活项：28×3 黄铜顶条，不用黄铜做图标底 | `nav[aria-label="Bottom navigation"] a[aria-current="page"]::before` |
| 发票详情：外框 1200、桌面左右 40、双栏 `1fr + 22rem`（352px）、间距 24、海军蓝手机顶栏、底栏上方一条主按钮 | `invoice-detail-layout.tsx`：`max-w-[1200px]`、`xl:px-10`、`xl:grid-cols-[minmax(0,1fr)_22rem]`、`xl:gap-6` |
| 进度条用海军蓝，不用黄铜 | 发票金额条 `bg-[image:var(--hh-grad-bar-navy)]` |
| 项目 KPI：`1.12fr 1.12fr 0.96fr`，唯一英雄块是利润 | `ProjectKpiRow` 的 `lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1.12fr)_minmax(240px,0.96fr)]` |
| 项目桌面双栏，右栏最大 352px，卡片间距 24 | `lg:grid-cols-[minmax(0,1fr)_minmax(260px,352px)]`、`lg:gap-6` |
| 卡片头内边距 16/20/14 | `OverviewCard`：`px-5 pb-3.5 pt-4` |
| 概览用紧凑列表，最多几行 + “View all” | 项目发票 / 变更单卡片，不是整表 |
| 手机项目：海军蓝头、返回、眉题 + 徽章、标题、地址、2×2 快捷块（最小高 112） | `ProjectMobileIntro` + `lg:hidden` 的四块快捷入口 |
| 金额两位小数、负数用 `−$`（U+2212）、正数加号只在明确要求时出现 | `formatOverviewMoney`。发票详情和项目概览已经用它。`formatCurrency` 仍是多数列表的 `Intl` 输出，负号不是 U+2212 |
| 每页一个黄铜主按钮；链接是海军蓝；焦点环是海军蓝不是黄铜 | 发票桌面的 Record payment、`.hh-btn-primary`、`--hh-link`、`--hh-ring-focus` |

规格里写了、但 `main` 没有照做的，不要在统一时补回去：

- **正文字号 13px、手机标题 26/31。** 线上发票正文是 `text-hh-body`（v2 token，14/20）。标题工具类 `text-title-page` 固定 29/36，手机也不缩小。保持 14 和 29。
- **徽章高 22px 与组件高 26px 互相打架。** 规格和 `.hh-badge`（`tokens.css`）都是高 22、11.5/600、6px 圆点。`StatusBadge` 又写了 `h-[26px]`，发票状态实际更高。收口时删掉 26px，让已经上线的 token 生效。
- **底栏五项不要改成稿里的 Home / Projects / 居中 FAB / Time / More。** 线上是 Dashboard、Projects、Finance、Labor、Inbox。项目手机快捷操作是页面里的 2×2 卡片，不是嵌进底栏的 54px 黄铜 FAB。
- **底栏激活态现在有三处在画。** `tokens.css` 画黄铜顶条；`bottom-nav.tsx` 又加选中底色；`app-shell-visual.css` 又加 `inset 0 2px` 黄铜阴影。只留 `tokens.css` 那条。
- **Finance 子导航留在页顶的 `WorkspaceNavigation`，不搬进侧栏。** 规格第 3.9 节想把 Overview / Billing / Payables 放进侧栏。`ia.ts` 的分组已经在顶栏工作区导航里，这是上线的信息架构。
- **项目手机 tab 保持 Overview / Change Orders / Documents / Financials。** 规格写的 Schedule / Tasks / Photos 在 `project-workspace.ts` 里被折回 overview。不恢复这套现场 tab。
- **仪表盘不按未见过的 `v3-dashboard.png` 重做。** 附件里没有这张稿。线上仍是 “Operations Home”。规格第 4 节的行动队列只记成以后的产品意图。
- **不把发票编辑器和报价编辑器合成一个，也不在这次视觉工作里改 HI GET 4.712%。** 税率是财务规则，不在本审计的换皮范围内。附件里的发票稿是详情页，不是规格点名的 `v3-invoice-editor.png`（那张也没附上）。
- **逾期条保持现在的 `--hh-danger-bg` 平色。** 规格里的红渐变没有进 `tokens.css`。`ProjectOverdueBanner` 已经是危险色、不是黄铜。
- **收款、记一笔费用继续用现在的 Dialog。** 规格希望新建走右侧 Sheet。PR #9 的收款是 modal。迁到某一页时可以改成 Sheet，但不为了贴稿把已经上线的收款弹窗重做。

设计系统板那张稿是组件清单（按钮状态、徽章、输入错误、KPI、空态）。仓库里的 `/design-system` 仍是旧展示页，不是这张板。它用来对照组件有没有缺状态，不作为另一套色值。

---

## 1. 页面清单

壳层定义在 `src/components/layout/app-shell.tsx` 与 `app-shell-chrome.tsx`。导航清单在 `src/lib/navigation/ia.ts`。

### 1.1 共用壳（已登录、非纸张、非登录）

- 桌面：左侧海军蓝侧栏（`sidebar.tsx`，宽 240px，渐变 `--hh-grad-sidebar`）+ 顶栏（面包屑、搜索、公司头像，高 56px）+ 工作区二级导航 `WorkspaceNavigation`（底边下划线式按钮，Finance / Labor / Settings 各不相同）。
- 手机（`<640px`）：侧栏改抽屉；底部五键 `BottomNav`（Dashboard、Projects、Finance、Labor、Inbox），`fixed`，`sm:hidden`。
- 项目详情和 Estimate 编辑器故意关掉工作区二级导航（`app-shell.tsx` 里 `/projects/:id` 与 `/estimates/:id`）。
- 窄屏列表容器 `.page-container` 在 `<768px` 时 `max-width: 430px`（平板才放到 460px）。发票详情则是 `max-w-[1200px]` 全宽。同一台手机上，列表是一条窄柱，详情是满宽。这是密度不一致的主因。

### 1.2 壳外页面

| 路由 | 桌面 / 手机 |
| --- | --- |
| `/login` | 无侧栏。居中 `max-w-[430px]` 面板，`AUTH_*` 类，v2 标题尺寸。手机同结构，只是边距变小。 |
| `/forgot-password`、`/reset-password`、`/unlock` | 同上，单列表单。`/reset-password` 无效链接时用 `AUTH_TITLE_CLASS` 的 `h1`。 |
| `/upload-receipt` | 公开工人上传。无壳。表单 + 加载。`/receipt` 只跳到这里。 |
| `/offline` | 无壳。`bg-zinc-50`、`text-xl` / `lg:text-2xl`，不走 HH 标题 token。 |
| 纸张 / 预览 | 无壳，`document-light` 或 `operational-light`。白纸，不进应用语言。见 1.5。 |

### 1.3 只做跳转的路由

这些文件不要单独做视觉迁移，改目标页即可。

| 路由 | 去向 |
| --- | --- |
| `/` | `/dashboard` |
| `/backups` | `/system/backups` |
| `/contacts` | `/customers/overview` |
| `/finance/advances` | `/labor/advances` |
| `/finance/bills` | `/bills` |
| `/finance/cost-allocation` | `/labor/cost-allocation` |
| `/finance/expenses` | `/financial/expenses` |
| `/finance/invoices` | `/financial/invoices` |
| `/financial/bills`、`/financial/bills/new`、`/financial/bills/[id]` | 账单模块（`/bills` 一族） |
| `/financial/estimates` | `/estimates` |
| `/financial/payments-received` | `/financial/payments` |
| `/financial/receipt-queue` | `/financial/inbox` |
| `/labor/daily` | `/labor?addDaily=1` |
| `/labor/subcontractors`、`/labor/subcontractors/[id]` | `/subcontractors` |
| `/labor/workers/[id]` 及其 statement / print | `/workers` |
| `/people/vendors` | `/financial/vendors` |
| `/projects/[id]/edit` | 项目详情 `?edit=1` |
| `/projects/[id]/reimbursements` | `/financial/client-reimbursements?project_id=` |
| `/projects/[id]/change-orders/new` | `/projects` |
| `/projects/[id]/change-orders/[coId]/edit` | 变更单详情 |
| `/receipt` | `/upload-receipt` |
| `/settings` | `/settings/company` |
| `/settings/system-health` | `/system-health` |

`/login`、`/estimates`、`/reset-password` 里的 `redirect()` 是登录态或错误态守卫，页面本身仍然存在。

### 1.4 产品页面

「手机」列只写和桌面不同的结构。未写时表示同一骨架，只是堆叠和 44px 触控。

#### 首页与总览

| 路由 | 布局 |
| --- | --- |
| `/dashboard` | 宽 `page-container` + `DashboardPageHeader`（`TYPO.pageTitle`，文案 Operations Home）+ command HUD + KPI 磁贴。手机额外加大底部留白，躲开底栏。加载用 `DashboardMainSkeleton`。 |
| `/dashboard/cashflow` | `PageLayout` + `PageHeader` + 分区卡片与金额。 |
| `/financial`、`/finance` | 同一页。`PageLayout` + KPI + `NeoTable` / `NeoMobileCard`。 |
| `/financial/dashboard` | `PageLayout` + `PageHeader`，财务看板。 |
| `/financial/owner` | `PageLayout` + `PageHeader` + 图表（含 pending donut）。旧的业主总览。 |
| `/owner` | `PageLayout` + `PageHeader` + 分区，自写 `fmtUsd`，不走 `FinancialText`。 |
| `/financial/accounts/overview` | `PageLayout` + `PageHeader` + 空态。 |
| `/reports` | 正常态是报表客户端（筛选、表格、状态）。`?asOf=` 时退化成无样式 `<h1>` 加一段大写英文说明。 |
| `/reports/workforce` | 劳动力报表，按 tab 切概览 / 工资 / 付款 / 预支 / 余额。空态与骨架在客户端里。 |
| `/settings/project-financial-review` | `PageLayout` + `PageHeader` + 返回 + `Neo*` 表。挂在 Reports 导航下。 |

#### 项目

| 路由 | 布局 |
| --- | --- |
| `/projects` | 列表。桌面 `PageHeader` + 筛选 + 表；手机 `MobileListHeader` 风格的标题和卡片行。状态用 `NeoStatus`。删除走 `Dialog`。 |
| `/projects/new` | `PageHeader`（subtitle 写法）+ 表单 + 骨架。 |
| `/projects/[id]` | **海军蓝详情。** 页内 tab（Overview / Change Orders / Documents / Financials / People / Closeout；手机只露前四个）。概览是 `ProjectKpiRow` 海军蓝英雄卡 + `rounded-card` 分区 + `ProjectMobileIntro`。不是 `PageHeader`。 |
| `/projects/[id]/profit` | `PageLayout` + `PageHeader` + 返回。利润钻取，仍是 v2 壳，和上面的概览卡片不是同一张皮。 |
| `/projects/[id]/labor` | `PageLayout` + `PageHeader` + 返回 + 金额表。 |
| `/projects/[id]/change-orders/[coId]` | `PageLayout` + `PageHeader` + `DataTable` + 表单动作。 |
| `/projects/[id]/subcontracts` | `PageLayout` + `PageHeader` + `Neo*` 列表 + 新增 `Dialog`。 |
| `/projects/[id]/subcontracts/[subId]` | 详情：`PageHeader` + 表单字段 + 空态，单列。 |
| `/projects/[id]/subcontracts/[subId]/bills` | 列表 + 加账单 modal + 行操作。 |
| `/projects/daily-logs`、`/projects/documents` | 占位。`page-container` + `PageHeader`，描述写 “This page is not yet implemented.” |
| `/change-orders` | 全局变更单。桌面 `PageHeader` 藏在 `md:block`，工具条 `NeoToolbar`；手机另一套标题和卡片。空态自绘图标。 |
| `/documents` | 桌面 `PageHeader` + `Divider`（`hidden md:block`）；列表客户端自带筛选、分页、`Dialog`。 |
| `/procurement/purchase-orders` | `PageLayout` + `PageHeader` + `EmptyState`。薄页面。 |
| `/estimating/cost-codes` | `PageLayout` + `PageHeader` + `Neo*`。 |

#### 报价 Estimate

| 路由 | 布局 |
| --- | --- |
| `/estimates` | 列表。自己的 `estimate-list-operational.css`，不走标准 `PageLayout` 宽度。行上有状态徽章和金额。 |
| `/estimates/new`、`/estimates/[id]` | 编辑器工作区：连续施工单 + 右侧摘要。模块内 token 把字体改回 Geist、强调色改成 `#8a6925`。无工作区二级导航。加载骨架 + 抽屉。 |
| `/estimates/[id]/snapshot`、`/snapshot/[version]` | 只读修订。快照页用 `text-hh-*`，不是海军蓝标题。 |
| `/estimate-templates` | `PageLayout` + `PageHeader` + 列表 + 保存模板 `Dialog`。 |

#### 财务：开票与收款（最接近目标，但列表还没跟上详情）

| 路由 | 布局 |
| --- | --- |
| `/financial/ar` | `PageHeader` + `Neo*` + 筛选。账龄工作台，不是发票详情那种双栏。 |
| `/financial/invoices` | 列表样板的功能形态：桌面 `PageHeader` + `NeoTable`；手机 `MobileListHeader` + 卡片。筛选、空态、`Dialog` 都有。视觉仍是 v2 标题。 |
| `/financial/invoices/[id]` | **目标详情。** `InvoiceDetailLayout`：`xl` 双栏（主栏 + 22rem 侧栏），金额条，海军蓝 Balance due，`rounded-card` + `shadow-card`，标题 `text-title-page`（29px）。手机：粘性海军蓝顶栏 + 底部固定主按钮，底边距躲开 `BottomNav`。 |
| `/financial/invoices/new`、`/financial/invoices/[id]/edit` | `InvoiceEditorShell`，`max-w-[1120px]`，卡片 + 摘要轨，标签 `font-[650] uppercase`。 |
| `/financial/payments` | 收款列表仍是 `PageHeader`「Payments Received」；录入/编辑 modal 开始用海军蓝类名。桌面表 + 手机卡片 + 空态。 |
| `/financial/deposits` | `PageHeader` 用了 `subtitle` 而不是 `description`。表 + modal。 |

#### 财务：应付、费用、账户

| 路由 | 布局 |
| --- | --- |
| `/financial/payables` | `PageLayout` + KPI + 账单表 / 手机卡片 + `BillDetailSheet`。 |
| `/financial/payables/payments` | 同上壳，付款记录。 |
| `/bills`、`/bills/new`、`/bills/[id]`、`/bills/[id]/edit` | 标准 `PageHeader` 列表或单列表单。详情不是发票那种双栏。 |
| `/financial/expenses`、`/financial/inbox` | 同一 `ExpenseWorkspacePage`。顶部 `ExpenseOperationsWorkspaceNav`（Review / Ledger / Intake / Reimbursements / Client reimbursements）+ 按日期分组的 `NeoTable` / `NeoMobileCard` + 批量条。外面包 `expenses-ui`。 |
| `/financial/expenses/intake` | 上传动作 + 同一套费用导航。标题走 `text-hh-*`。 |
| `/financial/inbox/review` | **收件箱复核。** `PageHeader` + 左收据预览（`lg:sticky`，半宽）+ 右表单网格。这是 Inbox 模板的功能形态，皮仍是 v2。 |
| `/financial/inbox/worker` | 工人收据列表，额外吃 `worker-receipts-ui.css`。 |
| `/financial/expenses/new`、`/financial/expenses/[id]` | 表单 / 详情客户端，返回链接，modal，不是发票双栏。 |
| `/financial/client-reimbursements` | `expenses-ui` 壳 + 费用导航 + 列表/结算表单。 |
| `/financial/commissions` | `PageHeader` + 大量 `Dialog`（文件里 modal 标记最密）。 |
| `/financial/reimbursements` | `PageHeader` + `DataTable` + 空态。和 Labor 报销不是同一页。 |
| `/financial/bank` | `PageHeader` + `Neo*` + `DataTable` + 表单。对账。 |
| `/financial/accounts` | `PageHeader` + 表 + 表单 + modal。 |
| `/financial/vendors` | 联系人目录壳：`PageHeader` + 列表 + 空态。`/vendors` 是 `ContactsDirectory vendorOnly`。 |
| `/financial/workers` | `PageLayout` + 报销余额表。 |
| `/(dashboard)/receipt-queue` | 旧收据队列。加载态硬编码 `#f5f7fa` / `#6b7280`。导航已指向 `/financial/inbox`。 |

#### 人工 Labor

| 路由 | 布局 |
| --- | --- |
| `/labor` | `LaborPageClient`。`PageHeader` + 工时工作区 + modal。手机底栏仍在。 |
| `/labor/entries` | `PageLayout` + `PageHeader` + 筛选表单 + 表/空态。 |
| `/labor/daily-entry` | `PageHeader` + `Neo*` + 骨架。 |
| `/labor/review` | 审核列表：`PageHeader` + 表单筛选 + 空态 + modal。 |
| `/labor/timesheets` | 占位。`PageHeader` + “not yet implemented”。 |
| `/labor/monthly` | `PageLayout` + 月份选择表单。 |
| `/labor/overview` | `PageLayout` + 表单筛选 + 空态。 |
| `/labor/costs` | `PageLayout` + 表单 + 空态。 |
| `/labor/cost-allocation`、`/finance/labor-cost` | `PageLayout` + `PageHeader` + 金额。 |
| `/labor/payroll`、`/labor/payroll-summary` | `PageHeader` + 发放 modal。摘要页是另一套筛选。 |
| `/labor/payments` | `PageHeader` + 表 + 空态。 |
| `/labor/payments/[id]/receipt` | 纸张收据，见 1.5。 |
| `/labor/advances` | `PageHeader` + 表 + `worker-advance-form-dialog`。 |
| `/labor/reimbursements` | `PageHeader` + 表 + 多个 modal。和客户报销不是同一模板。 |
| `/labor/worker-balances` | `PageHeader` + 余额表 + modal。 |
| `/labor/worker-invoices` | 客户端岛屿，列表。 |
| `/labor/invoices`、`/new`、`/[id]` | 工人发票列表 / 新建表单 / 单列详情。不是 `InvoiceDetailLayout`。 |
| `/labor/workers`、`/labor/workers/new` | 列表与新建表单，`PageHeader`。 |
| `/labor/workers/[id]/balance` | 单列长页。`h1` 用 `text-hh-financial-total`，底部有粘性操作。和发票粘性条不是同一个组件。 |
| `/workers`、`/workers/summary` | 工人目录 / 汇总。`PageHeader` + 筛选 + 表 + modal。 |
| `/workers/[id]` | `PageHeader` + 页内 tab（余额、付款、预支等）。不是项目详情那种海军蓝英雄区。 |
| `/workers/[id]/edit` | `PageHeader` + 表单。 |
| `/workers/[id]/statement` | `PageLayout` + `PageHeader` + 空态。 |
| `/worker/[workerId]/monthly-report` | `PageLayout` + 报表；另有打印样式。 |

#### 联系人

| 路由 | 布局 |
| --- | --- |
| `/customers`、`/customers/overview` | 目录。`PageHeader` + 搜索表单 + 表/卡片 + 空态 + modal。Overview 把客户和分包商分组。 |
| `/customers/[id]` | `PageHeader` + 返回 + 关联项目。不可用时仍是 `PageHeader`，不是统一空态。 |
| `/subcontractors`、`/subcontractors/[id]` | 同上，详情带金额和 modal。 |
| `/vendors`、`/vendors/[id]`、`/financial/vendors` | `ContactsDirectory`。`/vendors/[id]` 若存在详情，走联系人详情而不是发票双栏。 |

#### 设置与管理

| 路由 | 布局 |
| --- | --- |
| `/settings/company`、`/account`、`/security`、`/users`、`/permissions`、`/expenses`、`/categories`、`/lists`、`/subcontractors` | `PageLayout` 或 `PageHeader` + `settings-sub-nav` 第二套标签（和侧栏 Settings 分组重复）+ 表或表。Company / Expenses 用 toast。 |
| `/system-health` | 自写 `h1.text-hh-page-title`，不走 `PageHeader`。长诊断页。 |
| `/system-metrics` | `PageLayout` + `PageHeader` + 计数。 |
| `/system-logs` | `PageLayout` + `PageHeader` + `DataTable`。 |
| `/system/backups` | `PageLayout` + `PageHeader` + 表 + 表单。 |
| `/system-tests`、`/system-tests/ui` | 内部。`PageHeader` + 徽章样例。 |
| `/design-system` | 内部展示页，自身还有硬编码色。不是产品导航。 |

### 1.5 纸张与预览（保持白纸，不并进应用壳）

`/estimates/[id]/print`、`/estimates/[id]/preview`、`/estimates/[id]/payments/[paymentId]/preview`、`/financial/invoices/[id]/print`、`/financial/invoices/[id]/preview`、`/receipt/print/[id]`、`/workers/[id]/statement/print`、`/labor/payments/[id]/receipt`。

预览页标题有的仍是 `text-2xl text-zinc-950`（付款预览）。纸张可以继续白底，但预览壳的工具条应使用应用的次按钮，而不是 zinc。

---

## 2. 不一致目录

### 颜色与 token

色值本应只出现在 `tokens.css`。现在有四套来源。

- **三份 token 文件互相覆盖。** `design-tokens.generated.css`、`hh-design-system-v2.css`（`--hh-v2-accent: #2563eb`，注释写明 gold 别名「never gold」）、`tokens.css`（`--hh-action-primary: var(--hh-brass)`）。按钮看起来是黄铜，是因为 `.hh-btn-primary` 写在 `tokens.css` 且不带主题前缀；v2 文件里的蓝色变量仍留着，底部导航激活色用的是 `--hh-accent-primary`，在海军蓝别名里被设成 `--hh-ink`，不是黄铜。
- **Tailwind 里还有逃逸色。** `tailwind.config.ts` 的 `hh.link` 是 `#059669`（旧翠绿），`hh.secondary-border` 是 `#D1D5DB`，`hh.secondary-text` 是 `#374151`。真正的链接色 `--hh-link` 是 `#1f3f66`。
- **Estimate 私有调色板。** `estimate-tokens.css` 把模块内 `--hh-text-primary` 改成 `#272824`，强调色 `#8a6925`，动作底 `#e6ce96`。和黄铜 `#b8893a` 是亲戚，但是另一套。
- **硬编码加载态。** `(dashboard)/receipt-queue/page.tsx` 使用 `#f5f7fa` 和 `#6b7280`。`app-shell.tsx` 打印收据背景 `#f5f5f5`。`layout.tsx` 的 `themeColor` 仍是 `#F7F7F6` / `#0A0A0A`，不是页底 `#f6f7f9`。
- **shadcn HSL 变量写了两次。** v2 的 `--primary` 是蓝，`tokens.css` 把它改成海军蓝 HSL。组件若用 `bg-primary` 而不是 `hh-btn-primary`，和黄铜按钮不是同一个动作色。

### 字体

两套字号阶梯同时存在。

| 角色 | 列表 / `PageHeader`（v2 token） | 发票与项目详情（Tailwind 字面量） |
| --- | --- | --- |
| 页标题 | `--hh-type-page-title-*` = 24px / 30px / 600 | `text-title-page` = 29px / 36px / 650 |
| 英雄金额 | `--hh-type-financial-total-*` = 20px / 600 | `text-display-hero` = 40px / 46px / 700 |
| 卡片标题 | `--hh-type-panel-title-*` = 14px / 500 | `text-title-card` = 15.5px / 22px / 600 |
| 数字 | `text-hh-financial` 14px | `text-num-xl` 28px、`text-num-l` 20px、`text-num-m` 16px |
| 字重 | 400 / 500 / 600 | 大量 `font-[650]` |

字体家族也不一：运营主题在 `tokens.css` 里改成 Inter；v2 和 Estimate 模块改回 Geist；字标用 Cormorant（`--hh-font-wordmark`）。离线页和部分预览用 `text-xl` / `text-2xl` / `text-sm`，不走任一阶梯。

### 间距与密度

- 间距刻度本身是齐的：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64（`design-tokens.generated.css`）。页面没有用它。发票详情写 `gap-4`、`px-4`、`xl:px-10`、`p-3.5`；`PageLayout` 用 `--hh-gap-related`（12px）和 `--hh-page-gutter-*`（手机 16、桌面 24）。
- **宽度是最大的密度裂缝。** `.page-container` 在 768px 以下锁 430px。发票详情 `max-w-[1200px]`，编辑器 `max-w-[1120px]`，仪表盘 `page-shell-wide` 放到 `--hh-content-width-max`（1600px）。
- 卡片内边距：项目概览 `px-5 pt-4 pb-3.5`；v2 面板 token 是 12/16。行高 token 也有三套（generated 32/36、v2 40、触控 44）。

### 页头与导航

至少四套页头：

1. `PageHeader` in `src/components/base/page-layout.tsx`：24px 标题 + 可选描述 + 右侧动作。
2. `src/components/page-header.tsx`：同一组件的薄封装，多一个 `subtitle` 别名。Deposits、New Project 用 `subtitle`，别的页用 `description`。
3. 发票 / 项目：返回链、状态徽章、29px 标题、手机海军蓝粘性条，不用 `PageHeader`。
4. 手机列表：`MobileListHeader`（`md:hidden`）再加一个桌面 `PageHeader`。Documents、Change Orders 用 `hidden md:block` 把桌面头藏起来，等于每页手写两套头。

导航层级也不一：侧栏、`WorkspaceNavigation`、`settings-sub-nav`、`ExpenseOperationsWorkspaceNav`、`LaborWorkspaceNav`、项目 tab。设置页同时出现侧栏分组和页内第二排标签。顶栏面包屑（`topbar.tsx` 的 `SEGMENT_LABELS`）和页内返回链接各写各的。

### 按钮、链接、图标

- 主按钮组件是 `Button`（`src/components/ui/button.tsx`），变体 `default` 与 `primary` 相同，都加 `hh-btn-primary`，所以是黄铜渐变。`secondary` 与 `outline` 相同。`quiet` 与 `ghost` 相同。变体名比视觉多一倍。
- 发票和项目详情里的次动作经常是手写的 `TextLink` / `CardFooterLink`（`text-[var(--hh-link)]`、`font-[650]`），不走 `Button variant="ghost"`。
- 手机列表用圆形 `MobileFabPlus`（黄铜、44px）。发票详情用通栏 `fixed` 主按钮。两套「主行动」并存。
- 图标都来自 `lucide-react`，这点是齐的。尺寸不齐：`h-3.5`、`h-4`、`h-5`、`h-8` 混用。变更单空态用 `h-8 w-8`。

### 表格与卡片列表

财务列表没有一个组件。同一类账在三套皮里：

- 发票列表、应付、项目列表：`NeoTable` + `NeoMobileCard`，v2 表面。
- 费用收件箱：`expense-inbox-transaction-list.tsx` 在 `NeoTable` 上再包日期分组、问题 popover、`expenses-ui`。
- 发票详情里的付款行：自己的 `<ul>` 行，类名是 `text-hh-body` + `--hh-line`，不是 `NeoTable`。
- 另有 `DataTable`（`src/components/base/data-table.tsx`）和 `src/components/ui/table.tsx`。系统日志、报销、变更单详情走 `DataTable`；多数财务列表走 `NeoTable`。

金额同样分叉：`FinancialText`、`NeoAmount`、`formatCurrency` 加 `tabular-nums`、项目页的 `formatOverviewMoney` + `hh-fin`。语义应继续来自调用方，外观应只留 `Money`。

### 表单与输入

- `src/components/ui/field.tsx` 的 `Field` 已经负责 label、description、error 和 `aria-describedby`。全仓库没有引用它。各页自己拼 `Label` + `Input`。
- 发票编辑器用页面常量 `invoiceEditorLabelClass`（大写、字重 650、`--hh-muted`）和 `invoiceEditorFieldClass`（高 44、`--hh-line-input`）。登录用 `AUTH_LABEL_CLASS` / `AUTH_INPUT_CLASS`。费用复核用普通网格 `gap-3`。
- 日期：`src/components/ui/date-picker.tsx`、`src/components/expense-date-picker.tsx`，以及大量 `<input type="date">`（账单、人工、报表、文档、发票、收款）。三个日期入口。

### 状态徽章

链条是 `Badge` → `StatusBadge` → `NeoStatus` → `InvoiceStatusBadge`。项目列表已经用 `NeoStatus`。问题在尺寸和变体：

- `tokens.css` 的 `.hh-badge` 把徽章定成高 22px、字号 11.5px、字重 600、全圆角。
- `StatusBadge` 又写成 `h-[26px]`、`rounded-hh-pill`、`text-hh-status`，并带 6px 圆点。
- `Badge` 还有 `default` / `secondary` / `neutral` 三个几乎相同的变体，另有 `destructive` 与 `danger`。
- 发票状态映射在 `invoice-status-badge.tsx`（Paid 成功、Partial 警告、Overdue 危险）。项目状态在 `ProjectListStatusPill` 里另写一套映射，完成和进行中都用 success。

### 空态、加载、错误

- 可用组件已经在 `src/components/ui/system-state.tsx`：`EmptyState`、`NoResults`、`PermissionDenied`，以及加载/错误语气。发票列表、项目列表、文档、变更单用了它们。
- 项目概览自己写了 `EmptyCopy`（居中两行字，无图标、无边框）。
- 占位页（Daily Logs、Documents 子页、Timesheets）只用 `PageHeader` 的 description，没有空态动作。
- 加载有的是 `Skeleton`，有的是 `Loading…` 纯文本（`/labor`），有的是收据队列的硬编码灰块。
- 数据失败有 `ServerDataLoadFallback`、`FinanceUnavailable`、`PermissionDenied`，也有报表 `?asOf=` 那种无样式段落。

### 弹层与反馈

- 确认和短表单主走 `@/components/ui/dialog`。侧栏抽屉走 `sheet.tsx` 和 `src/components/base/drawer.tsx`。账单详情用 `BillDetailSheet`。Estimate 用自己的 `estimate-surface-sheet.tsx`。
- Toast 只有 `src/components/toast/toast-provider.tsx` 这一条，这点是齐的。文案和触发时机按页面各写各的。
- 遮罩变量有 `--hh-scrim` 和 `--hh-overlay-scrim` 两个名字。

### 手机与桌面

- 断点：底栏 `<640px`；很多列表用 `md`（768px）切换表/卡片；发票详情用 `xl`（1280px）才变成双栏和静态页头。三套断点。
- 粘性主按钮只在发票详情做对了位置：`bottom-[calc(3.5rem+env(safe-area-inset-bottom))]`。工人余额页有另一套粘性条。列表页靠圆形 FAB，不留这条底栏。
- 筛选：`MobileFilterSheet` 存在，但变更单、文档、费用各自再写一套 `md:hidden` 控件。
- 安全区：仪表盘手写了 `pb-[calc(7.5rem+...)]`，`PageLayout` 只加 `1.5rem + safe-area`。底栏会挡住不同页的最后一行。

---

## 3. 推荐的统一设计系统

只保留一套。下面的值都从 `main` 上已经画出来的海军蓝 / 黄铜和发票详情抄过来，不新增色相。

### 3.1 Token

色值继续只写在 `src/styles/tokens.css`。v2 与 generated 文件降成别名，不再写自己的 hex。

| Token | 值 | 只用在 |
| --- | --- | --- |
| `--hh-page` | `#f6f7f9` | 页面底 |
| `--hh-surface` | `#ffffff` | 卡片、输入、弹层 |
| `--hh-ink` | `#0b1526` | 主文字 |
| `--hh-muted` | `#5b6678` | 次文字、表头 |
| `--hh-line` | `#dce1e8` | 卡片和分隔 |
| `--hh-navy` / `--hh-navy-deep` | `#13233a` / `#0c1726` | 侧栏、手机详情顶栏、每页最多一块英雄金额 |
| `--hh-brass` 渐变 | `#c49a4a` → `#a87a2e` | 只给主按钮、侧栏/底栏激活条、字标和头像。不给链接、tab、图表、进度条、徽章、边框、焦点环 |
| `--hh-link` | `#1f3f66` | 文字链接。删掉 Tailwind `hh.link` 的 `#059669` |
| success / warning / danger / info | 现有 `--hh-success-*` 等 | 徽章和横幅。警告保持橙 `#d97706`，不靠向黄铜 |

圆角只留三档，并让旧名字指向它们：

- 控件 `--hh-radius-md` = 8px（输入、按钮、小徽章除外）
- 卡片 `--hh-radius-xl` = 12px（发票上的 `rounded-card`）。`--hh-radius-panel`、`--hh-radius-standard` 都指向它
- 胶囊 `--hh-radius-full` = 999px（状态徽章）

阴影只留已有的四枚：`--hh-shadow-card`（分区卡片）、`--hh-shadow-hero`（唯一海军蓝金额块）、`--hh-shadow-btn-primary` / `--hh-shadow-btn-secondary`、`--hh-shadow-sheet`（抽屉）。运营卡片不再 `shadow-none`，也不再在页面里写新的 box-shadow。

间距继续现有 4px 刻度。卡片之间桌面 24（`gap-6`，项目概览和发票详情已经这样）、手机 16。页面边距跟发票详情：手机 16，桌面 40（`xl:px-10`）。外框最大 **1200px**，扣掉左右 40 后内容是规格里的 1120。去掉 `.page-container` 在 768px 以下的 430px 上限。仪表盘可以仍用 1600px，卡片间隙仍是 24。

字号并成已经上线的发票/项目阶梯，写回 CSS 变量，删掉 Tailwind 里的 29px / 40px / 15.5px 字面量。规格里的正文 13px 和手机标题 26px 不上：

| 角色 | 规格 | 取代 |
| --- | --- | --- |
| 英雄金额 | 40 / 46 / 700 | 每页最多一处，而且只放利润或本页主余额 |
| 页标题 | 29 / 36 / 650 | 今天的 24px `PageHeader`。手机不另缩到 26 |
| 卡片标题 | 15.5 / 22 / 600（`text-title-card`） | 14px panel title |
| 正文 | 14 / 20 / 400（现有 `text-hh-body`） | 保持。不改成规格里的 13px |
| 金额标签 | 现有 `text-hh-label` + 大写 | 只用于金额和表头 |
| 元数据 | 现有 `text-hh-metadata` | 卡片副标题 |
| 金额 | `formatOverviewMoney` 的规则 + `tabular-nums` | 列表迁完后不再直接拼 `formatCurrency` 的 class |

字体：界面用 Inter（`tokens.css` 已指定）。Cormorant 只给字标。Estimate 模块停止把 `--hh-font-family-sans` 改回 Geist。字重 650 收成一个 token `--hh-weight-semibold: 650`，禁止页面里写 `font-[650]`。

### 3.2 要抽出来的组件

这些名字多数已经有半成品。工作是收口，不是新造一套。

| 组件 | 现在散落在 | 合同 |
| --- | --- | --- |
| `PageHeader` | `base/page-layout.tsx`、`components/page-header.tsx`、发票 header、`MobileListHeader` | 一个组件。`variant="record"` 复刻发票：返回、标题、状态、桌面动作、手机海军蓝粘性条。默认先保持今天的列表外观，避免第一批就把所有列表标题撑到 29px。 |
| `SectionCard` | 发票 `cardClass`、项目 `OverviewCard` | `rounded-card` + `--hh-line` + `--hh-surface` + `shadow-card`。标题用卡片标题 token。可选 footer 链接。 |
| `DataTable` | `NeoTable`、`NeoMobileCard`、`base/data-table.tsx`、`ui/table.tsx` | 一个数据合同。`≥768px` 表，以下卡片。金额列右对齐。空态用 `EmptyState`。 |
| `Money` | `formatOverviewMoney`、`FinancialText`、`NeoAmount`、各页 `formatCurrency` | 排版走 `hh-fin`、右对齐。格式沿用 `formatOverviewMoney`：两位小数、负数 `−$`、需要强调增加时才加 `+`。不新建 `src/lib/format.ts`。单据号和电话不用 tabular figures。 |
| `StatusBadge` | `Badge`、`StatusBadge`、`NeoStatus`、`InvoiceStatusBadge`、`.hh-badge` | 对外只留 `StatusBadge`。高 22px（`.hh-badge` 和规格已经写死），6px 圆点，五种语气。删掉 `h-[26px]`。状态映射留在调用处。 |
| `StickyActionBar` | 发票详情 `fixed` 底条、工人余额粘性区 | 一条黄铜主按钮 + 可选次按钮。底边距 = 底栏高度 + safe area。发票这种单据页在 `≥1280px` 把动作收回页头。 |
| `EmptyState` | 已有 `system-state.tsx`；项目 `EmptyCopy` 和占位页没用 | 标题、一句说明、一个动作。错误用 `tone="danger"`。禁止再写裸 `<h1>` 或 “not yet implemented” 当唯一 UI。 |
| `FormField` | 已有 `Field`，零引用 | 所有新改的表单用它。日期只留 `ui/date-picker.tsx`。`expense-date-picker` 和裸 `type="date"` 在迁到的页面上换掉。 |

`Button` 对外只留三个变体：`primary`（黄铜）、`secondary`（白底描边）、`ghost`（链接色、无底）。`default` / `outline` / `quiet` 变成别名，新代码不使用。

### 3.3 四种页面模板

1. **List。** `PageHeader` + 一行筛选 + `DataTable`。桌面表，手机卡片。空、无结果、无权限走 `EmptyState`。参考功能：`/financial/invoices`。参考皮：海军蓝卡片 token，而不是 v2 的 `shadow-none`。外框 1200px。概览页里的「最近几条」不用这个表，用项目详情那种最多数行 + View all。
2. **Detail。** 单据页复刻 `/financial/invoices/[id]`：`xl`（1280）起双栏，左主内容，右 22rem。金额条里一块海军蓝。手机：粘性海军蓝顶栏 + `StickyActionBar`。项目概览保持它已经上线的 `lg`（1024）双栏和 KPI 行，不改成发票的 1280，也不把现场 Schedule/Tasks/Photos 加回来。
3. **Form / Editor。** 复刻 `InvoiceEditorShell` 的卡片和摘要，不另做工具条皮肤。`FormField` 放在 `SectionCard` 里。不把报价编辑器并进来。
4. **Inbox / Review。** 复刻 `/financial/inbox/review` 的结构：左收据、右字段，`lg` 以上收据粘性。列表态用 List 模板加日期分组，去掉 `expenses-ui-theme.css` 这层选择器覆盖。

纸张打印不使用这四个模板。

### 3.4 手机规则

- 底栏只在 `<640px`，保持现有五项：Dashboard、Projects、Finance、Labor、Inbox。激活态只留 `tokens.css` 的黄铜顶条。不改成稿里的居中 FAB。
- 主行动只有一个黄铜按钮：单据详情用 `StickyActionBar`，列表用页头主按钮。项目手机的 2×2 快捷块是海军蓝图标，不是第二个黄铜主按钮。圆形 FAB 不和粘性条同时出现。
- 触控最小 44px（`--hh-touch-min` 已是 44）。
- 表在 `<768px` 变成卡片。金额右对齐，两位小数。
- 筛选在 `<768px` 进 `Sheet`，桌面保持一行工具条。
- 发票这类单据在 `<1280px` 单列；项目概览在 `<1024px` 单列。两套断点都已经上线，模板按页面类型沿用，不合成一个。
- 页面底部留白统一为底栏高度 + safe area + 16px。删掉仪表盘那条 `7.5rem` 特例，改成同一个常量。

---

## 4. 迁移顺序

每批一个 PR。先抽组件、保持现有外观，再逐页换模板。不要先改全局字号 token，那会让所有 `PageHeader` 在同一天从 24px 跳到 29px。

| 批次 | 做什么 | 范围 | 回归面 |
| --- | --- | --- | --- |
| A | 抽出 `SectionCard`、`Money`、`StickyActionBar`，只替换发票详情、发票编辑器、项目概览里的重复 class 字符串。外观不变。 | 约 6 个文件：`invoice-detail-layout.tsx`、`invoice-editor-shell.tsx`、`project-detail-redesign.tsx` 及它们的调用处 | 低。只动已经改版的两页 |
| B | 合并两个 `PageHeader`。加上 `variant="record"`，发票和项目改用它。列表默认仍是今天的 24px。`subtitle` 收成 `description`。 | `page-layout.tsx`、`page-header.tsx`、发票/项目页头 | 低，若默认变体的 DOM 结构不变 |
| C | `StatusBadge` 去掉 `h-[26px]`，回到 `.hh-badge` 的 22px。`EmptyCopy`、三张占位页、`/offline`、报表 `?asOf=` 裸标题改用 `EmptyState`。 | 徽章三件套 + 约 6 个页面 | 低。状态映射不改，只改皮和空态 |
| D | List 模板接到财务列表，并去掉 430px 窄柱。顺序：发票列表、收款、账单、应付、项目列表、变更单、文档。数据加载和权限不动。 | 约 7 个列表客户端 | 中。主要是断点处表/卡片切换 |
| E | Detail 模板接到尚未改版的详情：账单、费用、变更单、客户、分包商、供应商、工人。每页保留自己的字段和动作。 | 约 8 个详情 | 中。双栏会改变扫描顺序，不改变数字 |
| F | Form 模板 + `FormField` + 单一 `DatePicker`。顺序：账单新建/编辑、项目新建、工人编辑、设置里的公司与账户。 | 约 6 个表单 | 中。焦点和错误 `aria` 要逐页对一下 |
| G | Inbox。复核页换 `SectionCard` + `FormField`。费用列表走 List 模板。对照删除 `expenses-ui-theme.css` 里已被组件覆盖的规则，文件从 3198 行降下来，而不是整文件一次删掉。 | 费用收件箱、复核、客户报销、工人收据 | 高。CSS 覆盖面大，放在列表和详情之后 |
| H | Estimate。`estimate-tokens.css` 停止改写全局 `--hh-*` 和字体。应用壳内的列表和工具条用海军蓝 / 黄铜。报价单纸张可以保留更暖的纸色，但只留在打印/预览选择器下。 | `estimate-tokens.css`、列表 CSS、编辑器壳 | 高。客户会看到的报价单，单独验收 |
| I | 壳的收尾：底栏激活态只留黄铜顶条；仪表盘 HUD 改用 `SectionCard`，不重做成未见过的行动队列稿；`system-health` 改用 `PageHeader`；设置页去掉与侧栏重复的第二套标签；`themeColor` 改成 `#f6f7f9`；更新冻结基线文档，写明视觉权威已经是 `tokens.css`。 | 壳、设置、一篇文档 | 中。导航信息架构要产品点头 |

明确不做：

- 不改利润公式、发票账、报销结算、税率、RLS 或迁移。
- 不把打印纸改成海军蓝应用壳。
- 不把侧栏子导航、底栏五项、项目 tab 改成规格里未上线的那一版。
- 不在本审计之后并行开「再定一版配色」。黄铜就是主按钮和激活条，海军蓝就是侧栏和英雄块。

建议的验收，每一批都做，而不是等最后：

- 该批页面的桌面 1280、平板 768、手机 390。
- 空、加载、错误、无权限。
- 底部主按钮不被底栏挡住。
- 金额与改前一致（截图对比数字，而不是只看间距）。

---

## 5. 产品负责人可批准的摘要

请批准下面这一句，作为后续 UI PR 的唯一视觉标准：

**HH Group 的界面以已经上线的 `tokens.css`、发票详情和项目详情为准，规格只用来核对，不用来翻案。黄铜只给主按钮、导航激活条和字标。发票详情是单据页样板，项目概览是卡片页样板，发票列表的「表 / 手机卡片」是列表样板，费用复核的「左收据、右表单」是收件箱样板。先抽共用组件（批次 A–C），再按财务列表、其他详情、表单、费用皮肤、报价单换皮（批次 D–H）。不新增颜色，不改导航结构，不改金额计算。**

未批准前，不要开始批次 A。
