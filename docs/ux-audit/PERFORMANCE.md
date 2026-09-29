# 点击变慢调查

对照 GitHub `main` `f4c30a205da0ae2299347917a1850a761e963628`。只读，不改产品代码，也没有在这次重新测量 hhprojectgroup.com 的计时。数字若来自旧报告，会标明日期。

用户在夏威夷打开线上站，每次点击都觉得慢。代码里对得上的原因是：一次点击要等一趟从太平洋到弗吉尼亚的动态请求，这趟请求在返回前还要做两次登录校验和一串数据库读，而且导航默认不预取。

## 一次点击实际走的路

侧栏、底栏、工作区导航上的 `Link` 都写了 `prefetch={false}`（`sidebar.tsx`、`bottom-nav.tsx`、`workspace-navigation.tsx`）。这仍是 App Router 的客户端切换，不是整页 `location` 刷新，但浏览器在点击之前不会去拿下一页的 RSC。点击之后才发生：

1. 浏览器从夏威夷把 RSC 请求发到 Vercel。
2. `src/middleware.ts` 对几乎所有页面运行。生产环境是 strict（`owner-access-mode.ts`：Production / Preview 不能走 compatibility）。`hasSupabaseSessionUser` 依次做 `auth.getUser()`、`auth.getSession()`，再查 `organization_memberships`。设备锁开启时再加一次 `get_my_device_unlock_state`。通过后响应带 `Cache-Control: private, no-store, max-age=0`。
3. 页面自己再验一次。财务页 `requireSupabaseOwnerOrAdminServerActionClient` 又是 `getUser()` 加 `hasCompanyAdministratorMembership`。项目页 `requireOrganizationServerActionClient` 又是 `getUser()`、按项目查 `projects`、再查 membership。
4. 然后才跑该页的 Supabase 查询。很多页是 `force-dynamic`，根上没有共享的 `loading.tsx`。项目详情、发票列表、费用列表都没有路由级 loading。
5. 一部分列表在客户端水合之后再 `fetch` 一次 API。那是第二次跨洋请求，中间件和登录又跑一遍。

`vercel.json` 没有 `regions`。2026-09-03 的只读测量（`reports/performance/2026-09-03/HH_GROUP_PERFORMANCE_PHASE2.md`）记录的拓扑是：夏威夷流量从 `pdx1` 进来，函数在 `iad1`，Supabase 在 `us-east-2`。仓库里的配置从那以后没有把函数挪近夏威夷，也没有把数据库挪走。那次生产点击抽样里，页面内容大约 1.2–2.2 秒才稳定。那是旧部署上的测量，不是这次重新打的点，只能说明这种拓扑会把「每次多一趟 HTTP」放大。

函数留在数据库旁边是对的。把计算挪到夏威夷会让每一次 Supabase 往返变长。要减的是往返次数，不是把区域改到太平洋。

根布局里的 `ensureConstructionSchema()` 现在是空函数，不在点击路径上。

## 根因（按对「每次点击」的影响排序）

### 1. 导航不预取，响应禁止缓存

证据：主导航 `prefetch={false}`；中间件对已登录页面写 `no-store`；大量 `page.tsx` 是 `dynamic = "force-dynamic"`。React Query 只在 `providers.tsx` 里设了 30 秒 `staleTime`，而且几乎只有费用和收据队列在用。多数页面的数据在服务端，点一次就重新算一次。

这是「每个点击都慢」的共同原因。财务、项目、发票只是这条路上更重的站。

快修：只给侧栏和底栏那五个主入口打开预取（Dashboard、Projects、Finance、Labor、Inbox），不要把 `ia.ts` 里所有别名一起预取。2026-09-03 的报告写过，无边界预取会打出一串 RSC。同时给这几条路由加 `loading.tsx`，点击后先出骨架。不要为了快把财务页改成可被 CDN 公开缓存。

### 2. 同一次导航做两次登录校验

证据：中间件 `getUser` + `getSession` + membership。页面守卫再 `getUser` + membership。发票列表若再打 `/api/invoices`，API 路由上还有第三次。`AuthProvider` 在浏览器里还会打 Supabase Auth。2026-09-03 的硬加载抽样是两次 `/auth/v1/user`。

Auth 服务本身当时的内部耗时中位数只有几毫秒。慢的是这些调用串在夏威夷到 `iad1` 的那一趟请求里，而且页面在中间件结束前不能开始读数据。

快修：一次导航只向 Supabase Auth 要一次用户。中间件已经确认过的请求，页面不要再 `getUser()`。这要单独做，不能为了省时间放宽 RLS 或角色判断。

### 3. 项目详情和利润引擎是串行瀑布

`projects/[id]/page.tsx` 的顺序是：组织守卫（含项目行）→ 再查一次公司管理员 → `getProjectById` → `getCanonicalProjectProfit` 与成本面板 → 等它们结束 → `loadProjectInvoiceReadModel` → 再按 tab 查活动或变更单。

`getCanonicalProjectProfit` 内部先并行三条，然后 `fetchLaborCostForProject`、`getExpenseCostForProject`、佣金、变更单成本、AP 是一个接一个 `await`。成本面板虽然接了同一个 profit promise，仍会再读一包费用行。

概览 tab 不再把所有 tab 的数据一次拉完（比 2026-09-03 报告里「所有 tab 都加载」的描述要窄）。瀑布还在。项目详情没有 `loading.tsx`，`project-detail-tabs-client.tsx` 有 1954 行，RSC 回来之后还要水合这块客户端。

快修：概览所需的利润、发票读模型、活动、变更单一起 `Promise.all`。利润函数里那些成本查询也可以并行。不要改公式。

