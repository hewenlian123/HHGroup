# 数据与功能如何串在一起

本文说明 **实体关系**、**界面入口**、**跨页刷新机制**，以及如何用自动化测试把主链路 **跑通**。

## 1. 跨页同步（同一浏览器会话里数据要对齐）

写入数据库（或 Server Action）之后，客户端列表要能更新，靠两层机制：

| 机制                                                              | 作用                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `syncRouterAndClients(router)`（`src/lib/sync-router-client.ts`） | 先 `router.refresh()` 拉最新 RSC，再派发 `hh:app-sync`。                                       |
| `useOnAppSync`（`src/hooks/use-on-app-sync.ts`）                  | 各「纯客户端拉数」页面监听 `hh:app-sync`，**防抖后重新 fetch**，避免 A 页改完 B 页还是旧数据。 |

**约定：** 凡 mutation 后原来只调 `router.refresh()` 的地方，应改为 `syncRouterAndClients`，以便依赖 API/Supabase 的页面一起刷新。

## 2. 核心实体关系（简图）

```
Customer ──┬── Project ──┬── Invoice / Estimate / Documents / Tasks / Bills…
           │             └── Labor entries, Cost allocation, Subcontracts…
Worker ────┴── Labor entries ──┬── Worker balances / Payroll views
                               └── Worker payments ── Receipt (labor_entry_ids)

Vendor ──── Expenses, AP Bills
```

- **项目**是财务与现场数据的枢纽：发票、任务、文档、分包等多挂在 `project_id` 上。
- **劳工**：`labor_entries` 连 `worker_id` + `project_id`；**工人付款**结算条目并写入收据侧数据；删除付款需按业务规则 **回滚结算**（见 API + DB 触发器）。
- **收款**：`payments_received` 等与 `invoice` / `deposits` 有联动逻辑（见 `payments-received-db` 等）。

具体列与约束以 **Supabase migrations** 为准。

## 3. 主链路 UI 路由（按业务流）

| 目的           | 典型路径                                                                       |
| -------------- | ------------------------------------------------------------------------------ |
| 客户与项目     | `/customers` → `/projects` → `/projects/[id]`                                  |
| 对客发票       | `/financial/invoices` → `/financial/invoices/new` → `/financial/invoices/[id]` |
| 劳工与余额     | `/labor/worker-balances` → `/labor/workers/[id]/balance`                       |
| 工时/条目      | `/labor/entries`、`/labor/daily`、`/labor/review`                              |
| 工人付款与收据 | `/labor/payments` → 收据页                                                     |
| 账单（AP）     | `/bills` → `/bills/new` → `/bills/[id]`                                        |
| 任务（挂项目） | `/tasks`                                                                       |

## 4. 如何把「整条链」跑通

### 4.1 本地前置条件

1. `npm run dev`，`E2E_BASE_URL` 默认 `http://localhost:3000`（测试里可改）。
2. **Supabase / 环境变量** 与生产或 staging 对齐；否则大量页面会 `Loading` 或 skip。
3. 建议库里至少有：**1 个 Customer、1 个 Project、1 个 Worker**（否则部分流程会 `test.skip` 或无法创建发票/任务）。

### 4.2 自动化测试分层（由浅到深）

| 命令                                                   | 内容                                                                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:e2e`                                     | 全部 Playwright（含下面各文件）。                                                                                                                                             |
| `npm run test:e2e:integration`                         | **串联导航 + 关联断言**（`tests/integration-data-flow.spec.ts`），不写库或极少写库。                                                                                          |
| `npm run test:e2e:delete-catalog`                      | 各列表 **删除入口** 是否存在（只读）。                                                                                                                                        |
| `E2E_ALLOW_DELETE_MUTATIONS=1 npm run test:e2e:delete` | **创建 → 再删除**（vendor、category、worker、subcontractor、bill、customer、task…）。                                                                                         |
| Worker payment specs / `npm run test:e2e:payment-*`    | **真付款 / 收据 / 删除回滚**。目标为 **localhost** 时默认允许写库；指向线上时请显式 `E2E_ALLOW_PAYMENT_MUTATIONS=1`，本地强制关闭可用 `=0`（见 `tests/e2e-env-helpers.ts`）。 |
| `E2E_ALLOW_DELETE_MUTATIONS`                           | 同上：**本地默认**可跑 create→delete；线上需 `=1` 或勿设 `E2E_BASE_URL` 为外网。                                                                                              |

一起跑可以最大限度证明：**数据能连上、功能能点通、删改后相关页能刷新**。

### 4.3 仍可能「看起来不同步」的情况

- **未接 `useOnAppSync` 的新页面**：mutation 后需补 hook 或改为 RSC 直出。
- **直连 Supabase 的客户端**（如部分 timesheet 流程）与 **走 API 的页面** 混用时，要确保保存后仍调用 `syncRouterAndClients` 或本地 `setState`。
- **多标签页**：`hh:app-sync` 只在当前窗口内；另一标签需刷新或切回触发刷新。

## 5. 后续可增强方向

- **种子数据脚本**：一键插入最小 Customer + Project + Worker，降低 E2E skip。
- **单条「黄金路径」mutation 用例**（可选 env）：建 customer → project → invoice，与现有 delete/mutation 测试并列。

---

_维护：改大功能或数据模型时，请同步更新本页与 `tests/integration-data-flow.spec.ts`。_