深一点：利润批量读和单项目读共用一套查询，并核对 2026-09-03 报告里列出的缺索引（`invoice_items(invoice_id)`、`invoice_payments(invoice_id)`、`subcontract_bills(project_id,status)` 等）。那是测量候选，这次没有跑 `EXPLAIN`。

### 4. 发票列表在水合之后才请求数据

`src/app/financial/invoices/page.tsx` 整文件是 `"use client"`（1507 行）。`useEffect` 里 `fetch("/api/invoices?...", { cache: "no-store" })`。点击后的顺序是：空的客户端页到达 → JS 执行 → 再打 API → 中间件和 owner 守卫再跑 → 列表出现。

发票详情则相反：`financial/invoices/[id]/page.tsx` 在服务端调用 `loadInvoiceDetailWithClient`。头行先读，明细、付款、项目、收款、押金用 `Promise.allSettled` 并行。详情页有 `loading.tsx`。详情客户端仍有 1471 行，但数据不再等第二次浏览器请求。2026-09-03 报告里「详情还要等客户端 API」对当前 `main` 已过时。

快修：发票列表改成服务端取数，或至少不要等 `useEffect`。筛选可以留在客户端。

### 5. 费用列表一次拉全表；收件箱 OCR 会自己链式打自己

`loadExpensesInitialData` 并行拉费用、分类、工人、分包扣款、项目、账户。`getExpenses` 对 `expenses` 做 `select("*")`，没有分页。然后并行补付款账户、行、银行关联、扣款、附件。`toExpense` 在 `for` 循环里 `await`，但它只是组对象，不再按行打数据库。附件已经是批量读，不是早先那种上百次单条查询。

慢在全表 `select *` 加上六张关联表，而且费用页客户端有 3540 行（`expenses-client.tsx`）。路由还带上 3198 行的 `expenses-ui-theme.css`。

收件箱若有 `ocrStatus` 为 pending 或 processing，每 4 秒 `POST /api/financial/expenses/ocr-worker`。该路由 `maxDuration = 60`，处理一条后若还有剩余，就 `fetch` 自己，深度最多 30（`x-ocr-chain-depth`）。这不在普通页面点击上，但人停在收件箱时，这些长请求和页面上的刷新抢同一条函数和数据库。OCR 写回还会 `refresh()` 整表。

快修：列表默认分页或只取收件箱池的列，不要 `select *`。OCR 链保持在后台，不要在列表交互的请求里同步等待下一跳。4 秒轮询只在确实有 pending 时存在，已经如此；不要让它触发整页 RSC 刷新。

### 6. 首屏壳是客户端专用，大页面客户端包在关键路径上

`app-shell.tsx` 用 `next/dynamic(..., { ssr: false })` 加载 `AppShellChrome`。已登录 HTML 里的侧栏和顶栏要等这份 JS。2026-09-03 的硬加载里，壳插入大约 130–240ms，更冷的内容大约 500ms 以后。那次尝试把壳改成服务端渲染，构建失败后回退了。现在代码仍是 `ssr: false`。

没有全局 CSS-in-JS。`framer-motion` 只出现在收据查看器等三处，不在每次点击上。`globals.css` 2047 行随根布局走。费用页再加自己的大 CSS。`lucide-react` 按图标引用，不是整库，但列表页图标很多。

OCR 和 PDF（`puppeteer`、`@sparticuz/chromium`）在 `next.config.mjs` 里标成服务端外部包，只挂在 PDF 和 OCR 路由。普通点击不会去跑它们，除非人正停在会触发 OCR 的收件箱。

快修：把壳拆成可服务端渲染的导航和仅浏览器的命令面板，而不是把整个 `AppShell` 的 `ssr` 开关拨回去。上次那样做会构建失败。

## 建议的修复顺序

| 顺序 | 做什么 | 为什么先做 | 风险 |
| --- | --- | --- | --- |
| 1 | 五个主导航恢复预取，并给项目、发票列表、费用、仪表盘加 `loading.tsx` | 点击立刻有反馈，下一页有机会已经在路上。不改数据和权限 | 低。预取范围必须只限这五项 |
| 2 | 发票列表改为服务端取数，去掉水合后再打的 `/api/invoices` | 每次打开发票少一趟跨洋 HTTP 和一轮登录 | 低。筛选状态要保持 |
| 3 | 项目概览的利润、发票、活动、变更单并行；利润函数内部的成本查询并行 | 缩短这一条最重的 RSC，不改利润口径 | 中。要对照现有利润测试 |
| 4 | 费用列表分页，收窄 `select`；OCR 自调用不挡页面刷新 | 收件箱和总账不再每次拖全表 | 中。收件箱筛选和 OCR 状态要一起验 |
| 5 | 一次导航只 `getUser` 一次 | 每条动态请求都受益 | 高。不能放宽 middleware 或 RLS |
| 6 | 壳的服务端渲染拆分；再决定要不要动区域和索引 | 改善硬刷新。区域应继续靠近 `us-east-2`，除非新的测量证明函数和数据库已经不在一起 | 高。上次整壳 SSR 没有通过构建 |

不要先做的事：把 Vercel 区域改到夏威夷、给财务页加 CDN 缓存、在点击路径上跑 OCR 或 PDF、为了变快合并或跳过登录校验。

这次没有重新测量线上。上面第 1–4 项落地后，应用夏威夷到 `iad1` 的同一次点击再量：点击到骨架、RSC 完成、数据出现。对比页用项目列表、项目详情、发票列表、费用收件箱。
